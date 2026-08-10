import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../api/backend_api.dart';
import '../models/models.dart';
import '../storage/local_store.dart';
import 'upload_queue_steps.dart';
import 'upload_retry_helpers.dart';

/// Outcome of advancing a single job one step.
enum StepResult {
  progressed,
  idle,

  /// The job scheduled its own Timer (poll backoff): skip it for the rest of
  /// this drain pass so concurrent progress cannot advance it early.
  timerScheduled,
  errored,
}

/// In-memory progress snapshot emitted while a job advances. Byte progress
/// comes from the live Dio upload (never persisted); step/attempt/frame
/// counts are also persisted in the queue store for restarts.
class UploadProgress {
  const UploadProgress({
    required this.assetId,
    required this.step,
    this.attempt = 0,
    this.framesUploaded = 0,
    this.framesTotal = 0,
    this.bytesFraction,
  });

  final String assetId;

  /// createTour | presign | putCloudinary | confirm | createScene | publish |
  /// uploadFrames | requestStitch | pollStitch | done | failed | stitchFailed
  final String step;
  final int attempt;
  final int framesUploaded;
  final int framesTotal;

  /// 0..1 while a single file upload is in flight; null otherwise.
  final double? bytesFraction;
}

/// Persistent, sequential upload pipeline for a captured panorama:
///
///   createTour → presign → putCloudinary → confirm → createScene → publish
///             → (background) uploadFrames → requestStitch → pollStitch
///
/// Each job's `step` is persisted after every success, so a crash or an
/// offline period resumes mid-pipeline without duplicating tours. The tour is
/// published BEFORE refinement frames are uploaded: cloud refinement never
/// blocks tour availability, and its failure never marks the asset failed.
/// ponytail: single-flight sequential queue — plenty for one-panorama jobs.
///
/// The per-step logic lives in [UploadStepsRunner] (upload_queue_steps.dart)
/// so both files stay under the ARCHITECTURE.md size limits.
class UploadQueue {
  UploadQueue(
    this._store,
    this._api, {
    required this._getAsset,
    required this._saveAsset,
    this._getRooms,
    this._saveRoom,
    Stream<List<ConnectivityResult>>? connectivityChanges,
    Duration Function(int polls)? pollInterval,
  }) : _pollInterval = pollInterval ?? _defaultPollInterval {
    _steps = UploadStepsRunner(
      store: _store,
      api: _api,
      getAsset: _getAsset,
      saveAsset: _saveAsset,
      getRooms: _getRooms,
      saveRoom: _saveRoom,
      pollInterval: _pollInterval,
      progress: _progress,
      pump: pump,
    );
    (connectivityChanges ?? Connectivity().onConnectivityChanged).listen(
      (results) {
        if (!results.contains(ConnectivityResult.none)) pump();
      },
    );
  }

  /// 3s, doubling to a 20s cap every 5 polls (injectable for tests).
  static Duration _defaultPollInterval(int polls) =>
      Duration(seconds: min(20, 3 * pow(2, min(polls ~/ 5, 3))).toInt());

  static const _collection = 'upload_queue';

  final Duration Function(int polls) _pollInterval;

  final LocalStore _store;
  final BackendApi _api;
  final Future<ScanAsset?> Function(String id) _getAsset;
  final Future<void> Function(ScanAsset asset) _saveAsset;
  final Future<List<Room>> Function(String assetId)? _getRooms;
  final Future<void> Function(Room room)? _saveRoom;

  late final UploadStepsRunner _steps;

  /// Live progress for the UI (byte progress cannot be persisted).
  final _progress = StreamController<UploadProgress>.broadcast();
  Stream<UploadProgress> get progress => _progress.stream;

  /// Persisted queue-job snapshots for [assetId] (step, attempts, lastError,
  /// framesTotal, frameUrlsByIndex). Re-emits on every persisted transition,
  /// so the UI can show the exact pipeline step across restarts.
  Stream<Map<String, dynamic>?> watchJob(String assetId) => _store
      .watch(_collection)
      .map(
        (items) => items
            .where((j) => j['assetId'] == assetId && j['kind'] != 'room')
            .map(Map<String, dynamic>.from)
            .firstOrNull,
      );

  Future<void>? _inFlight;
  bool _rerun = false;

  /// Re-reads the asset and applies [apply] to the FRESH copy before saving,
  /// so fields changed concurrently (a user rename, etc.) are not clobbered
  /// by a stale snapshot captured earlier. Returns false when the asset no
  /// longer exists.
  Future<bool> _saveIfAlive(
    String assetId,
    ScanAsset Function(ScanAsset current) apply,
  ) async {
    final current = await _getAsset(assetId);
    if (current == null) return false;
    await _saveAsset(apply(current));
    return true;
  }

  Future<void> enqueue(ScanAsset asset) async {
    final jobs = await _store.readAll(_collection);
    final existing = jobs
        .where(
          (j) =>
              j['assetId'] == asset.id &&
              j['kind'] != 'room' &&
              j['step'] != 'done',
        )
        .map(Map<String, dynamic>.from)
        .firstOrNull;
    if (existing != null) {
      if (existing['step'] == 'failed' || existing['step'] == 'stitchFailed') {
        existing['step'] = resumeStepFor(existing);
        existing['attempts'] = 0;
        existing['lastError'] = null;
        await _store.upsert(_collection, existing);
      }
      pump();
      return; // already queued (or just reset from failed/stitchFailed)
    }
    await _store.upsert(_collection, {
      'id': asset.id, // one active job per asset
      'kind': 'asset',
      'assetId': asset.id,
      'step': 'createTour',
      'attempts': 0,
      'startedAtMs': DateTime.now().millisecondsSinceEpoch,
    });
    pump();
  }

  /// Queue an additional room (scene) for an asset that already has a tour.
  Future<void> enqueueRoom(ScanAsset asset, Room room) async {
    await _store.upsert(_collection, {
      'id': 'room-${room.id}',
      'kind': 'room',
      'assetId': asset.id,
      'roomId': room.id,
      'step': 'presign',
      'attempts': 0,
      'startedAtMs': DateTime.now().millisecondsSinceEpoch,
    });
    pump();
  }

  /// Drive the queue. Safe to call any time; awaiting it waits for the
  /// current drain to finish. Each pass tries every pending job once, so a
  /// job that errors (backoff scheduled) or is blocked can't starve others.
  Future<void> pump() {
    final inFlight = _inFlight;
    if (inFlight != null) {
      _rerun = true; // pick up jobs enqueued mid-drain
      return inFlight;
    }
    return _inFlight = _drain().whenComplete(() => _inFlight = null);
  }

  Future<void> _drain() async {
    do {
      _rerun = false;
      // Jobs that errored this pass: their backoff Timer owns the retry, so
      // skip them on later inner iterations instead of hammering them while
      // another job keeps progressing. Cleared each outer pass to allow re-pumps.
      final errored = <String>{};
      // Jobs that scheduled their own poll Timer: advancing them again while
      // another job progresses would defeat the delay and could exhaust the
      // poll budget prematurely. Blocked (non-timer) jobs like a room
      // waiting for its tour are NOT added — they must be re-tried as the
      // asset job progresses.
      final waiting = <String>{};
      var progressed = true;
      while (progressed) {
        progressed = false;
        final jobs = await _store.readAll(_collection);
        final pending = jobs
            .where(
              (j) =>
                  j['step'] != 'done' &&
                  j['step'] != 'failed' &&
                  j['step'] != 'stitchFailed',
            )
            .map(Map<String, dynamic>.from)
            .toList();
        if (pending.isEmpty) break;
        for (final job in pending) {
          final id = job['id'] as String;
          if (errored.contains(id) || waiting.contains(id)) continue;
          switch (await _advance(job)) {
            case StepResult.progressed:
              progressed = true;
            case StepResult.errored:
              errored.add(id);
            case StepResult.timerScheduled:
              waiting.add(id);
            case StepResult.idle:
              break;
          }
        }
      }
    } while (_rerun);
  }

  /// Runs one step of one job. Reports whether the job progressed, errored
  /// (a backoff retry was scheduled), or is idle/blocked waiting on another
  /// job to finish first.
  Future<StepResult> _advance(Map<String, dynamic> job) async {
    final asset = await _getAsset(job['assetId'] as String);
    if (asset == null) {
      job['step'] = 'done'; // asset deleted; drop the job
      await _store.upsert(_collection, job);
      return StepResult.progressed;
    }
    if (job['kind'] == 'room') return _advanceRoomStep(job, asset);
    // The step being processed (the switch mutates job['step']): progress
    // events must name the step that ran, not the next one.
    final stepBefore = job['step'] as String;
    try {
      final outcome = await _steps.runAssetStep(job, asset);
      if (outcome != null) return outcome; // timerScheduled / idle
      job['attempts'] = 0;
      await _store.upsert(_collection, job);
      _emitProgress(job, stepBefore);
      return StepResult.progressed;
    } catch (e) {
      // Cloud refinement never loses the user's capture: on give-up the
      // local panorama stays published (`ready`) and the failure is flagged
      // for the "retry refinement / use current panorama" UX. The same
      // applies to frame upload: the tour is ALREADY LIVE at that point, so
      // a frame-upload give-up must not mark the asset failed.
      final refinementStep = job['step'] == 'uploadFrames' ||
          job['step'] == 'requestStitch' ||
          job['step'] == 'pollStitch';
      final gaveUp = await _steps.failWithBackoff(
        job,
        e,
        onGiveUp: refinementStep
            ? () async {
                await _steps.markStitchFailed(asset);
                job['step'] = 'stitchFailed';
                await _store.upsert(_collection, job);
              }
            : () => _saveIfAlive(
                asset.id,
                (c) => c.copyWith(status: AssetStatus.failed),
              ),
      );
      _emitProgress(job, stepBefore);
      return gaveUp ? StepResult.progressed : StepResult.errored;
    }
  }

  void _emitProgress(Map<String, dynamic> job, String step) {
    if (step == 'done' || step == 'failed' || step == 'stitchFailed') return;
    final uploaded = Map<String, dynamic>.from(
      job['frameUrlsByIndex'] as Map? ?? {},
    );
    _progress.add(UploadProgress(
      assetId: job['assetId'] as String,
      step: step,
      attempt: job['attempts'] as int? ?? 0,
      framesUploaded: uploaded.length,
      framesTotal: job['framesTotal'] as int? ?? 0,
    ));
  }

  /// Manual retry for a failed job (upload failure or cloud refinement).
  Future<void> retry(String assetId) async {
    final jobs = await _store.readAll(_collection);
    final failed = jobs
        .where(
          (j) =>
              j['assetId'] == assetId &&
              (j['step'] == 'failed' || j['step'] == 'stitchFailed'),
        )
        .map(Map<String, dynamic>.from)
        .toList();
    for (final fresh in failed) {
      fresh['step'] = resumeStepFor(fresh);
      fresh['attempts'] = 0;
      fresh['lastError'] = null;
      await _store.upsert(_collection, fresh);
    }
    pump();
  }

  /// Room (additional scene) pipeline: presign → put → confirm → createScene.
  Future<StepResult> _advanceRoomStep(
    Map<String, dynamic> job,
    ScanAsset asset,
  ) async {
    final getRooms = _getRooms;
    final saveRoom = _saveRoom;
    final tourId = asset.remoteTourId;
    if (getRooms == null || saveRoom == null || tourId == null) {
      // Tour not created yet — wait for the asset job to finish first.
      return StepResult.idle;
    }
    final rooms = await getRooms(asset.id);
    final room = rooms.where((r) => r.id == job['roomId']).firstOrNull;
    if (room == null) {
      job['step'] = 'done';
      await _store.upsert(_collection, job);
      return StepResult.progressed;
    }
    try {
      switch (job['step'] as String) {
        case 'presign':
          final pano = room.panoramaPath;
          if (pano == null || !File(pano).existsSync()) {
            throw StateError('room panorama missing');
          }
          if (job['presigned'] == null) {
            job['presigned'] = await _api.createPresignedUpload(
              filename: 'panorama.jpg',
              folderType: 'tour',
              tourId: tourId,
              fileSize: File(pano).lengthSync(),
            );
          }
          job['step'] = 'putCloudinary';
        case 'putCloudinary':
          await _api.uploadToCloudinary(
            presigned: Map<String, dynamic>.from(job['presigned'] as Map),
            file: File(room.panoramaPath!),
          );
          _steps.log(job, 'cloudinary', 'room panorama uploaded',
              step: 'putCloudinary');
          job['step'] = 'confirm';
        case 'confirm':
          final presigned = Map<String, dynamic>.from(job['presigned'] as Map);
          await _api.confirmUpload(presigned['upload_id'] as String);
          job['panoramaUrl'] = presigned['public_url'];
          job['step'] = 'createScene';
        case 'createScene':
          // Reconcile first (same duplicate-scene protection as the asset).
          var sceneId = job['sceneId'] as String?;
          if (sceneId == null) {
            final existing = await _api.getTourScenes(tourId);
            for (final s in existing) {
              if (s['image_url'] == job['panoramaUrl']) {
                sceneId = s['id'] as String?;
                break;
              }
            }
          }
          if (sceneId == null) {
            final scene = await _api.createScene(
              tourId: tourId,
              imageUrl: job['panoramaUrl'] as String,
              title: room.name,
              orderIndex: rooms.indexWhere((r) => r.id == room.id) + 1,
            );
            sceneId = scene['id'];
          }
          await saveRoom(
            room.copyWith(
              remoteSceneId: sceneId,
              panoramaUrl: job['panoramaUrl'] as String?,
            ),
          );
          job['sceneId'] = sceneId;
          job['step'] = 'done';
      }
      job['attempts'] = 0;
      await _store.upsert(_collection, job);
      return StepResult.progressed;
    } catch (e) {
      final gaveUp = await _steps.failWithBackoff(job, e);
      return gaveUp ? StepResult.progressed : StepResult.errored;
    }
  }
}
