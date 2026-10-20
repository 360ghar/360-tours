import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../api/api_exception.dart';
import '../api/backend_api.dart';
import '../models/api_dtos.dart';
import '../models/models.dart';
import '../models/wire_enums.dart';
import '../storage/local_store.dart';
import 'upload_step_rules.dart';

part 'upload_pipelines.dart';

/// Outcome of advancing a single job one step.
enum _Step { progressed, idle, errored }

/// Persistent, sequential upload pipeline for a captured panorama:
///
///   createTour → presign → putCloudinary → confirm → createScene → publish
///     → [uploadFrames → requestStitch → awaitStitch]
///
/// Each job's `step` is persisted after every success, so a crash or an
/// offline period resumes mid-pipeline without duplicating tours or scenes.
/// The bracketed steps run only when the on-device stitch was the naive
/// fallback: the raw frames go up and the backend re-stitches them.
/// ponytail: single-flight sequential queue — plenty for one-panorama jobs.
class UploadQueue {
  UploadQueue(
    this._store,
    this._api, {
    required this._getAsset,
    required this._saveAsset,
    this._getRooms,
    this._saveRoom,
    this._currentOwnerId,
    Stream<List<ConnectivityResult>>? connectivityChanges,
  }) {
    _connectivitySub =
        (connectivityChanges ?? Connectivity().onConnectivityChanged)
            .listen((results) {
      if (!results.contains(ConnectivityResult.none)) pump();
    });
  }

  static const _collection = 'upload_queue';
  static const _maxAttempts = 8;

  /// Bound on `waiting-auth` parks. `_drain` releases held jobs every pass, so
  /// without this a permanently dead session cycles forever and the row is
  /// stuck on "Uploading…" with no retry, no delete and no error.
  static const _maxAuthHolds = 8;

  /// Backoff never waits longer than this, even when the server asks for more.
  static const _maxDelay = Duration(minutes: 5);

  /// How often a running cloud stitch job is polled, and how long the queue
  /// waits for it before it reports a failure.
  static const stitchPollInterval = Duration(seconds: 5);
  static const stitchTimeout = Duration(minutes: 20);

  final LocalStore _store;
  final BackendApi _api;
  final Future<ScanAsset?> Function(String id) _getAsset;
  final Future<void> Function(ScanAsset asset) _saveAsset;
  final Future<List<Room>> Function(String assetId)? _getRooms;
  final Future<void> Function(Room room)? _saveRoom;

  /// Id of the signed-in account. When set, the queue advances only jobs whose
  /// asset belongs to that account: a job of another account waits, and
  /// nothing runs while nobody is signed in. Unset (tests) means no filter.
  final String? Function()? _currentOwnerId;

  Future<void>? _inFlight;
  bool _rerun = false;
  late final StreamSubscription<List<ConnectivityResult>> _connectivitySub;

  /// Release the connectivity listener; without it the subscription (and the
  /// queue it captures) outlives every owner.
  Future<void> dispose() => _connectivitySub.cancel();

  /// Live view of one asset's queue job (`null` when none). Emits on every
  /// queue write, so the UI can surface backoff, errors and auth-holds
  /// without polling. Backed by LocalStore's broadcast watcher.
  Stream<Map<String, dynamic>?> watchJob(String assetId) =>
      _store.watch(_collection).map((jobs) => jobs
          .where((j) => j['assetId'] == assetId && j['kind'] != 'room')
          .map(Map<String, dynamic>.from)
          .firstOrNull);

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
        .where((j) => j['assetId'] == asset.id && j['kind'] != 'room')
        .map(Map<String, dynamic>.from)
        .firstOrNull;
    if (existing != null && existing['step'] != 'done') {
      if (existing['step'] == 'failed') {
        existing['step'] = resumeStep(existing);
        existing['attempts'] = 0;
        existing['lastError'] = null;
        existing
          ..remove('authHolds')
          ..remove('nextRetryAt');
        await _store.upsert(_collection, existing);
      }
      pump();
      return; // already queued (or just reset from failed)
    }
    final sceneId = asset.remoteSceneId ?? existing?['sceneId'] as String?;
    if (existing != null && sceneId != null) {
      // A finished job and a retry (for example after a cloud stitch that
      // failed). The tour and its main scene exist: reuse them. Never rewind
      // to presign, which uploaded the panorama and created a second scene.
      existing['sceneId'] = sceneId;
      existing['step'] = _stepAfterDone(existing);
      if (existing['step'] == 'uploadFrames') {
        existing['frameIndex'] = 0;
        existing['frameUrls'] = <String>[];
        existing['missingFrames'] = 0;
      }
      existing['attempts'] = 0;
      existing['lastError'] = null;
      existing
        ..remove('nextRetryAt')
        ..remove('authHolds')
        ..remove('stitchJobId')
        ..remove('stitchStartedAt');
      await _store.upsert(_collection, existing);
      pump();
      return;
    }
    await _store.upsert(_collection, {
      'id': asset.id, // one active job per asset
      'kind': 'asset',
      'assetId': asset.id,
      // A tour or scene that already exists (for example a ready asset
      // re-enqueued after a post-publish failure) must never be re-created.
      'step': sceneId != null
          ? 'publish'
          : asset.remoteTourId != null
              ? 'presign'
              : 'createTour',
      'tourId': asset.remoteTourId,
      'sceneId': sceneId,
      // Remembered on the job: a retry flips the asset status, which used to
      // make the queue skip the cloud stitch.
      'cloudStitch': asset.status == AssetStatus.pendingCloudStitch &&
          asset.framePaths.isNotEmpty,
      'attempts': 0,
    });
    pump();
  }

  /// Where a finished job resumes on a retry. A job that needed the cloud
  /// stitch goes back to it: to `requestStitch` when every frame is already
  /// uploaded, else to `uploadFrames`. Anything else only re-publishes.
  String _stepAfterDone(Map<String, dynamic> done) {
    if (done['cloudStitch'] != true) return 'publish';
    final uploaded = (done['frameUrls'] as List?)?.length ?? 0;
    final missing = done['missingFrames'] as int? ?? 0;
    return uploaded >= 2 && missing == 0 ? 'requestStitch' : 'uploadFrames';
  }

  /// Queue an additional room (scene) for an asset that already has a tour.
  /// Idempotent, like [enqueue]: a room whose scene already exists, or whose
  /// job is still working, must not be rewound to `presign` — that re-ran the
  /// pipeline and duplicated the scene.
  Future<void> enqueueRoom(ScanAsset asset, Room room) async {
    final jobs = await _store.readAll(_collection);
    final existing = jobs
        .where((j) => j['id'] == 'room-${room.id}')
        .map(Map<String, dynamic>.from)
        .firstOrNull;

    // The scene already exists remotely: nothing left to upload.
    if (room.remoteSceneId != null) {
      if (existing != null && existing['step'] != 'done') {
        existing['step'] = 'done';
        existing['lastError'] = null;
        await _store.upsert(_collection, existing);
      }
      return;
    }

    if (existing != null && existing['step'] != 'done') {
      // In flight (or held): only a stalled job is reset, and it resumes from
      // its last step rather than restarting the pipeline.
      if (existing['step'] == 'failed' || existing['step'] == 'waiting-auth') {
        existing['step'] = resumeStep(existing);
        existing['attempts'] = 0;
        existing['lastError'] = null;
        existing
          ..remove('authHolds')
          ..remove('nextRetryAt');
        await _store.upsert(_collection, existing);
      }
      pump();
      return;
    }

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
      // Jobs held on auth expiry may retry now (app start, connectivity
      // return, re-auth): reset them to their resume step. A still-expired
      // session re-holds them without burning attempts.
      final held = await _store.readAll(_collection);
      for (final j in held.where((j) => j['step'] == 'waiting-auth')) {
        final fresh = Map<String, dynamic>.from(j);
        fresh['step'] = resumeStep(fresh);
        fresh['attempts'] = 0;
        await _store.upsert(_collection, fresh);
      }
      // Jobs that errored this pass: their backoff Timer owns the retry, so
      // skip them on later inner iterations instead of hammering them while
      // another job keeps progressing. Cleared each outer pass to allow re-pumps.
      final errored = <String>{};
      var progressed = true;
      while (progressed) {
        progressed = false;
        final jobs = await _store.readAll(_collection);
        final pending = jobs
            .where((j) =>
                j['step'] != 'done' &&
                j['step'] != 'failed' &&
                j['step'] != 'waiting-auth')
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
  /// (a timer was scheduled to retry or poll), or is idle/blocked waiting on
  /// another job to finish first.
  Future<_Step> _advance(Map<String, dynamic> job) async {
    final asset = await _getAsset(job['assetId'] as String);
    if (asset == null) {
      job['step'] = 'done'; // asset deleted; drop the job
      await _store.upsert(_collection, job);
      return _Step.progressed;
    }
    final owner = _currentOwnerId;
    if (owner != null && asset.ownerId != owner()) {
      return _Step.idle; // another account's job, or nobody is signed in
    }
    return job['kind'] == 'room'
        ? _advanceRoom(job, asset)
        : _advanceAsset(job, asset);
  }

  /// Shared resume rule: a Cloudinary signature persisted at putCloudinary/
  /// confirm is only valid ~1h, so a crash-restart or long backoff re-signs
  /// instead of burning attempts replaying a stale one.
  void _resetIfPresignStale(Map<String, dynamic> job) {
    if ((job['step'] == 'putCloudinary' || job['step'] == 'confirm') &&
        presignStale(job)) {
      job['step'] = 'presign';
      job.remove('presigned');
      job.remove('presignedAt');
    }
  }

  /// Shared failure handler for both pipelines. [failureAction] decides:
  ///
  /// - expired session: park the job, burn no attempt;
  /// - a 4xx other than 408 and 429: fail now, a retry cannot change the answer;
  /// - Cloudinary rejected the signature: sign again, then retry;
  /// - anything else: bump attempts and retry with exponential backoff (the
  ///   server's `Retry-After` is honoured), or fail after [_maxAttempts].
  ///
  /// A failed job runs [onGiveUp]. Returns true when the job gave up or was
  /// parked (the caller moves on) and false when a retry was queued.
  Future<bool> _failWithBackoff(
    Map<String, dynamic> job,
    Object e, {
    Future<void> Function()? onGiveUp,
  }) async {
    final action = failureAction(e);
    if (action == FailureAction.holdForAuth) {
      final holds = (job['authHolds'] as int? ?? 0) + 1;
      job['authHolds'] = holds;
      job['lastStep'] = job['step'];
      job['lastError'] = 'Session expired — please sign in again';
      job.remove('nextRetryAt');
      // Bounded: a session that never comes back must still reach a terminal
      // state so the asset/room surfaces as failed with retry + delete.
      job['step'] = holds >= _maxAuthHolds ? 'failed' : 'waiting-auth';
      await _store.upsert(_collection, job);
      if (job['step'] == 'failed') await onGiveUp?.call();
      return true; // move on to other jobs
    }
    job['lastError'] = describeError(e);
    if (action == FailureAction.fail) {
      job['lastStep'] = job['step'];
      job['step'] = 'failed';
      job.remove('nextRetryAt');
      await _store.upsert(_collection, job);
      await onGiveUp?.call();
      return true;
    }
    if (action == FailureAction.retryFromPresign) {
      job['step'] = 'presign';
      job.remove('presigned');
      job.remove('presignedAt');
    }
    final attempts = (job['attempts'] as int? ?? 0) + 1;
    job['attempts'] = attempts;
    if (attempts >= _maxAttempts) {
      job['lastStep'] = job['step'];
      job['step'] = 'failed';
      job.remove('nextRetryAt'); // terminal: no countdown, the Retry action shows
      await _store.upsert(_collection, job);
      await onGiveUp?.call();
      return true; // move on to other jobs
    }
    // Exponential backoff capped at 5 minutes, then re-pump. Persist when
    // the next retry fires so the UI can show a live countdown (focus c).
    var delay = Duration(seconds: min(300, pow(2, attempts).toInt() * 5));
    final serverWait = serverRetryAfter(e);
    if (serverWait != null && serverWait > delay) delay = serverWait;
    if (delay > _maxDelay) delay = _maxDelay;
    job['nextRetryAt'] = DateTime.now().add(delay).millisecondsSinceEpoch;
    await _store.upsert(_collection, job);
    Timer(delay, pump);
    return false;
  }

  /// Manual retry for a failed job.
  Future<void> retry(String assetId) async {
    final jobs = await _store.readAll(_collection);
    final failed = jobs
        .where((j) => j['assetId'] == assetId && j['step'] == 'failed')
        .map(Map<String, dynamic>.from)
        .toList();
    for (final fresh in failed) {
      fresh['step'] = resumeStep(fresh);
      fresh['attempts'] = 0;
      fresh['lastError'] = null;
      fresh
        ..remove('authHolds')
        ..remove('nextRetryAt');
      await _store.upsert(_collection, fresh);
    }
    pump();
  }
}
