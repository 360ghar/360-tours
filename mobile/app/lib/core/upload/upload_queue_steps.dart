// Per-step pipeline logic for UploadQueue (kept in its own file so both
// files respect the ARCHITECTURE.md size limits).

import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../api/backend_api.dart';
import '../models/models.dart';
import '../storage/local_store.dart';
import 'upload_queue.dart';
import 'upload_retry_helpers.dart';

/// Executes the individual pipeline steps for [UploadQueue]. Owns no state
/// beyond its dependencies; every job's state is persisted by the queue.
///
/// Reliability contract:
///  * the tour is published BEFORE refinement frames are uploaded — cloud
///    refinement never blocks availability, and its failure never marks the
///    asset failed;
///  * each step persists server-generated ids (tourId, sceneId, stitchJobId)
///    immediately, so a crash resumes instead of duplicating;
///  * createScene reconciles against the tour's scenes (idempotent);
///  * a stored stitchJobId resumes polling instead of re-requesting;
///  * permanent 4xx fail fast with the backend detail; 5xx/network use
///    bounded exponential backoff.
class UploadStepsRunner {
  UploadStepsRunner({
    required this.store,
    required this.api,
    required this.getAsset,
    required this.saveAsset,
    required this.getRooms,
    required this.saveRoom,
    required this.pollInterval,
    required this.progress,
    required this.pump,
  });

  static const _collection = 'upload_queue';
  static const _maxAttempts = 8;

  /// Frames uploaded concurrently per pass (bounded; never 24 parallel).
  /// Each frame is 3 HTTP round trips, so 2-wide keeps the upload ~2x faster
  /// than sequential without hammering the backend.
  static const frameBatchSize = 2;

  /// Maximum polls of a cloud-stitch job (3s→20s intervals, ~11 min cap;
  /// the backend stitch itself is bounded by a 5 min timeout).
  static const maxStitchPolls = 40;

  final LocalStore store;
  final BackendApi api;
  final Future<ScanAsset?> Function(String id) getAsset;
  final Future<void> Function(ScanAsset asset) saveAsset;
  final Future<List<Room>> Function(String assetId)? getRooms;
  final Future<void> Function(Room room)? saveRoom;
  final Duration Function(int polls) pollInterval;
  final StreamController<UploadProgress> progress;
  final Future<void> Function() pump;

  /// Re-reads the asset and applies [apply] to the FRESH copy before saving,
  /// so fields changed concurrently are not clobbered. False when gone.
  Future<bool> _saveIfAlive(
    String assetId,
    ScanAsset Function(ScanAsset current) apply,
  ) async {
    final current = await getAsset(assetId);
    if (current == null) return false;
    await saveAsset(apply(current));
    return true;
  }

  /// Structured, redacted pipeline log. Never logs JWTs, secrets or full
  /// signed URLs. Tags follow the production-E2E spec.
  void log(
    Map<String, dynamic> job,
    String tag,
    String message, {
    String? step,
    Object? error,
  }) {
    final assetId = (job['assetId'] as String?) ?? '?';
    final tourId = _short(job['tourId'] as String?);
    final sceneId = _short(job['sceneId'] as String?);
    final started = job['startedAtMs'] as int?;
    final elapsed = started == null
        ? ''
        : ' ${DateTime.now().millisecondsSinceEpoch - started}ms';
    final attempt = '${job['attempts'] as int? ?? 0}';
    final err = error == null ? '' : ' err=$error';
    final s = step ?? job['step'] as String? ?? '?';
    debugPrint(
      '[$tag] asset=$assetId tour=$tourId scene=$sceneId '
      'job=${job['id']} step=$s attempt=$attempt$elapsed$err '
      'msg=$message',
    );
  }

  static String _short(String? id) =>
      id == null ? '-' : (id.length <= 8 ? id : id.substring(0, 8));

  /// Marks the asset "published with the local panorama; cloud refinement
  /// failed" — never `failed` (the tour is live).
  Future<void> markStitchFailed(ScanAsset asset) => _saveIfAlive(
    asset.id,
    (c) => c.copyWith(
      status: AssetStatus.ready,
      cloudStitchFailed: true,
      cloudStitchPending: false,
    ),
  );

  /// Shared failure handler: bumps attempts, records the error and step,
  /// then either marks the job failed (after [_maxAttempts], running
  /// [onGiveUp]) or schedules an exponential-backoff re-pump. Returns true
  /// when the job gave up, false when a backoff retry was queued.
  ///
  /// Permanent 4xx (validation, auth after the one refresh replay, not-found)
  /// fail immediately with the backend detail as the actionable error.
  /// 408/429/5xx/network errors use bounded backoff.
  Future<bool> failWithBackoff(
    Map<String, dynamic> job,
    Object e, {
    Future<void> Function()? onGiveUp,
  }) async {
    final attempts = (job['attempts'] as int? ?? 0) + 1;
    job['attempts'] = attempts;
    job['lastError'] = describeUploadError(e);
    final permanent = isPermanent4xx(e);
    if (permanent) {
      log(job, 'upload', 'permanent failure', error: job['lastError'],
          step: job['step'] as String?);
      job['lastStep'] = job['step'];
      job['step'] = 'failed';
      await store.upsert(_collection, job);
      await onGiveUp?.call();
      return true;
    }
    if (attempts >= _maxAttempts) {
      log(job, 'upload', 'gave up after $attempts attempts',
          error: job['lastError'], step: job['step'] as String?);
      job['lastStep'] = job['step'];
      job['step'] = 'failed';
      await store.upsert(_collection, job);
      await onGiveUp?.call();
      return true; // move on to other jobs
    }
    await store.upsert(_collection, job);
    final delay = Duration(seconds: min(300, pow(2, attempts).toInt() * 5));
    log(job, 'upload', 'transient failure, retrying in ${delay.inSeconds}s',
        error: job['lastError'], step: job['step'] as String?);
    Timer(delay, pump);
    return false;
  }

  /// Runs the switch over the asset pipeline steps (createTour … pollStitch),
  /// mutating [job]'s persisted state. Returns null when the job progressed,
  /// [StepResult.timerScheduled] when a poll Timer owns the next
  /// advancement, or [StepResult.idle] when a poll is deferred. Throws on
  /// step failure (the queue applies the shared backoff/give-up policy).
  Future<StepResult?> runAssetStep(
    Map<String, dynamic> job,
    ScanAsset asset,
  ) async {
    switch (job['step'] as String) {
      case 'createTour':
        // Idempotency: a stored tour id means the server already answered;
        // a lost response must not mint a second tour.
        if (job['tourId'] != null) {
          job['step'] = 'presign';
        } else {
          final tour = await api.createTour(title: asset.name);
          job['tourId'] = tour['id'];
          log(job, 'backend', 'tour created', step: 'createTour');
          await _saveIfAlive(
            asset.id,
            (c) => c.copyWith(remoteTourId: tour['id'] as String),
          );
          job['step'] = 'presign';
        }
      case 'presign':
        final pano = asset.panoramaPath;
        if (pano == null || !File(pano).existsSync()) {
          throw StateError('panorama file missing');
        }
        // A stored signature may be expired after a long pause; re-presign
        // unless we already hold one from this run.
        if (job['presigned'] == null) {
          final presigned = await api.createPresignedUpload(
            filename: 'panorama.jpg',
            folderType: 'tour',
            tourId: job['tourId'] as String,
            fileSize: File(pano).lengthSync(),
          );
          job['presigned'] = presigned;
        }
        job['step'] = 'putCloudinary';
      case 'putCloudinary':
        await api.uploadToCloudinary(
          presigned: Map<String, dynamic>.from(job['presigned'] as Map),
          file: File(asset.panoramaPath!),
          onProgress: (f) => progress.add(UploadProgress(
            assetId: asset.id,
            step: 'putCloudinary',
            attempt: job['attempts'] as int? ?? 0,
            bytesFraction: f,
          )),
        );
        log(job, 'cloudinary', 'panorama uploaded', step: 'putCloudinary');
        job['step'] = 'confirm';
      case 'confirm':
        final presigned = Map<String, dynamic>.from(job['presigned'] as Map);
        await api.confirmUpload(presigned['upload_id'] as String);
        job['panoramaUrl'] = presigned['public_url'];
        job['step'] = 'createScene';
      case 'createScene':
        // Idempotent scene creation: reconcile against the tour's scenes
        // first so a timeout-after-success never duplicates the scene.
        var sceneId = job['sceneId'] as String?;
        if (sceneId == null) {
          final existing = await api.getTourScenes(job['tourId'] as String);
          for (final s in existing) {
            if (s['image_url'] == job['panoramaUrl']) {
              sceneId = s['id'] as String?;
              log(job, 'backend', 'adopted existing scene (reconcile)',
                  step: 'createScene');
              break;
            }
          }
        }
        if (sceneId == null) {
          final scene = await api.createScene(
            tourId: job['tourId'] as String,
            imageUrl: job['panoramaUrl'] as String,
            title: asset.name,
            orderIndex: 0,
          );
          sceneId = scene['id'];
        }
        job['sceneId'] = sceneId;
        await _saveIfAlive(asset.id, (c) => c.copyWith(remoteSceneId: sceneId));
        job['step'] = 'publish';
      case 'publish':
        final tour = await api.publishTour(job['tourId'] as String);
        final needsCloudStitch =
            asset.status == AssetStatus.pendingCloudStitch &&
            asset.framePaths.isNotEmpty;
        final panoramaUrl = job['panoramaUrl'] as String?;
        final shareCode = tour['short_code'] as String?;
        log(job, 'publish', 'tour published', step: 'publish');
        // Publish-first: the tour is LIVE (and viewable) right now; cloud
        // refinement continues in the background with cloudStitchPending.
        // copyWith treats an explicit null as "reset", so only apply these
        // when produced — a transient null must not wipe an existing value.
        await _saveIfAlive(asset.id, (c) {
          var u = c.copyWith(
            status: AssetStatus.ready,
            published: true,
            cloudStitchPending: needsCloudStitch,
            cloudStitchFailed: false,
          );
          if (panoramaUrl != null) u = u.copyWith(panoramaUrl: panoramaUrl);
          if (shareCode != null) u = u.copyWith(shareCode: shareCode);
          return u;
        });
        if (needsCloudStitch) {
          job['frameUrlsByIndex'] = <String, dynamic>{};
          job['frameIndex'] = 0;
          job['framesTotal'] = asset.framePaths.length;
          job['step'] = 'uploadFrames';
        } else {
          job['step'] = 'done';
        }
      // The local stitch was the naive blend: ship the raw frames and ask
      // the backend to re-stitch with the metadata-driven cloud stitcher.
      // Uploaded frame URLs are persisted per ORIGINAL frame index so a
      // retry skips what is already remote. Bounded batch uploads (2 at a
      // time). The naive pano stays live until the cloud result passes
      // validation and replaces the scene image.
      case 'uploadFrames':
        final i = job['frameIndex'] as int? ?? 0;
        final frames = asset.framePaths;
        final uploaded = Map<String, dynamic>.from(
          job['frameUrlsByIndex'] as Map? ?? {},
        );
        if (i >= frames.length) {
          job['step'] = 'requestStitch';
        } else {
          // Scan forward from i collecting the next batch of un-uploaded
          // frames; frameIndex always advances past the SCANNED range so
          // already-uploaded (or missing) frames are never re-attempted.
          var next = i;
          final batch = <int>[];
          for (var k = i;
              k < frames.length && batch.length < frameBatchSize;
              k++) {
            next = k + 1;
            if (!uploaded.containsKey('$k')) batch.add(k);
          }
          if (batch.isEmpty) {
            // All frames already uploaded (crash between uploads): advance.
            job['frameIndex'] = next;
          } else {
            // Each frame persists its own success (frameUrlsByIndex +
            // frameIndex) so a crash or a retry never re-uploads a frame
            // that already landed on Cloudinary. LocalStore serializes the
            // concurrent upserts; the last writer carries the full map.
            await Future.wait(batch.map((k) async {
              final file = File(frames[k]);
              if (!file.existsSync()) {
                // Missing file: record it as uploaded-skip so indices stay
                // aligned with frame metadata (cloud behavior).
                uploaded['$k'] = null;
              } else {
                final presigned = await api.createPresignedUpload(
                  filename: 'frame_$k.jpg',
                  folderType: 'tour',
                  tourId: job['tourId'] as String,
                  fileSize: file.lengthSync(),
                );
                await api.uploadToCloudinary(presigned: presigned, file: file);
                await api.confirmUpload(presigned['upload_id'] as String);
                uploaded['$k'] = presigned['public_url'];
              }
              job['frameUrlsByIndex'] = Map<String, dynamic>.from(uploaded);
              job['frameIndex'] = next;
              await store.upsert(_collection, job);
              progress.add(UploadProgress(
                assetId: asset.id,
                step: 'uploadFrames',
                attempt: job['attempts'] as int? ?? 0,
                framesUploaded: uploaded.length,
                framesTotal: job['framesTotal'] as int? ?? frames.length,
              ));
            }));
            log(
              job,
              'upload',
              'uploaded frame batch ${batch.join(',')} '
                  '(${uploaded.length}/${frames.length})',
              step: 'uploadFrames',
            );
            job['frameUrlsByIndex'] = uploaded;
            job['frameIndex'] = next;
          }
        }
      case 'requestStitch':
        // A stored stitch job id means the server already created the job
        // (lost response) — resume polling it instead of duplicating.
        if (job['stitchJobId'] != null) {
          job['pollCount'] = 0;
          job['step'] = 'pollStitch';
        } else {
          final uploaded = Map<String, dynamic>.from(
            job['frameUrlsByIndex'] as Map? ?? {},
          );
          final urls = [
            for (final url in uploaded.values)
              if (url is String) url,
          ];
          if (urls.length < 2) {
            // Frames disappeared; refinement is impossible but the local
            // panorama is already published.
            await _saveIfAlive(
              asset.id,
              (c) => c.copyWith(
                status: AssetStatus.ready,
                cloudStitchPending: false,
                cloudStitchFailed: true,
              ),
            );
            job['step'] = 'done';
          } else {
            // Only legacy captures (no recorded orientations) skip the
            // metadata payload — the backend falls back to its legacy path.
            final sourceIndices = [
              for (final key in uploaded.keys)
                if (uploaded[key] is String) int.parse(key),
            ]..sort();
            final metadata =
                asset.frameOrientations.isNotEmpty &&
                    sourceIndices.length == urls.length
                ? _frameMetadata(asset, urls, sourceIndices)
                : null;
            final response = await api.requestCloudStitch(
              sceneId: job['sceneId'] as String,
              frameUrls: urls,
              frames: metadata,
              cameraProfile: metadata != null ? _cameraProfile(asset) : null,
            );
            job['stitchJobId'] = response['id'];
            job['pollCount'] = 0;
            log(
              job,
              'stitch-refinement',
              'stitch job ${response['id']} requested ($urls.length frames)',
              step: 'requestStitch',
            );
            job['step'] = 'pollStitch';
          }
        }
      case 'pollStitch':
        final jobId = job['stitchJobId'] as String?;
        if (jobId == null) {
          await markStitchFailed(asset);
          job['step'] = 'stitchFailed';
        } else {
          // Honor the backoff interval even if another pump re-advances
          // this job early (external pumps, retries): the scheduled Timer
          // owns the next poll.
          final nextAt = job['nextPollAt'] as int? ?? 0;
          final now = DateTime.now().millisecondsSinceEpoch;
          if (now < nextAt) return StepResult.idle;
          final status = await api.getAiJob(jobId);
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
            log(job, 'stitch-refinement', 'refined panorama accepted',
                step: 'pollStitch');
            await _saveIfAlive(
              asset.id,
              (c) => c.copyWith(
                status: AssetStatus.ready,
                cloudStitchFailed: false,
                cloudStitchPending: false,
                panoramaUrl: imageUrl ?? c.panoramaUrl,
              ),
            );
            job['step'] = 'done';
          } else if (state == 'failed' ||
              state == 'canceled' ||
              state == 'cancelled') {
            await markStitchFailed(asset);
            job['step'] = 'stitchFailed';
          } else {
            // Still pending/processing: poll again with a bounded interval.
            final polls = (job['pollCount'] as int? ?? 0) + 1;
            job['pollCount'] = polls;
            if (polls > maxStitchPolls) {
              await markStitchFailed(asset);
              job['step'] = 'stitchFailed';
            } else {
              final interval = pollInterval(polls);
              job['nextPollAt'] = DateTime.now()
                  .add(interval)
                  .millisecondsSinceEpoch;
              await store.upsert(_collection, job);
              Timer(interval, pump);
              return StepResult.timerScheduled;
            }
          }
        }
    }
    return null;
  }

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
          'yaw': _or(sourceIndices, k, orientations.length,
              (i) => orientations[i].yaw),
          'pitch': _or(sourceIndices, k, orientations.length,
              (i) => orientations[i].pitch),
          'roll': _or(sourceIndices, k, orientations.length,
              (i) => orientations[i].roll),
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

  double _or(List<int> sourceIndices, int k, int len, double Function(int) f) {
    final i = k < sourceIndices.length ? sourceIndices[k] : k;
    return i < len ? f(i) : 0.0;
  }

  Map<String, dynamic>? _cameraProfile(ScanAsset asset) {
    final h = asset.captureHFovDeg;
    if (h == null || h <= 0) return null;
    return {'horizontal_fov': h, 'vertical_fov': asset.captureVFovDeg ?? 69.0};
  }
}
