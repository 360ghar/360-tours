import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:opencv_dart/opencv_dart.dart' as cv;

import '../../../../core/models/models.dart';
import '../capture_targets.dart';
import 'panorama_blending.dart';
import 'panorama_geometry.dart';
import 'panorama_quality.dart';

/// Pure candidate-selection decision (Step 10 production invariant): the
/// OpenCV candidate may only REPLACE the metadata blend when it measurably
/// beats it on BOTH coverage and sharpness — and only when the blend itself
/// is incomplete. A fully-covered blend (true angular coverage >= 99.5%)
/// is never replaced by a letterboxed partial panorama, and a worse
/// candidate can never replace a better panorama.
bool openCvWins({
  required double ocvCoverage,
  required double blendCoverage,
  required double ocvSharpness,
  required double blendSharpness,
  double coverageTolerance = 0.5,
  double fullCoverageThreshold = 99.5,
}) =>
    blendCoverage < fullCoverageThreshold &&
    ocvCoverage >= blendCoverage - coverageTolerance &&
    ocvSharpness > blendSharpness;

/// Result of a stitch attempt.
class StitchResult {
  final String panoramaPath;
  final String thumbnailPath;

  /// Measured quality of the produced panorama (coverage, seam, exposure,
  /// sharpness, warnings).
  final PanoramaMetrics metrics;

  /// True when the metadata blend was used (no OpenCV refinement) — the
  /// caller may offer a cloud re-stitch.
  final bool naive;

  /// True when coverage is not a full sphere (honest: not full 360°).
  final bool partial;

  const StitchResult({
    required this.panoramaPath,
    required this.thumbnailPath,
    required this.metrics,
    this.naive = false,
    this.partial = false,
  });
}

/// Stitches captured frames into an equirectangular panorama.
///
/// Ladder:
/// 1. **Metadata blend** (always): roll-correct rays through the complete
///    yaw/pitch/roll pose, bilinear sampling, coverage-aware weighted
///    blending, per-frame exposure gains. Produces a true 2:1 equirect with
///    honest coverage metrics and never fails on well-formed input.
/// 2. **OpenCV refinement** (`preferDevice`): frames yaw-ordered; its output
///    is only accepted when it measurably beats the blend on both coverage
///    and sharpness (an OpenCV stitch that "succeeds" can still be worse).
///    Its result is a partial panorama at best (`partial: true`).
/// 3. **Cloud re-stitch** is the caller's job when this returns `naive`.
class StitcherService {
  const StitcherService();

  static const _openCvTimeout = Duration(seconds: 90);
  static const _blendOutWidth = 2048;
  static const _blendOutHeight = 1024;

  /// Working-copy long side for blend frames (keeps ~40MB peak for 24
  /// frames; original frames are never touched — they ride along for cloud
  /// refinement).
  static const int workingLongSide = 640;

  /// Stitch [framePaths] (with matching [orientations]) into [outDir].
  /// [profile] is the capture's CameraProfile (fallback when absent —
  /// legacy captures). [lowQualityFlags] parallel to [framePaths] reduce the
  /// weight of hysteresis-accepted frames. [blendWidth]/[blendHeight] allow
  /// tests to render small canvases (production defaults to 2048×1024).
  Future<StitchResult> stitch({
    required List<String> framePaths,
    required List<FrameOrientation> orientations,
    required String outDir,
    CameraProfile? profile,
    List<bool>? lowQualityFlags,
    bool preferDevice = true,
    int? blendWidth,
    int? blendHeight,
  }) async {
    final p = profile ?? CameraProfile.fallbackWide;
    final panoPath = '$outDir/panorama.jpg';
    final thumbPath = '$outDir/thumb.jpg';
    final outW = blendWidth ?? _blendOutWidth;
    final outH = blendHeight ?? _blendOutHeight;

    // Rung 1: metadata blend (always).
    final blend = await Isolate.run(
      () => _blendStitchIsolate(
        framePaths: framePaths,
        orientations: orientations,
        lowQualityFlags: lowQualityFlags,
        profile: p,
        outPath: panoPath,
        width: outW,
        height: outH,
      ),
    );

    // Rung 2: OpenCV refinement — ranked, never trusted on status alone.
    if (preferDevice && framePaths.length >= 2) {
      try {
        final ocvPath = '$outDir/panorama_ocv.jpg';
        final ocv = await _stitchOpenCvRanked(
          framePaths,
          orientations,
          p,
          ocvPath,
        ).timeout(_openCvTimeout, onTimeout: () => null);
        if (ocv != null &&
            openCvWins(
              // The blend side uses its TRUE angular coverage (a dark but
              // fully-covered room must not look like a coverage hole); the
              // OpenCV side can only be measured as non-black luma.
              ocvCoverage: ocv.nonBlackCoverage,
              blendCoverage: blend.metrics.coveragePercent,
              ocvSharpness: ocv.sharpnessScore,
              blendSharpness: blend.sharpnessScore,
            )) {
          // OpenCV measurably wins: ship it.
          await File(ocvPath).copy(panoPath);
          try {
            await File(ocvPath).delete();
          } catch (_) {
            // best-effort cleanup
          }
          await _writeThumbnail(panoPath, thumbPath);
          return StitchResult(
            panoramaPath: panoPath,
            thumbnailPath: thumbPath,
            metrics: ocv.metrics,
            naive: false,
            partial: ocv.metrics.coveragePercent < 99.5,
          );
        }
        try {
          File(ocvPath).deleteSync();
        } catch (_) {
          // best-effort cleanup
        }
      } catch (_) {
        // fall through to the blend result (already on disk)
      }
    }

    await _writeThumbnail(panoPath, thumbPath);
    return StitchResult(
      panoramaPath: panoPath,
      thumbnailPath: thumbPath,
      metrics: blend.metrics,
      naive: true,
      partial: blend.metrics.coveragePercent < 99.5,
    );
  }

  /// OpenCV panorama stitch with ordered inputs. Downscales first (24
  /// full-res frames OOM mid-range phones), pads the result onto a 2:1
  /// canvas, and returns ranking metrics (non-black coverage + sharpness).
  Future<
    ({PanoramaMetrics metrics, double nonBlackCoverage, double sharpnessScore})?
  >
  _stitchOpenCvRanked(
    List<String> framePaths,
    List<FrameOrientation> orientations,
    CameraProfile profile,
    String outPath,
  ) async {
    final mats = <cv.Mat>[];
    try {
      // Order frames by yaw so feature matching walks the ring instead of
      // jumping across the room.
      final order =
          [
            for (
              var i = 0;
              i < framePaths.length && i < orientations.length;
              i++
            )
              i,
          ]..sort(
            (a, b) => (orientations[a].yaw % 360).compareTo(
              orientations[b].yaw % 360,
            ),
          );
      for (final i in order) {
        final mat = cv.imread(framePaths[i]);
        if (mat.isEmpty) continue;
        final longSide = max(mat.width, mat.height);
        if (longSide > 1600) {
          final scale = 1600 / longSide;
          final resized = await cv.resizeAsync(mat, (
            (mat.width * scale).round(),
            (mat.height * scale).round(),
          ));
          mat.dispose();
          mats.add(resized);
        } else {
          mats.add(mat);
        }
      }
      if (mats.length < 2) return null;

      final stitcher = cv.Stitcher.create(mode: cv.StitcherMode.PANORAMA);
      final (status, pano) = await stitcher.stitchAsync(
        cv.VecMat.fromList(mats),
      );
      stitcher.dispose();
      if (status != cv.StitcherStatus.OK || pano.isEmpty) {
        pano.dispose();
        return null;
      }

      // Letterbox onto a 2:1 canvas — the viewer expects equirect 2:1. The
      // coverage metric measures the black regions honestly below.
      final padded = _padToTwoToOne(pano);
      pano.dispose();
      final ok = cv.imwrite(outPath, padded);
      padded.dispose();
      if (!ok) return null;
    } finally {
      for (final m in mats) {
        m.dispose();
      }
    }

    final decoded = img.decodeJpg(File(outPath).readAsBytesSync());
    if (decoded == null) return null;
    final nonBlack = nonBlackCoverageOfImage(decoded);
    final sharpness = sharpnessScoreOfImage(decoded);
    return (
      metrics: PanoramaMetrics.coverageOnly(
        width: decoded.width,
        height: decoded.height,
        nonBlackPercent: nonBlack,
        sharpnessScore: sharpness,
        reason: 'OpenCV result selected — seam/exposure not measured',
      ),
      nonBlackCoverage: nonBlack,
      sharpnessScore: sharpness,
    );
  }

  cv.Mat _padToTwoToOne(cv.Mat pano) {
    final w = pano.width, h = pano.height;
    if (w == 2 * h) return pano.clone();
    late int outW, outH;
    if (w > 2 * h) {
      // Round the width up to an even value so 2:1 holds exactly.
      outW = w + (w % 2);
      outH = outW ~/ 2;
    } else {
      outH = h;
      outW = h * 2;
    }
    final top = ((outH - h) / 2).round();
    final left = ((outW - w) / 2).round();
    return cv.copyMakeBorder(
      pano,
      top,
      outH - h - top,
      left,
      outW - w - left,
      cv.BORDER_CONSTANT,
      value: cv.Scalar.black,
    );
  }

  Future<void> _writeThumbnail(String panoPath, String thumbPath) async {
    await Isolate.run(() {
      final bytes = File(panoPath).readAsBytesSync();
      final pano = img.decodeJpg(bytes);
      if (pano == null) return;
      final thumb = img.copyResize(pano, width: 640);
      File(thumbPath).writeAsBytesSync(img.encodeJpg(thumb, quality: 80));
    });
  }
}

/// Isolate entry: decode → working copies → exposure gains → stats → blend →
/// encode. Returns the panorama path and its measured metrics.
({
  String path,
  PanoramaMetrics metrics,
  double sharpnessScore,
  double nonBlackCoverage,
})
_blendStitchIsolate({
  required List<String> framePaths,
  required List<FrameOrientation> orientations,
  required List<bool>? lowQualityFlags,
  required CameraProfile profile,
  required String outPath,
  required int width,
  required int height,
}) {
  // Decode + downscale each frame once; keep only RGB bytes (bounded
  // memory) — the original files stay untouched for cloud refinement.
  final rgbFrames = <(Uint8List, int, int, FrameOrientation, bool)>[];
  final means = <double>[];
  for (var i = 0; i < framePaths.length && i < orientations.length; i++) {
    final decoded = img.decodeJpg(File(framePaths[i]).readAsBytesSync());
    if (decoded == null) continue;
    // Cap the LONG side at workingLongSide (portrait captures are 1080x1920
    // — resizing by width alone would leave a 1138px tall copy and triple
    // the retained memory).
    final scale =
        StitcherService.workingLongSide / max(decoded.width, decoded.height);
    final small = img.copyResize(
      decoded,
      width: (decoded.width * scale).round().clamp(1, 4096),
      height: (decoded.height * scale).round().clamp(1, 4096),
    );
    final rgb = frameRgbBytes(small);
    final tiny = img.copyResize(decoded, width: 64);
    means.add(meanLumaOfRgb(frameRgbBytes(tiny)));
    rgbFrames.add((
      rgb,
      small.width,
      small.height,
      orientations[i],
      lowQualityFlags != null &&
          i < lowQualityFlags.length &&
          lowQualityFlags[i],
    ));
  }

  final gains = computeFrameGains(means);
  final frames = <BlendFrame>[
    for (var i = 0; i < rgbFrames.length; i++)
      BlendFrame(
        rgb: rgbFrames[i].$1,
        width: rgbFrames[i].$2,
        height: rgbFrames[i].$3,
        basis: cameraBasis(
          yawDeg: rgbFrames[i].$4.yaw,
          pitchDeg: rgbFrames[i].$4.pitch,
          rollDeg: rgbFrames[i].$4.roll,
        ),
        gain: gains.isEmpty ? 1.0 : gains[i],
        lowQuality: rgbFrames[i].$5,
      ),
  ];

  // Low-res stats pass (coverage bands + seam disagreement).
  final stats = collectBlendStats(frames: frames, profile: profile);

  // Full-res blend pass.
  final acc = BlendAccumulator(width, height);
  final sinLon = List<double>.filled(width, 0);
  final cosLon = List<double>.filled(width, 0);
  for (var x = 0; x < width; x++) {
    final lon = (x / width) * 2 * pi - pi;
    sinLon[x] = sin(lon);
    cosLon[x] = cos(lon);
  }
  final sinLat = List<double>.filled(height, 0);
  final cosLat = List<double>.filled(height, 0);
  for (var y = 0; y < height; y++) {
    final lat = pi / 2 - (y / height) * pi;
    sinLat[y] = sin(lat);
    cosLat[y] = cos(lat);
  }
  for (final frame in frames) {
    accumulateFrame(
      acc,
      frame,
      profile,
      sinLon: sinLon,
      cosLon: cosLon,
      sinLat: sinLat,
      cosLat: cosLat,
    );
  }
  final image = finalizeBlend(acc);
  validatePanoramaShape(image);
  File(outPath).writeAsBytesSync(img.encodeJpg(image, quality: 90));

  final sharpness = sharpnessScoreOfImage(image);
  final metrics = PanoramaMetrics.fromStats(
    width: width,
    height: height,
    stats: stats,
    gains: gains,
    sharpnessScore: sharpness,
    frames: frames,
  );
  return (
    path: outPath,
    metrics: metrics,
    sharpnessScore: sharpness,
    nonBlackCoverage: nonBlackCoverageOfImage(image),
  );
}
