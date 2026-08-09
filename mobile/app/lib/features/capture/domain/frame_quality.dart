import 'dart:io';

import 'package:image/image.dart' as img;

/// Why a frame was rejected. Mapped to human copy in presentation — never
/// shown raw.
enum FrameRejectionReason {
  tooBlurry,
  tooDark,
  tooBright,
  unstable,
  wrongOrientation,
  duplicate,
}

/// Numerical quality of one captured frame.
class FrameQuality {
  /// Variance of Laplacian on the downscaled luma plane (sharpness proxy).
  /// Higher is sharper; near-zero is flat/defocused.
  final double sharpness;

  /// Mean luma in 0..1 (dark = 0, blown = 1).
  final double brightness;

  /// True when the frame was auto-accepted after repeated rejections
  /// (hysteresis) and should be flagged in the coverage report.
  final bool lowQuality;

  const FrameQuality({
    required this.sharpness,
    required this.brightness,
    this.lowQuality = false,
  });
}

/// Result of assessing a frame against the gate.
class FrameQualityResult {
  final FrameQuality quality;
  final bool accepted;
  final FrameRejectionReason? rejectionReason;

  const FrameQualityResult({
    required this.quality,
    required this.accepted,
    this.rejectionReason,
  });
}

/// Variance of Laplacian of an image's luma, computed on a downscaled copy
/// (default 256px wide). The single source of the sharpness metric — reused
/// by the capture quality gate and the panorama sharpness score.
double laplacianVariance(img.Image image, {int sampleSize = 256}) {
  final small = img.copyResize(image, width: sampleSize);
  final luma = small.convert(numChannels: 1);

  var sum = 0.0;
  var sumSq = 0.0;
  final w = luma.width, h = luma.height;
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      final c = luma.getPixel(x, y).r;
      final lap =
          4 * c -
          luma.getPixel(x - 1, y).r -
          luma.getPixel(x + 1, y).r -
          luma.getPixel(x, y - 1).r -
          luma.getPixel(x, y + 1).r;
      sum += lap;
      sumSq += lap * lap;
    }
  }
  final n = (w - 2) * (h - 2);
  final mean = sum / n;
  return sumSq / n - mean * mean;
}

/// On-device quality gate.
///
/// Design (PHASE 1D/1E/1G):
/// - One downscaled decode per frame (single ~256px decode; never re-decode).
/// - Sharpness = variance of Laplacian on luma (cheap, standard).
/// - Brightness = mean luma; rejects only obviously unusable extremes, not
///   normal exposure variation.
/// - Hysteresis: after [kMaxAutoRejects] consecutive rejections the frame is
///   ACCEPTED with `lowQuality: true` so a user is never trapped in a retake
///   loop ("conservative acceptance with a post-capture quality check").
/// - Thresholds are calibration constants against deterministic fixtures
///   (see frame_quality_test.dart): the sharp fixture is textured
///   (variance of Laplacian in the thousands); a box blur of radius 4 at
///   256px lands near/under [kMinSharpness]; a mild blur passes.
class FrameQualityGate {
  const FrameQualityGate();

  /// Below this, the frame is considered defocused/blurry. Calibrated on
  /// photo-like room fixtures (Phase 3, 2026-08-09): a sharp room scores
  /// ~330 (11x margin), a MILD hand-shake blur ~52 (accepted — the
  /// threshold must not false-reject mild softness), a moderate blur ~8
  /// (rejected). Hysteresis (accept-after-3) remains the final safety net.
  static const double kMinSharpness = 30;

  /// Mean luma below this is effectively black (lens covered, camera fail).
  static const double kTooDarkBrightness = 0.05;

  /// Mean luma above this is effectively blown out.
  static const double kTooBrightBrightness = 0.97;

  /// Rejection limit before hysteresis kicks in (accept-with-warning).
  static const int kMaxAutoRejects = 3;

  static const int _sampleSize = 256;

  /// Decodes [jpegPath] once, downscales to <=256px and computes
  /// sharpness + brightness. Pure and fast enough for the shutter path.
  FrameQuality evaluate(String jpegPath) {
    final decoded = img.decodeJpg(File(jpegPath).readAsBytesSync());
    if (decoded == null) {
      // Un-decodable = broken frame; zero sharpness reads as tooBlurry.
      return const FrameQuality(sharpness: 0, brightness: 0.5);
    }
    final small = img.copyResize(decoded, width: _sampleSize);
    final luma = small.convert(numChannels: 1);

    var lumaSum = 0.0;
    final w = luma.width, h = luma.height;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        lumaSum += luma.getPixel(x, y).r;
      }
    }
    final n = (w - 2) * (h - 2);
    final brightness = lumaSum / n / 255; // normalize to 0..1
    return FrameQuality(
      sharpness: laplacianVariance(decoded, sampleSize: _sampleSize),
      brightness: brightness,
    );
  }

  /// Applies the threshold + hysteresis rules. [consecutiveRejects] is the
  /// number of consecutive rejections already recorded for the current
  /// target before this assessment. Brightness is checked before sharpness:
  /// a dark/blown frame reads as "too dark / too bright" (actionable) rather
  /// than the also-true-but-less-helpful "blurry".
  FrameQualityResult assess(
    FrameQuality quality, {
    required int consecutiveRejects,
  }) {
    FrameRejectionReason? reason;
    if (quality.brightness < kTooDarkBrightness) {
      reason = FrameRejectionReason.tooDark;
    } else if (quality.brightness > kTooBrightBrightness) {
      reason = FrameRejectionReason.tooBright;
    } else if (quality.sharpness < kMinSharpness) {
      reason = FrameRejectionReason.tooBlurry;
    }

    if (reason == null) {
      return FrameQualityResult(quality: quality, accepted: true);
    }
    if (consecutiveRejects >= kMaxAutoRejects - 1) {
      // Hysteresis: stop blocking; accept and flag for the coverage report.
      return FrameQualityResult(
        quality: FrameQuality(
          sharpness: quality.sharpness,
          brightness: quality.brightness,
          lowQuality: true,
        ),
        accepted: true,
        rejectionReason: reason,
      );
    }
    return FrameQualityResult(
      quality: quality,
      accepted: false,
      rejectionReason: reason,
    );
  }
}
