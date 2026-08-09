import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:tours360/features/capture/domain/capture_targets.dart';
import 'package:tours360/features/capture/domain/stitching/panorama_blending.dart';
import 'package:tours360/features/capture/domain/stitching/panorama_geometry.dart';
import 'package:tours360/features/capture/domain/stitching/panorama_quality.dart';

BlendFrame _solidFrame(
  int luma, {
  double yaw = 0,
  double pitch = 0,
  double roll = 0,
}) {
  final image = img.Image(width: 64, height: 64);
  img.fill(image, color: img.ColorRgb8(luma, luma, luma));
  return BlendFrame(
    rgb: image.getBytes(order: img.ChannelOrder.rgb),
    width: 64,
    height: 64,
    basis: cameraBasis(yawDeg: yaw, pitchDeg: pitch, rollDeg: roll),
    gain: 1.0,
  );
}

/// Smooth vertical gradient frame (low-frequency content: overlap agreement
/// is measurable despite sub-pixel sampling offsets).
BlendFrame _gradientFrame({double yaw = 0, double roll = 0}) {
  final image = img.Image(width: 64, height: 64);
  for (var y = 0; y < 64; y++) {
    final v = (40 + (215 - 40) * y / 63).round();
    for (var x = 0; x < 64; x++) {
      image.setPixelRgb(x, y, v, v, v);
    }
  }
  return BlendFrame(
    rgb: image.getBytes(order: img.ChannelOrder.rgb),
    width: 64,
    height: 64,
    basis: cameraBasis(yawDeg: yaw, pitchDeg: 0, rollDeg: roll),
    gain: 1.0,
  );
}

BlendFrame _clashFrame(int luma, {double yaw = 0}) =>
    _solidFrame(luma, yaw: yaw);

/// Independent Euler composition R = Rz(-yaw) @ Rx(pitch) @ Ry(roll) applied
/// to the level camera axes (right, up, forward) — deliberately NOT the
/// production [cameraBasis], so the renderer cannot share the stitcher's
/// conventions.
List<Vec3> _eulerBasis(double yawDeg, double pitchDeg, double rollDeg) {
  double rad(double d) => d * pi / 180;
  final yaw = rad(yawDeg), pitch = rad(pitchDeg), roll = rad(rollDeg);
  final (cz, sz) = (cos(yaw), sin(yaw));
  final (cx, sx) = (cos(pitch), sin(pitch));
  final (cy, sy) = (cos(roll), sin(roll));
  final rz = [
    [cz, -sz, 0.0],
    [sz, cz, 0.0],
    [0.0, 0.0, 1.0],
  ];
  final rx = [
    [1.0, 0.0, 0.0],
    [0.0, cx, -sx],
    [0.0, sx, cx],
  ];
  final ry = [
    [cy, 0.0, sy],
    [0.0, 1.0, 0.0],
    [-sy, 0.0, cy],
  ];
  List<List<double>> mul(List<List<double>> m, List<List<double>> n) => [
    for (var i = 0; i < 3; i++)
      [
        for (var j = 0; j < 3; j++)
          m[i][0] * n[0][j] + m[i][1] * n[1][j] + m[i][2] * n[2][j],
      ],
  ];
  List<double> apply(List<List<double>> m, List<double> v) => [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
  final r = mul(mul(rz, rx), ry);
  final right = apply(r, [1.0, 0.0, 0.0]);
  final up = apply(r, [0.0, 0.0, 1.0]);
  final fwd = apply(r, [0.0, 1.0, 0.0]);
  return [
    Vec3(right[0], right[1], right[2]),
    Vec3(up[0], up[1], up[2]),
    Vec3(fwd[0], fwd[1], fwd[2]),
  ];
}

/// Renders a frame of the pitch field (world brightness = f(latitude))
/// through the independent basis — every frame is a true photo of the SAME
/// world, so overlap agreement is a geometry test.
({Uint8List rgb, int width, int height}) _renderPitchField({
  required double yawDeg,
  required double rollDeg,
  int width = 64,
  int height = 64,
}) {
  const hFov = 60.0, vFov = 69.0;
  final basis = _eulerBasis(yawDeg, 0, rollDeg);
  final right = basis[0], up = basis[1], fwd = basis[2];
  final tanH = tan(hFov * pi / 360), tanV = tan(vFov * pi / 360);
  final image = img.Image(width: width, height: height);
  for (var py = 0; py < height; py++) {
    final sy = 1 - 2 * py / (height - 1);
    for (var px = 0; px < width; px++) {
      final sx = 2 * px / (width - 1) - 1;
      final d = Vec3(
        right.x * sx * tanH + up.x * sy * tanV + fwd.x,
        right.y * sx * tanH + up.y * sy * tanV + fwd.y,
        right.z * sx * tanH + up.z * sy * tanV + fwd.z,
      ).normalized();
      final pitchDeg = asin(d.z) * 180 / pi;
      final v = ((pitchDeg + 90) / 180 * 255).round().clamp(0, 255);
      image.setPixelRgb(px, py, v, v, v);
    }
  }
  return (
    rgb: image.getBytes(order: img.ChannelOrder.rgb),
    width: width,
    height: height,
  );
}

void main() {
  const profile = CameraProfile(hFovDeg: 60, vFovDeg: 69, overlap: 0.3);
  const wideProfile = CameraProfile(hFovDeg: 100, vFovDeg: 69, overlap: 0.3);

  group('coverage stats', () {
    test('full horizon ring covers the middle band, not the poles', () {
      // 4 frames at 90° with a 100° FOV tile the full azimuth. The middle
      // band spans lat ±54° but pitch-0 frames only reach ±34.5° → ~64%.
      final frames = [
        for (var i = 0; i < 4; i++) _solidFrame(128, yaw: i * 90.0),
      ];
      final stats = collectBlendStats(frames: frames, profile: wideProfile);
      expect(stats.coveredPixels, greaterThan(0));
      expect(
        stats.middleCovered / stats.middleTotal,
        inInclusiveRange(0.55, 0.75),
      );
      expect(stats.topCovered, 0, reason: 'no pole frames → honest top gap');
      expect(stats.bottomCovered, 0);
    });

    test('pole rings cover top and bottom bands', () {
      final frames = [
        for (var i = 0; i < 8; i++) _solidFrame(128, yaw: i * 45.0),
        for (var i = 0; i < 6; i++)
          _solidFrame(128, yaw: i * 60.0, pitch: 55.5),
        for (var i = 0; i < 6; i++)
          _solidFrame(128, yaw: i * 60.0, pitch: -55.5),
      ];
      final stats = collectBlendStats(frames: frames, profile: profile);
      expect(stats.topCovered / stats.topTotal, greaterThan(0.95));
      expect(stats.bottomCovered / stats.bottomTotal, greaterThan(0.95));
    });

    test('missing frames leave honest gaps and warnings', () {
      final frames = [
        for (var i = 0; i < 3; i++) _solidFrame(128, yaw: i * 120.0),
      ];
      final stats = collectBlendStats(frames: frames, profile: profile);
      final metrics = PanoramaMetrics.fromStats(
        width: 512,
        height: 256,
        stats: stats,
        gains: const [1, 1, 1],
        sharpnessScore: 80,
        frames: frames,
      );
      expect(metrics.coveragePercent, lessThan(100));
      expect(
        metrics.warnings.any((w) => w.contains('Coverage incomplete')),
        isTrue,
      );
    });
  });

  group('seam metric', () {
    test('same smooth content at nearby poses agrees; clashing content '
        'scores low', () {
      final agreeFrames = [_gradientFrame(), _gradientFrame(yaw: 30)];
      final clashFrames = [_clashFrame(10), _clashFrame(245, yaw: 30)];
      final ok = collectBlendStats(frames: agreeFrames, profile: profile);
      final bad = collectBlendStats(frames: clashFrames, profile: profile);
      expect(seamScoreFromStats(ok), greaterThanOrEqualTo(95));
      expect(seamScoreFromStats(bad), lessThanOrEqualTo(30));
    });

    test('roll correctness: frames rendered from the SAME world field '
        '(latitude gradient) agree only with correct roll handling', () {
      // Independent Euler renderer — the frames are genuine "photos" of one
      // world (pitch-dependent field), so overlap agreement tests the
      // stitcher's geometry, not the renderer's.
      final a = _renderPitchField(yawDeg: 0, rollDeg: 10);
      final b = _renderPitchField(yawDeg: 1, rollDeg: -10);
      final correct = [
        BlendFrame(
          rgb: a.rgb,
          width: a.width,
          height: a.height,
          basis: cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 10),
          gain: 1.0,
        ),
        BlendFrame(
          rgb: b.rgb,
          width: b.width,
          height: b.height,
          basis: cameraBasis(yawDeg: 1, pitchDeg: 0, rollDeg: -10),
          gain: 1.0,
        ),
      ];
      final flipped = [
        BlendFrame(
          rgb: a.rgb,
          width: a.width,
          height: a.height,
          basis: cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: -10),
          gain: 1.0,
        ),
        BlendFrame(
          rgb: b.rgb,
          width: b.width,
          height: b.height,
          basis: cameraBasis(yawDeg: 1, pitchDeg: 0, rollDeg: 10),
          gain: 1.0,
        ),
      ];
      final ok = collectBlendStats(frames: correct, profile: profile);
      final bad = collectBlendStats(frames: flipped, profile: profile);
      expect(seamScoreFromStats(ok), greaterThanOrEqualTo(90));
      expect(seamScoreFromStats(bad), lessThan(70));
    });
  });

  group('scores', () {
    test('exposure score reflects correction cost', () {
      expect(exposureScoreFromGains([1.0, 1.0, 1.0]), 100);
      expect(exposureScoreFromGains([0.85, 1.25]), lessThan(60));
      expect(exposureScoreFromGains([]), 100);
    });

    test('sharpness separates texture from flat content', () {
      final textured = img.Image(width: 128, height: 128);
      for (var y = 0; y < 128; y++) {
        for (var x = 0; x < 128; x++) {
          final v = (x * 7 + y * 13) % 255;
          textured.setPixelRgb(x, y, v, v, v);
        }
      }
      final flat = img.Image(width: 128, height: 128);
      img.fill(flat, color: img.ColorRgb8(128, 128, 128));
      expect(sharpnessScoreOfImage(textured), greaterThan(70));
      expect(sharpnessScoreOfImage(flat), lessThan(20));
    });

    test('non-black coverage detects letterboxing', () {
      final image = img.Image(width: 256, height: 128);
      img.fill(image, color: img.ColorRgb8(0, 0, 0));
      for (var y = 20; y < 108; y++) {
        for (var x = 0; x < 256; x++) {
          image.setPixelRgb(x, y, 128, 128, 128);
        }
      }
      final coverage = nonBlackCoverageOfImage(image);
      expect(coverage, closeTo(68.75, 1.0)); // 88/128 rows
    });
  });

  group('validation', () {
    test('accepts 2:1, rejects other shapes and undecodable input', () {
      final good = img.Image(width: 200, height: 100);
      expect(() => validatePanoramaShape(good), returnsNormally);
      final bad = img.Image(width: 200, height: 150);
      expect(
        () => validatePanoramaShape(bad),
        throwsA(isA<PanoramaValidationException>()),
      );
      expect(
        () => validatePanoramaShape(null),
        throwsA(isA<PanoramaValidationException>()),
      );
    });
  });
}
