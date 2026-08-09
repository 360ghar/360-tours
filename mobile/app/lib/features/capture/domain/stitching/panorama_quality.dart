import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

import '../capture_targets.dart';
import '../frame_quality.dart';
import 'panorama_blending.dart';
import 'panorama_geometry.dart';

/// Deterministic, measurable statistics of a blended panorama.
///
/// Coverage is counted per pixel (a pixel is covered when at least one
/// frame's contribution weight is above zero); bands split the sphere into
/// top (lat > ~54°), middle and bottom thirds by row. The seam metric
/// records, per pixel, how much the two strongest contributors disagree in
/// luma, weighted by the overlap region (min of the two weights).
class BlendStats {
  final int totalPixels;
  final int coveredPixels;
  final int topTotal, topCovered;
  final int middleTotal, middleCovered;
  final int bottomTotal, bottomCovered;
  final double seamDisagreement;
  final double seamWeight;

  const BlendStats({
    required this.totalPixels,
    required this.coveredPixels,
    required this.topTotal,
    required this.topCovered,
    required this.middleTotal,
    required this.middleCovered,
    required this.bottomTotal,
    required this.bottomCovered,
    required this.seamDisagreement,
    required this.seamWeight,
  });
}

/// Low-resolution analysis pass over the same contributions the blend uses.
/// Runs at 512×256 so the top-2-per-pixel tracking stays ~2MB.
BlendStats collectBlendStats({
  required List<BlendFrame> frames,
  required CameraProfile profile,
  int width = 512,
  int height = 256,
}) {
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

  final n = width * height;
  final bestW = Float32List(n);
  final bestLum = Float32List(n);
  final secW = Float32List(n);
  final secLum = Float32List(n);
  final (tanH, tanV) = fovTangents(profile);

  for (final frame in frames) {
    final rgb = frame.rgb;
    final fw = frame.width, fh = frame.height;
    final gain = frame.gain;
    final lowQuality = frame.lowQuality;
    final right = frame.basis.right,
        up = frame.basis.up,
        fwd = frame.basis.forward;

    final (latMinDeg, latMaxDeg) = frameLatitudeBand(frame.basis, profile);
    final latMin = latMinDeg * pi / 180;
    final latMax = latMaxDeg * pi / 180;
    final yStart = max(0, ((pi / 2 - latMax) / pi * height).floor());
    final yEnd = min(height, ((pi / 2 - latMin) / pi * height).ceil());

    for (var y = yStart; y < yEnd; y++) {
      final cosLatY = cosLat[y];
      final sinLatY = sinLat[y];
      final rowBase = y * width;
      for (var x = 0; x < width; x++) {
        final i = rowBase + x;
        final dx = sinLon[x] * cosLatY;
        final dy = cosLon[x] * cosLatY;
        final dz = sinLatY;
        final f = dx * fwd.x + dy * fwd.y + dz * fwd.z;
        if (f <= 0.05) continue;
        final u = (dx * right.x + dy * right.y + dz * right.z) / f;
        final v = (dx * up.x + dy * up.y + dz * up.z) / f;
        final sx = u / tanH, sy = v / tanV;
        if (sx.abs() > 1 || sy.abs() > 1) continue;
        final weight = frameWeight(sx, sy, lowQuality: lowQuality) * f;
        if (weight <= 0.001) continue;

        final px = (sx + 1) / 2 * (fw - 1);
        final py = (1 - sy) / 2 * (fh - 1);
        final (r, g, b) = sampleBilinear(rgb, fw, fh, px, py, gain);
        final lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (weight > bestW[i]) {
          secW[i] = bestW[i];
          secLum[i] = bestLum[i];
          bestW[i] = weight;
          bestLum[i] = lum;
        } else if (weight > secW[i]) {
          secW[i] = weight;
          secLum[i] = lum;
        }
      }
    }
  }

  var covered = 0, topCovered = 0, midCovered = 0, botCovered = 0;
  var topTotal = 0, midTotal = 0, botTotal = 0;
  var disagreement = 0.0, seamW = 0.0;
  final topBand = height ~/ 5, botBand = height - height ~/ 5;
  for (var y = 0; y < height; y++) {
    final rowBase = y * width;
    final inTop = y < topBand, inBot = y >= botBand;
    for (var x = 0; x < width; x++) {
      final i = rowBase + x;
      final w1 = bestW[i];
      if (w1 > 0) covered++;
      if (inTop) {
        topTotal++;
        if (w1 > 0) topCovered++;
      } else if (inBot) {
        botTotal++;
        if (w1 > 0) botCovered++;
      } else {
        midTotal++;
        if (w1 > 0) midCovered++;
      }
      final w2 = secW[i];
      if (w2 > 0) {
        final m = min(w1, w2);
        disagreement += m * (bestLum[i] - secLum[i]).abs();
        seamW += m;
      }
    }
  }

  return BlendStats(
    totalPixels: n,
    coveredPixels: covered,
    topTotal: topTotal,
    topCovered: topCovered,
    middleTotal: midTotal,
    middleCovered: midCovered,
    bottomTotal: botTotal,
    bottomCovered: botCovered,
    seamDisagreement: disagreement,
    seamWeight: seamW,
  );
}

/// 0..100 seam score: 100 when overlapping contributors agree (disagreement
/// below 12% luma), 0 when they clash wildly. Diagnostic, not a hard gate.
double seamScoreFromStats(BlendStats stats) {
  if (stats.seamWeight <= 0) return 100;
  final meanDisagreement = stats.seamDisagreement / stats.seamWeight / 255;
  return (100 - (100 * meanDisagreement / 0.12).clamp(0.0, 100.0))
      .roundToDouble();
}

/// 0..100 exposure score: how much gain correction the frames needed.
/// 100 = no correction; 0 = extreme correction (>= 30% average).
double exposureScoreFromGains(List<double> gains) {
  if (gains.isEmpty) return 100;
  final cost =
      gains.map((g) => (g - 1).abs()).reduce((a, b) => a + b) / gains.length;
  return (100 - (100 * cost / 0.30).clamp(0.0, 100.0)).roundToDouble();
}

/// 0..100 sharpness of an image: monotone compression of the variance of
/// Laplacian (variance ~3250 for a sharp textured fixture scores ~89).
double sharpnessScoreOfImage(img.Image image, {int sampleSize = 256}) {
  final variance = laplacianVariance(image, sampleSize: sampleSize);
  return (100 * variance / (variance + 400)).roundToDouble();
}

/// Fraction of pixels with luma above [threshold] (0..100). Used to rank
/// results produced by paths that cannot measure true angular coverage
/// (the OpenCV letterbox). A real full-sphere equirect has ~0 pixels at
/// luma <= 8.
double nonBlackCoverageOfImage(img.Image image, {int threshold = 8}) {
  final small = img.copyResize(image, width: 256);
  var nonBlack = 0;
  final n = small.width * small.height;
  for (var y = 0; y < small.height; y++) {
    for (var x = 0; x < small.width; x++) {
      final px = small.getPixel(x, y);
      final luma = 0.299 * px.r + 0.587 * px.g + 0.114 * px.b;
      if (luma > threshold) nonBlack++;
    }
  }
  return 100.0 * nonBlack / n;
}

/// Measured quality of a produced panorama. All scores are 0..100 and based
/// on measurable properties; `seamScore`/`exposureScore` are null when the
/// producing path (e.g. an OpenCV result) cannot measure them.
class PanoramaMetrics {
  final int width;
  final int height;

  /// Fraction of equirect pixels with at least one contributing frame.
  final double coveragePercent;

  /// Middle band (lat within ~±54°) coverage — the horizon ring.
  final double horizontalCoveragePercent;

  /// The WORSE of top/bottom band coverage — the poles (the old
  /// black-wedge class of failure).
  final double verticalCoveragePercent;

  final double? seamScore;
  final double? exposureScore;
  final double sharpnessScore;
  final double overallScore;
  final List<String> warnings;

  const PanoramaMetrics({
    required this.width,
    required this.height,
    required this.coveragePercent,
    required this.horizontalCoveragePercent,
    required this.verticalCoveragePercent,
    this.seamScore,
    this.exposureScore,
    required this.sharpnessScore,
    required this.overallScore,
    this.warnings = const [],
  });

  /// Builds metrics from a stats pass; weights: coverage 0.45, seam 0.25,
  /// exposure 0.15, sharpness 0.15. When a metric is unmeasured its weight
  /// is redistributed to coverage and sharpness.
  factory PanoramaMetrics.fromStats({
    required int width,
    required int height,
    required BlendStats stats,
    required List<double> gains,
    required double sharpnessScore,
    required List<BlendFrame> frames,
  }) {
    final coverage = 100.0 * stats.coveredPixels / stats.totalPixels;
    final horizontal = 100.0 * stats.middleCovered / stats.middleTotal;
    final vertical = min(
      100.0 * stats.topCovered / stats.topTotal,
      100.0 * stats.bottomCovered / stats.bottomTotal,
    );
    final seam = seamScoreFromStats(stats);
    final exposure = exposureScoreFromGains(gains);

    final warnings = <String>[];
    if (coverage < 95) {
      warnings.add('Coverage incomplete (${coverage.round()}%)');
    }
    if (vertical < 90) {
      warnings.add(
        'Upper/lower coverage low (${vertical.round()}%) — capture more up/down shots',
      );
    }
    if (seam < 70) {
      warnings.add('Visible seam discontinuities detected');
    }
    final lowQuality = frames.where((f) => f.lowQuality).length;
    if (lowQuality > 0) {
      warnings.add(
        '$lowQuality low-quality frame${lowQuality == 1 ? '' : 's'} contributed',
      );
    }

    final overall =
        (0.45 * coverage +
                0.25 * seam +
                0.15 * exposure +
                0.15 * sharpnessScore)
            .clamp(0.0, 100.0)
            .roundToDouble();

    return PanoramaMetrics(
      width: width,
      height: height,
      coveragePercent: coverage.roundToDouble(),
      horizontalCoveragePercent: horizontal.roundToDouble(),
      verticalCoveragePercent: vertical.roundToDouble(),
      seamScore: seam,
      exposureScore: exposure,
      sharpnessScore: sharpnessScore,
      overallScore: overall,
      warnings: warnings,
    );
  }

  /// Metrics for a result whose production path cannot run the blend stats
  /// pass (OpenCV rung): coverage measured as non-black fraction, seam and
  /// exposure honestly unmeasured.
  factory PanoramaMetrics.coverageOnly({
    required int width,
    required int height,
    required double nonBlackPercent,
    required double sharpnessScore,
    String? reason,
  }) {
    final warnings = <String>[
      ?reason,
      if (nonBlackPercent < 95)
        'Coverage incomplete (${nonBlackPercent.round()}%)',
    ];
    final overall = (0.6 * nonBlackPercent + 0.4 * sharpnessScore)
        .clamp(0.0, 100.0)
        .roundToDouble();
    return PanoramaMetrics(
      width: width,
      height: height,
      coveragePercent: nonBlackPercent.roundToDouble(),
      horizontalCoveragePercent: nonBlackPercent.roundToDouble(),
      verticalCoveragePercent: nonBlackPercent.roundToDouble(),
      sharpnessScore: sharpnessScore,
      overallScore: overall,
      warnings: warnings,
    );
  }
}

/// Thrown when a produced panorama cannot be used (malformed shape,
/// un-decodable, empty canvas).
class PanoramaValidationException implements Exception {
  final String message;
  const PanoramaValidationException(this.message);

  @override
  String toString() => 'PanoramaValidationException: $message';
}

/// Hard structural checks for an equirect panorama. Throws on malformed
/// output instead of silently shipping it.
void validatePanoramaShape(img.Image? image) {
  if (image == null) {
    throw const PanoramaValidationException('panorama could not be decoded');
  }
  if (image.width <= 0 || image.height <= 0) {
    throw const PanoramaValidationException('empty panorama');
  }
  if (image.width != 2 * image.height) {
    throw PanoramaValidationException(
      'not equirect 2:1 (${image.width}x${image.height})',
    );
  }
}
