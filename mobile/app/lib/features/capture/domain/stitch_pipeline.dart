import 'package:flutter/foundation.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/repositories.dart';
import '../../../core/upload/upload_queue.dart';
import 'capture_targets.dart';
import 'stitching/stitcher_service.dart';

/// Rebuilds the capture profile for stitching. Legacy assets (null FOV)
/// fall back to the documented profile.
CameraProfile? _profileOf(ScanAsset asset) {
  final h = asset.captureHFovDeg;
  if (h == null || h <= 0) return null;
  return CameraProfile(hFovDeg: h, vFovDeg: asset.captureVFovDeg ?? kVFovDeg);
}

/// Background hand-off after capture: stitch the frames and enqueue the
/// upload, preserving the existing capture → stitch → upload → publish
/// pipeline.
class StitchPipeline {
  const StitchPipeline();

  /// Stitch a full asset scan and enqueue its upload. A naive local stitch
  /// is shipped immediately and the raw frames ride along so the backend can
  /// re-stitch with the cloud (metadata-driven) stitcher.
  ///
  /// [skippedTargetCount]/[planTargetCount] (when known) are persisted as
  /// capture metrics and later reported to the backend tour-quality score.
  Future<void> stitchAndUpload(
    AssetRepository assets,
    ScanAsset asset,
    String outDir, {
    bool preferDevice = true,
    int? skippedTargetCount,
    int? planTargetCount,
  }) async {
    try {
      final result = await const StitcherService().stitch(
        framePaths: asset.framePaths,
        orientations: asset.frameOrientations,
        profile: _profileOf(asset),
        lowQualityFlags: asset.frameLowQuality,
        outDir: outDir,
        preferDevice: preferDevice,
      );
      // Phase 3 harness: per-panorama metrics for the device test report
      // (flutter logs on a debug build; see phase-3-device-validation.md).
      final m = result.metrics;
      debugPrint(
        '[stitch] naive=${result.naive} partial=${result.partial} '
        '${m.width}x${m.height} coverage=${m.coveragePercent}% '
        'h=${m.horizontalCoveragePercent}% v=${m.verticalCoveragePercent}% '
        'seam=${m.seamScore} exposure=${m.exposureScore} '
        'sharp=${m.sharpnessScore} overall=${m.overallScore} '
        'warnings=${m.warnings.join('; ')}',
      );
      // Phase 5: persist the measured capture metrics so the asset can
      // report them to the backend tour-quality score (and the UI can show
      // them). Ratios use the captured-frame counts, never fabricated.
      final lowQualityCount = asset.frameLowQuality?.where((q) => q).length ?? 0;
      final frameCount = asset.framePaths.length;
      final stitched = asset.copyWith(
        status: result.naive
            ? AssetStatus.pendingCloudStitch
            : AssetStatus.stitching,
        panoramaPath: result.panoramaPath,
        thumbnailPath: result.thumbnailPath,
        captureCoveragePercent: m.coveragePercent,
        captureSeamScore: m.seamScore,
        captureExposureScore: m.exposureScore,
        captureSharpnessScore: m.sharpnessScore,
        captureFrameCount: frameCount > 0 ? frameCount : null,
        captureLowQualityCount: lowQualityCount > 0 ? lowQualityCount : null,
        capturePlanTargetCount: planTargetCount,
        captureSkippedCount: skippedTargetCount,
      );
      await assets.saveAsset(stitched);
      await assets.enqueueUpload(stitched);
    } catch (e) {
      await assets.saveAsset(asset.copyWith(status: AssetStatus.failed));
    }
  }

  /// Stitch a ROOM inside an existing asset and enqueue its scene upload.
  Future<void> stitchRoomAndUpload(
    AssetRepository assets,
    UploadQueue queue,
    String assetId,
    Room room,
    List<String> framePaths,
    List<FrameOrientation> orientations,
    String outDir, {
    bool preferDevice = true,
  }) async {
    try {
      final result = await const StitcherService().stitch(
        framePaths: framePaths,
        orientations: orientations,
        outDir: outDir,
        preferDevice: preferDevice,
      );
      final stitched = room.copyWith(panoramaPath: result.panoramaPath);
      await assets.saveRoom(stitched);
      final asset = await assets.getAsset(assetId);
      if (asset != null) await queue.enqueueRoom(asset, stitched);
    } catch (_) {
      // Room stays without a panorama; user can delete and recapture.
    }
  }
}
