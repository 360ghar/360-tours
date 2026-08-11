// AI spatial-navigation queue steps for UploadQueue (Phase 5). Kept in its
// own file so upload_queue.dart / upload_queue_steps.dart respect the
// ARCHITECTURE.md size limits.

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/backend_api.dart';
import '../models/models.dart';
import '../storage/local_store.dart';
import 'upload_queue.dart';

/// Runs the AI spatial-navigation steps for a `kind: 'spatial'` queue job.
///
/// Reliability contract (mirrors the cloud-stitch sub-pipeline):
///  * the job is a SEPARATE non-fatal job kind — the published tour never
///    depends on it (graceful degradation);
///  * a stored spatialJobId resumes polling instead of re-requesting;
///  * permanent 4xx fail fast; 5xx/network use bounded exponential backoff;
///  * on give-up the asset is flagged `spatialAiFailed` — never `failed`.
class SpatialAiStepsRunner {
  SpatialAiStepsRunner({
    required this.store,
    required this.api,
    required this.getAsset,
    required this.saveAsset,
    required this.pollInterval,
    required this.pump,
  });

  static const _collection = 'upload_queue';

  /// Maximum polls of a spatial job (3s→20s intervals, ~11 min cap; the
  /// backend spatial job itself is bounded by its provider timeouts).
  static const maxSpatialPolls = 60;

  final LocalStore store;
  final BackendApi api;
  final Future<ScanAsset?> Function(String id) getAsset;
  final Future<void> Function(ScanAsset asset) saveAsset;
  final Duration Function(int polls) pollInterval;
  final Future<void> Function() pump;

  Future<bool> _saveIfAlive(
    String assetId,
    ScanAsset Function(ScanAsset current) apply,
  ) async {
    final current = await getAsset(assetId);
    if (current == null) return false;
    await saveAsset(apply(current));
    return true;
  }

  /// Non-fatal failure marker: the published tour stays live, AI navigation
  /// just didn't get generated.
  Future<void> markSpatialAiFailed(ScanAsset asset) => _saveIfAlive(
    asset.id,
    (c) => c.copyWith(
      spatialAiPending: false,
      spatialAiFailed: true,
    ),
  );

  /// Capture metrics for the backend quality score: the local stitch's
  /// panorama metrics plus honest capture counts. Only scenes we know about
  /// are reported; unknown values are omitted (the backend degrades).
  List<Map<String, dynamic>>? _captureMetrics(ScanAsset asset) {
    final sceneId = asset.remoteSceneId;
    if (sceneId == null) return null;
    final entry = <String, dynamic>{'scene_id': sceneId};
    final coverage = asset.captureCoveragePercent;
    if (coverage != null) entry['coverage_percent'] = coverage;
    final seam = asset.captureSeamScore;
    if (seam != null) entry['seam_score'] = seam;
    final exposure = asset.captureExposureScore;
    if (exposure != null) entry['exposure_score'] = exposure;
    final sharpness = asset.captureSharpnessScore;
    if (sharpness != null) entry['sharpness_score'] = sharpness;
    final frameCount = asset.captureFrameCount;
    if (frameCount != null && frameCount > 0) {
      entry['low_quality'] = {
        'total': frameCount,
        'low_quality': asset.captureLowQualityCount ?? 0,
      };
    }
    final planTargets = asset.capturePlanTargetCount;
    if (planTargets != null && planTargets > 0) {
      entry['skipped'] = {
        'total': planTargets,
        'skipped': asset.captureSkippedCount ?? 0,
      };
    }
    return [entry];
  }

  void log(
    Map<String, dynamic> job,
    String tag,
    String message, {
    String? step,
    Object? error,
  }) {
    final assetId = (job['assetId'] as String?) ?? '?';
    final attempt = '${job['attempts'] as int? ?? 0}';
    final err = error == null ? '' : ' err=$error';
    debugPrint(
      '[$tag] asset=$assetId job=${job['id']} step=${step ?? job['step']} '
      'attempt=$attempt$err msg=$message',
    );
  }

  /// Runs the spatial step switch. Returns null on progress, or
  /// [StepResult.timerScheduled]/[StepResult.idle]. Throws on step failure —
  /// the queue applies the shared backoff/give-up policy with the
  /// non-fatal spatial give-up handler.
  Future<StepResult?> runSpatialStep(
    Map<String, dynamic> job,
    ScanAsset asset,
  ) async {
    final tourId = asset.remoteTourId;
    if (tourId == null) {
      // Tour not created yet — wait for the asset job to finish first.
      return StepResult.idle;
    }
    switch (job['step'] as String) {
      case 'requestSpatial':
        // A stored job id means the server already created it (lost
        // response) — resume polling instead of duplicating.
        if (job['spatialJobId'] != null) {
          job['pollCount'] = 0;
          job['step'] = 'pollSpatial';
        } else {
          final response = await api.requestSpatialAi(
            tourId,
            captureMetrics: _captureMetrics(asset),
          );
          job['spatialJobId'] = response['id'];
          job['pollCount'] = 0;
          log(
            job,
            'spatial-ai',
            'spatial job ${response['id']} requested for tour $tourId',
            step: 'requestSpatial',
          );
          await _saveIfAlive(
            asset.id,
            (c) => c.copyWith(spatialAiPending: true, spatialAiFailed: false),
          );
          job['step'] = 'pollSpatial';
        }
      case 'pollSpatial':
        final jobId = job['spatialJobId'] as String?;
        if (jobId == null) {
          await markSpatialAiFailed(asset);
          job['step'] = 'spatialFailed';
        } else {
          final nextAt = job['nextPollAt'] as int? ?? 0;
          final now = DateTime.now().millisecondsSinceEpoch;
          if (now < nextAt) return StepResult.idle;
          final status = await api.getAiJob(jobId);
          final state = status['status'] as String? ?? 'unknown';
          if (state == 'completed') {
            // Deterministic quality report lives in the job result.
            final result = Map<String, dynamic>.from(
              status['result'] as Map? ?? {},
            );
            final quality = Map<String, dynamic>.from(
              result['quality'] as Map? ?? {},
            );
            final score = (quality['overall_score'] as num?)?.toDouble();
            log(job, 'spatial-ai', 'spatial navigation ready', step: 'pollSpatial');
            await _saveIfAlive(
              asset.id,
              (c) => c.copyWith(
                spatialAiPending: false,
                spatialAiFailed: false,
                spatialQualityScore: score,
              ),
            );
            job['step'] = 'done';
          } else if (state == 'failed' ||
              state == 'canceled' ||
              state == 'cancelled') {
            await markSpatialAiFailed(asset);
            job['step'] = 'spatialFailed';
          } else {
            final polls = (job['pollCount'] as int? ?? 0) + 1;
            job['pollCount'] = polls;
            if (polls > maxSpatialPolls) {
              await markSpatialAiFailed(asset);
              job['step'] = 'spatialFailed';
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
}
