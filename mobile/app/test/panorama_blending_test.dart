import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';
import 'package:tours360/features/capture/domain/stitching/panorama_blending.dart';
import 'package:tours360/features/capture/domain/stitching/panorama_geometry.dart';

/// Small RGB buffer helper (interleaved, 3 bytes per pixel).
Uint8List rgb(int width, int height, List<int> values) {
  final out = Uint8List(width * height * 3);
  for (var i = 0; i < values.length && i < out.length; i++) {
    out[i] = values[i];
  }
  return out;
}

void main() {
  group('frameWeight', () {
    test('center beats edge; falloff is monotonic', () {
      final center = frameWeight(0, 0, lowQuality: false);
      final mid = frameWeight(0.5, 0, lowQuality: false);
      final edge = frameWeight(0.95, 0, lowQuality: false);
      expect(center, greaterThan(mid));
      expect(mid, greaterThan(edge));
      expect(center, closeTo(1.0, 0.01));
    });

    test('low-quality frames contribute at half weight', () {
      expect(
        frameWeight(0, 0, lowQuality: true),
        closeTo(frameWeight(0, 0, lowQuality: false) * 0.5, 1e-9),
      );
    });
  });

  group('computeFrameGains', () {
    test('pulls means toward the median and clamps', () {
      final gains = computeFrameGains([200, 100, 96]);
      expect(gains[0], closeTo(0.85, 1e-9)); // clamped
      expect(gains[1], closeTo(1.0, 1e-9)); // median → no change
      expect(gains[2], closeTo(100 / 96, 1e-6));
    });

    test('all-black frames get identity gains', () {
      expect(computeFrameGains([0, 0]), [1.0, 1.0]);
      expect(computeFrameGains([]), isEmpty);
    });
  });

  group('sampleBilinear', () {
    test('interpolates a 2x2 block and applies gain', () {
      // 2x2: top row 0,0 | 200,0 ; bottom row 0,200 | 200,200
      final buf = Uint8List(12);
      buf[3] = 200; // (1,0) r
      buf[6] = 200; // (0,1) r
      buf[9] = 200; // (1,1) r
      // Bilinear at the exact center of the 2x2 = mean of all four.
      final (r, g, b) = sampleBilinear(buf, 2, 2, 0.5, 0.5, 1.0);
      expect(r, 150);
      expect(g, 0);
      expect(b, 0);
      // Gain scales it, clamped to 255.
      final (r2, _, _) = sampleBilinear(buf, 2, 2, 0.5, 0.5, 2.0);
      expect(r2, 255);
    });

    test('clamps at edges and keeps values in range', () {
      final buf = rgb(8, 8, [255, 128, 64]);
      final (r, g, b) = sampleBilinear(buf, 8, 8, -5, -5, 1.0);
      expect(r, 255); // clamps to the corner pixel
      expect(g, 128);
      expect(b, 64);
      // Gain 3x on b=64 gives 192 — within range, not clipped.
      final (_, _, b2) = sampleBilinear(buf, 8, 8, 0, 0, 3.0);
      expect(b2, 192);
      // Gain 3x on the 255 channel clamps to 255.
      final (r3, _, _) = sampleBilinear(buf, 8, 8, 0, 0, 3.0);
      expect(r3, 255);
    });
  });

  group('accumulate + finalize', () {
    test('blends two frames and normalizes weights', () {
      // Left frame covers the north, right frame covers east (wide FOV).
      final left = rgb(64, 64, List.filled(64 * 64 * 3, 255));
      final right = rgb(64, 64, List.filled(64 * 64 * 3, 128));
      final frames = [
        BlendFrame(
          rgb: left,
          width: 64,
          height: 64,
          basis: cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 0),
          gain: 1.0,
        ),
        BlendFrame(
          rgb: right,
          width: 64,
          height: 64,
          basis: cameraBasis(yawDeg: 30, pitchDeg: 0, rollDeg: 0),
          gain: 1.0,
        ),
      ];
      const profile = CameraProfile(hFovDeg: 60, vFovDeg: 69, overlap: 0.3);
      const w = 128, h = 64;
      final acc = BlendAccumulator(w, h);
      final sinLon = List<double>.filled(w, 0);
      final cosLon = List<double>.filled(w, 0);
      final sinLat = List<double>.filled(h, 0);
      final cosLat = List<double>.filled(h, 0);
      for (var x = 0; x < w; x++) {
        final lon = (x / w) * 2 * pi - pi;
        sinLon[x] = sin(lon);
        cosLon[x] = cos(lon);
      }
      for (var y = 0; y < h; y++) {
        final lat = pi / 2 - (y / h) * pi;
        sinLat[y] = sin(lat);
        cosLat[y] = cos(lat);
      }
      for (final f in frames) {
        accumulateFrame(
          acc,
          f,
          profile,
          sinLon: sinLon,
          cosLon: cosLon,
          sinLat: sinLat,
          cosLat: cosLat,
        );
      }
      final image = finalizeBlend(acc);

      // North (x = 0.5w) is dominated by the white frame, east (x = 0.75w)
      // by the gray frame; the transition region blends.
      final north = image.getPixel(w ~/ 2, h ~/ 2);
      final east = image.getPixel((3 * w) ~/ 4, h ~/ 2);
      expect(north.r, greaterThan(200));
      expect(east.r, lessThan(160));
    });
  });
}
