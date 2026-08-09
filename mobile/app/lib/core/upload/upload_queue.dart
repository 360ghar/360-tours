import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../api/backend_api.dart';
import '../models/models.dart';
import '../storage/local_store.dart';

/// Outcome of advancing a single job one step.
enum _Step {
  progressed,
  idle,

  /// The job scheduled its own Timer (poll backoff): skip it for the rest of
  /// this drain pass so concurrent progress cannot advance it early.
  timerScheduled,
  errored,
}

/// Persistent, sequential upload pipeline for a captured panorama:
///
///   createTour → presign → putCloudinary → confirm → createScene → publish
///
/// Each job's `step` is persisted after every success, so a crash or an
/// offline period resumes mid-pipeline without duplicating tours.
/// ponytail: single-flight sequential queue — plenty for one-panorama jobs.
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
    (connectivityChanges ?? Connectivity().onConnectivityChanged).listen((
      results,
    ) {
      if (!results.contains(ConnectivityResult.none)) pump();
    });
  }

  /// 3s, doubling to a 20s cap every 5 polls (injectable for tests).
  static Duration _defaultPollInterval(int polls) =>
      Duration(seconds: min(20, 3 * pow(2, min(polls ~/ 5, 3))).toInt());

  static const _collection = 'upload_queue';
  static const _maxAttempts = 8;

  /// Maximum polls of a cloud-stitch job (3s→20s intervals, ~11 min cap;
  /// the backend stitch itself is bounded by a 5 min timeout).
  static const int maxStitchPolls = 40;

  final Duration Function(int polls) _pollInterval;

  final LocalStore _store;
  final BackendApi _api;
  final Future<ScanAsset?> Function(String id) _getAsset;
  final Future<void> Function(ScanAsset asset) _saveAsset;
  final Future<List<Room>> Function(String assetId)? _getRooms;
  final Future<void> Function(Room room)? _saveRoom;

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
        existing['step'] = _resumeStep(existing);
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
            case _Step.progressed:
              progressed = true;
            case _Step.errored:
              errored.add(id);
            case _Step.timerScheduled:
              waiting.add(id);
            case _Step.idle:
              break;
          }
        }
      }
    } while (_rerun);
  }

  /// Runs one step of one job. Reports whether the job progressed, errored
  /// (a backoff retry was scheduled), or is idle/blocked waiting on another
  /// job to finish first.
  Future<_Step> _advance(Map<String, dynamic> job) async {
    final asset = await _getAsset(job['assetId'] as String);
    if (asset == null) {
      job['step'] = 'done'; // asset deleted; drop the job
      await _store.upsert(_collection, job);
      return _Step.progressed;
    }
    if (job['kind'] == 'room') return _advanceRoom(job, asset);
    try {
      switch (job['step'] as String) {
        case 'createTour':
          final tour = await _api.createTour(title: asset.name);
          job['tourId'] = tour['id'];
          await _saveIfAlive(
            asset.id,
            (c) => c.copyWith(remoteTourId: tour['id'] as String),
          );
          job['step'] = 'presign';
        case 'presign':
          final pano = asset.panoramaPath;
          if (pano == null || !File(pano).existsSync()) {
            throw StateError('panorama file missing');
          }
          final presigned = await _api.createPresignedUpload(
            filename: 'panorama.jpg',
            folderType: 'tour',
            tourId: job['tourId'] as String,
            fileSize: File(pano).lengthSync(),
          );
          job['presigned'] = presigned;
          job['step'] = 'putCloudinary';
        case 'putCloudinary':
          await _api.uploadToCloudinary(
            presigned: Map<String, dynamic>.from(job['presigned'] as Map),
            file: File(asset.panoramaPath!),
          );
          job['step'] = 'confirm';
        case 'confirm':
          final presigned = Map<String, dynamic>.from(job['presigned'] as Map);
          await _api.confirmUpload(presigned['upload_id'] as String);
          job['panoramaUrl'] = presigned['public_url'];
          job['step'] = 'createScene';
        case 'createScene':
          final scene = await _api.createScene(
            tourId: job['tourId'] as String,
            imageUrl: job['panoramaUrl'] as String,
            title: asset.name,
            orderIndex: 0,
          );
          job['sceneId'] = scene['id'];
          job['step'] = 'publish';
        case 'publish':
          final tour = await _api.publishTour(job['tourId'] as String);
          final needsCloudStitch =
              asset.status == AssetStatus.pendingCloudStitch &&
              asset.framePaths.isNotEmpty;
          final panoramaUrl = job['panoramaUrl'] as String?;
          final shareCode = tour['short_code'] as String?;
          // copyWith treats an explicit null as "reset", so only apply these
          // when produced — a transient null must not wipe an existing value.
          await _saveIfAlive(asset.id, (c) {
            var u = c.copyWith(
              status: needsCloudStitch
                  ? AssetStatus.pendingCloudStitch
                  : AssetStatus.ready,
            );
            if (panoramaUrl != null) u = u.copyWith(panoramaUrl: panoramaUrl);
            if (shareCode != null) u = u.copyWith(shareCode: shareCode);
            return u;
          });
          if (needsCloudStitch) {
            job['frameIndex'] = 0;
            job['frameUrls'] = <String>[];
            job['step'] = 'uploadFrames';
          } else {
            job['step'] = 'done';
          }
        // The local stitch was the naive blend: ship the raw frames and ask
        // the backend to re-stitch with the metadata-driven cloud stitcher.
        // One frame per pass, resumable. The naive pano stays live until the
        // cloud result passes validation and replaces the scene image.
        case 'uploadFrames':
          final i = job['frameIndex'] as int? ?? 0;
          final frames = asset.framePaths;
          if (i >= frames.length) {
            job['step'] = 'requestStitch';
          } else {
            final file = File(frames[i]);
            if (file.existsSync()) {
              final presigned = await _api.createPresignedUpload(
                filename: 'frame_$i.jpg',
                folderType: 'tour',
                tourId: job['tourId'] as String,
                fileSize: file.lengthSync(),
              );
              await _api.uploadToCloudinary(presigned: presigned, file: file);
              await _api.confirmUpload(presigned['upload_id'] as String);
              (job['frameUrls'] as List).add(presigned['public_url']);
              // Persist the ORIGINAL frame index with each uploaded URL so
              // cloud metadata stays aligned even when a frame is missing
              // (missing files are skipped above and shift nothing).
              final sourceIndices =
                  (job['frameSourceIndices'] as List?) ?? <int>[];
              sourceIndices.add(i);
              job['frameSourceIndices'] = sourceIndices;
            }
            job['frameIndex'] = i + 1;
          }
        case 'requestStitch':
          final urls = List<String>.from(job['frameUrls'] as List? ?? []);
          if (urls.length < 2) {
            // Frames disappeared; refinement is impossible but the local
            // panorama is already published.
            await _saveIfAlive(
              asset.id,
              (c) => c.copyWith(status: AssetStatus.ready),
            );
            job['step'] = 'done';
          } else {
            // Only legacy captures (no recorded orientations) skip the
            // metadata payload — the backend falls back to its legacy path.
            final sourceIndices = (job['frameSourceIndices'] as List?)
                ?.cast<int>();
            final metadata =
                asset.frameOrientations.isNotEmpty &&
                    sourceIndices != null &&
                    sourceIndices.length == urls.length
                ? _frameMetadata(asset, urls, sourceIndices)
                : null;
            final response = await _api.requestCloudStitch(
              sceneId: job['sceneId'] as String,
              frameUrls: urls,
              frames: metadata,
              cameraProfile: metadata != null ? _cameraProfile(asset) : null,
            );
            job['stitchJobId'] = response['id'];
            job['pollCount'] = 0;
            job['step'] = 'pollStitch';
          }
        case 'pollStitch':
          final jobId = job['stitchJobId'] as String?;
          if (jobId == null) {
            await _markStitchFailed(asset);
            job['step'] = 'stitchFailed';
          } else {
            // Honor the backoff interval even if another pump re-advances
            // this job early (external pumps, retries): the scheduled Timer
            // owns the next poll.
            final nextAt = job['nextPollAt'] as int? ?? 0;
            final now = DateTime.now().millisecondsSinceEpoch;
            if (now < nextAt) {
              await _store.upsert(_collection, job);
              return _Step.idle;
            }
            final status = await _api.getAiJob(jobId);
            final state = status['status'] as String? ?? 'unknown';
            if (state == 'completed') {
              // The backend replaces the scene image only when the cloud
              // panorama passed its own quality validation. The refined
              // image URL may arrive under result OR job.output_data (the
              // web client reads both shapes).
              final result = Map<String, dynamic>.from(
                status['result'] as Map? ?? {},
              );
              final output = Map<String, dynamic>.from(
                status['output_data'] as Map? ?? {},
              );
              final imageUrl =
                  (result['image_url'] ?? output['image_url']) as String?;
              await _saveIfAlive(
                asset.id,
                (c) => c.copyWith(
                  status: AssetStatus.ready,
                  cloudStitchFailed: false,
                  panoramaUrl: imageUrl ?? c.panoramaUrl,
                ),
              );
              job['step'] = 'done';
            } else if (state == 'failed' ||
                state == 'canceled' ||
                state == 'cancelled') {
              await _markStitchFailed(asset);
              job['step'] = 'stitchFailed';
            } else {
              // Still pending/processing: poll again with a bounded interval.
              final polls = (job['pollCount'] as int? ?? 0) + 1;
              job['pollCount'] = polls;
              if (polls > maxStitchPolls) {
                await _markStitchFailed(asset);
                job['step'] = 'stitchFailed';
              } else {
                final interval = _pollInterval(polls);
                job['nextPollAt'] = DateTime.now()
                    .add(interval)
                    .millisecondsSinceEpoch;
                await _store.upsert(_collection, job);
                Timer(interval, pump);
                return _Step.timerScheduled;
              }
            }
          }
      }
      job['attempts'] = 0;
      await _store.upsert(_collection, job);
      return _Step.progressed;
    } catch (e) {
      // Cloud refinement never loses the user's capture: on give-up the
      // local panorama stays published (`ready`) and the failure is flagged
      // for the "retry refinement / use current panorama" UX.
      final stitchStep =
          job['step'] == 'requestStitch' || job['step'] == 'pollStitch';
      final gaveUp = await _failWithBackoff(
        job,
        e,
        onGiveUp: stitchStep
            ? () async {
                await _markStitchFailed(asset);
                job['step'] = 'stitchFailed';
                await _store.upsert(_collection, job);
              }
            : () => _saveIfAlive(
                asset.id,
                (c) => c.copyWith(status: AssetStatus.failed),
              ),
      );
      return gaveUp ? _Step.progressed : _Step.errored;
    }
  }

  /// Marks the asset "published with the local panorama; cloud refinement
  /// failed" — never `failed` (the tour is live).
  Future<void> _markStitchFailed(ScanAsset asset) => _saveIfAlive(
    asset.id,
    (c) => c.copyWith(status: AssetStatus.ready, cloudStitchFailed: true),
  );

  /// Per-frame metadata for the cloud stitcher, parallel to [urls].
  /// [sourceIndices] maps each uploaded URL back to its ORIGINAL frame index
  /// so yaw/pitch/roll/target/low_quality stay aligned even when a raw frame
  /// file was missing (and therefore never uploaded).
  List<Map<String, dynamic>> _frameMetadata(
    ScanAsset asset,
    List<String> urls,
    List<int> sourceIndices,
  ) {
    final orientations = asset.frameOrientations;
    final indices = asset.frameTargetIndices;
    final lowQuality = asset.frameLowQuality;
    return [
      for (var k = 0; k < urls.length; k++)
        {
          'url': urls[k],
          'yaw': (() {
            final i = k < sourceIndices.length ? sourceIndices[k] : k;
            return i < orientations.length ? orientations[i].yaw : 0.0;
          })(),
          'pitch': (() {
            final i = k < sourceIndices.length ? sourceIndices[k] : k;
            return i < orientations.length ? orientations[i].pitch : 0.0;
          })(),
          'roll': (() {
            final i = k < sourceIndices.length ? sourceIndices[k] : k;
            return i < orientations.length ? orientations[i].roll : 0.0;
          })(),
          'target_index': (() {
            final i = k < sourceIndices.length ? sourceIndices[k] : k;
            return indices != null && i < indices.length ? indices[i] : null;
          })(),
          'low_quality': (() {
            final i = k < sourceIndices.length ? sourceIndices[k] : k;
            return lowQuality != null && i < lowQuality.length && lowQuality[i];
          })(),
        },
    ];
  }

  Map<String, dynamic>? _cameraProfile(ScanAsset asset) {
    final h = asset.captureHFovDeg;
    if (h == null || h <= 0) return null;
    return {'horizontal_fov': h, 'vertical_fov': asset.captureVFovDeg ?? 69.0};
  }

  /// Room (additional scene) pipeline: presign → put → confirm → createScene.
  Future<_Step> _advanceRoom(Map<String, dynamic> job, ScanAsset asset) async {
    final getRooms = _getRooms;
    final saveRoom = _saveRoom;
    final tourId = asset.remoteTourId;
    if (getRooms == null || saveRoom == null || tourId == null) {
      // Tour not created yet — wait for the asset job to finish first.
      return _Step.idle;
    }
    final rooms = await getRooms(asset.id);
    final room = rooms.where((r) => r.id == job['roomId']).firstOrNull;
    if (room == null) {
      job['step'] = 'done';
      await _store.upsert(_collection, job);
      return _Step.progressed;
    }
    try {
      switch (job['step'] as String) {
        case 'presign':
          final pano = room.panoramaPath;
          if (pano == null || !File(pano).existsSync()) {
            throw StateError('room panorama missing');
          }
          job['presigned'] = await _api.createPresignedUpload(
            filename: 'panorama.jpg',
            folderType: 'tour',
            tourId: tourId,
            fileSize: File(pano).lengthSync(),
          );
          job['step'] = 'putCloudinary';
        case 'putCloudinary':
          await _api.uploadToCloudinary(
            presigned: Map<String, dynamic>.from(job['presigned'] as Map),
            file: File(room.panoramaPath!),
          );
          job['step'] = 'confirm';
        case 'confirm':
          final presigned = Map<String, dynamic>.from(job['presigned'] as Map);
          await _api.confirmUpload(presigned['upload_id'] as String);
          job['panoramaUrl'] = presigned['public_url'];
          job['step'] = 'createScene';
        case 'createScene':
          final scene = await _api.createScene(
            tourId: tourId,
            imageUrl: job['panoramaUrl'] as String,
            title: room.name,
            orderIndex: rooms.indexWhere((r) => r.id == room.id) + 1,
          );
          await saveRoom(
            room.copyWith(
              remoteSceneId: scene['id'] as String,
              panoramaUrl: job['panoramaUrl'] as String?,
            ),
          );
          job['step'] = 'done';
      }
      job['attempts'] = 0;
      await _store.upsert(_collection, job);
      return _Step.progressed;
    } catch (e) {
      final gaveUp = await _failWithBackoff(job, e);
      return gaveUp ? _Step.progressed : _Step.errored;
    }
  }

  /// Shared failure handler for both pipelines: bumps attempts, records the
  /// error and step, then either marks the job failed (after [_maxAttempts],
  /// running [onGiveUp]) or schedules an exponential-backoff re-pump. Returns
  /// true when the job gave up (so the caller moves on) and false when a
  /// backoff retry was queued.
  Future<bool> _failWithBackoff(
    Map<String, dynamic> job,
    Object e, {
    Future<void> Function()? onGiveUp,
  }) async {
    final attempts = (job['attempts'] as int? ?? 0) + 1;
    job['attempts'] = attempts;
    job['lastError'] = e.toString();
    if (attempts >= _maxAttempts) {
      job['lastStep'] = job['step'];
      job['step'] = 'failed';
      await _store.upsert(_collection, job);
      await onGiveUp?.call();
      return true; // move on to other jobs
    }
    await _store.upsert(_collection, job);
    // Exponential backoff capped at 5 minutes, then re-pump.
    final delay = Duration(seconds: min(300, pow(2, attempts).toInt() * 5));
    Timer(delay, pump);
    return false;
  }

  /// Computes the step a failed job should resume from. Never restarts before
  /// `presign` once a tour already exists (duplicate-tour risk), and
  /// re-presigns when the stored Cloudinary signature is likely expired.
  String _resumeStep(Map<String, dynamic> job) {
    // Cloud refinement is optional: a failed/abandoned stitch job re-requests
    // a fresh stitch (frames stay uploaded; the local panorama is live).
    if (job['step'] == 'stitchFailed' || job['stitchJobId'] != null) {
      job.remove('stitchJobId');
      job.remove('pollCount');
      return 'requestStitch';
    }
    final defaultStep = job['kind'] == 'room' ? 'presign' : 'createTour';
    var step = (job['lastStep'] as String?) ?? defaultStep;
    // A tour already exists — don't recreate it.
    if (step == 'createTour' && job['tourId'] != null) step = 'presign';
    // The stored Cloudinary signature/timestamp is likely expired by now.
    if (step == 'putCloudinary' || step == 'confirm') {
      step = 'presign';
      job.remove('presigned');
    }
    return step;
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
      fresh['step'] = _resumeStep(fresh);
      fresh['attempts'] = 0;
      fresh['lastError'] = null;
      await _store.upsert(_collection, fresh);
    }
    pump();
  }
}
