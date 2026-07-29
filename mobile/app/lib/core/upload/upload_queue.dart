import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../api/backend_api.dart';
import '../models/models.dart';
import '../storage/local_store.dart';

/// Outcome of advancing a single job one step.
enum _Step { progressed, idle, errored }

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
  }) {
    (connectivityChanges ?? Connectivity().onConnectivityChanged)
        .listen((results) {
      if (!results.contains(ConnectivityResult.none)) pump();
    });
  }

  static const _collection = 'upload_queue';
  static const _maxAttempts = 8;

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
        .where((j) =>
            j['assetId'] == asset.id &&
            j['kind'] != 'room' &&
            j['step'] != 'done')
        .map(Map<String, dynamic>.from)
        .firstOrNull;
    if (existing != null) {
      if (existing['step'] == 'failed') {
        existing['step'] = _resumeStep(existing);
        existing['attempts'] = 0;
        existing['lastError'] = null;
        await _store.upsert(_collection, existing);
      }
      pump();
      return; // already queued (or just reset from failed)
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
      var progressed = true;
      while (progressed) {
        progressed = false;
        final jobs = await _store.readAll(_collection);
        final pending = jobs
            .where((j) => j['step'] != 'done' && j['step'] != 'failed')
            .map(Map<String, dynamic>.from)
            .toList();
        if (pending.isEmpty) break;
        for (final job in pending) {
          final id = job['id'] as String;
          if (errored.contains(id)) continue;
          switch (await _advance(job)) {
            case _Step.progressed:
              progressed = true;
            case _Step.errored:
              errored.add(id);
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
              asset.id, (c) => c.copyWith(remoteTourId: tour['id'] as String));
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
                    : AssetStatus.ready);
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
        // The local stitch was the naive fallback: ship the raw frames and
        // ask the backend to re-stitch with OpenCV (it replaces the scene
        // image when the job completes). One frame per pass, resumable.
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
              await _api.uploadToCloudinary(
                  presigned: presigned, file: file);
              await _api.confirmUpload(presigned['upload_id'] as String);
              (job['frameUrls'] as List).add(presigned['public_url']);
            }
            job['frameIndex'] = i + 1;
          }
        case 'requestStitch':
          final urls = List<String>.from(job['frameUrls'] as List? ?? []);
          if (urls.length >= 2) {
            await _api.requestCloudStitch(
              sceneId: job['sceneId'] as String,
              frameUrls: urls,
            );
          }
          // The naive pano stays until the server swaps in the OpenCV one.
          await _saveIfAlive(
              asset.id, (c) => c.copyWith(status: AssetStatus.ready));
          job['step'] = 'done';
      }
      job['attempts'] = 0;
      await _store.upsert(_collection, job);
      return _Step.progressed;
    } catch (e) {
      final gaveUp = await _failWithBackoff(
        job,
        e,
        onGiveUp: () => _saveIfAlive(
            asset.id, (c) => c.copyWith(status: AssetStatus.failed)),
      );
      return gaveUp ? _Step.progressed : _Step.errored;
    }
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
          await saveRoom(room.copyWith(
            remoteSceneId: scene['id'] as String,
            panoramaUrl: job['panoramaUrl'] as String?,
          ));
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

  /// Manual retry for a failed job.
  Future<void> retry(String assetId) async {
    final jobs = await _store.readAll(_collection);
    final failed = jobs
        .where((j) => j['assetId'] == assetId && j['step'] == 'failed')
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
