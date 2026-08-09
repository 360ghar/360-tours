import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

import '../capture_targets.dart';
import 'panorama_geometry.dart';

/// One decoded frame ready for blending. Images are pre-converted to
/// interleaved RGB byte buffers (see [frameRgbBytes]) so the hot loop never
/// allocates pixel objects.
class BlendFrame {
  final Uint8List rgb;
  final int width;
  final int height;
  final CameraBasis basis;
  final double gain;
  final bool lowQuality;

  const BlendFrame({
    required this.rgb,
    required this.width,
    required this.height,
    required this.basis,
    required this.gain,
    this.lowQuality = false,
  });
}

/// Converts an image to interleaved RGB bytes (row-major, 3 bytes/pixel).
Uint8List frameRgbBytes(img.Image image) =>
    image.getBytes(order: img.ChannelOrder.rgb);

/// Contribution weight of a frame at normalized coords (sx, sy) in [-1, 1]:
/// `center × edge × quality`.
///
/// - center: gaussian-ish falloff from the optical axis — the sharpest part
///   of the frame dominates.
/// - edge: extra taper over the outer 15% of the frame so hard frame
///   boundaries never cut through a blend (their weight is ~0 there).
/// - quality: a low-quality (hysteresis-accepted) frame still contributes
///   when nothing else covers the region, but at half weight.
double frameWeight(double sx, double sy, {required bool lowQuality}) {
  final r2 = sx * sx + sy * sy;
  final center = exp(-r2 * 1.6);
  final edge =
      ((1 - (sx.abs() - 0.85) / 0.15).clamp(0.0, 1.0)) *
      ((1 - (sy.abs() - 0.85) / 0.15).clamp(0.0, 1.0));
  final quality = lowQuality ? 0.5 : 1.0;
  return center * edge * quality;
}

/// Per-frame exposure gains: each frame's mean luma is pulled toward the
/// median of all means (robust to a few underexposed outliers), clamped to
/// [minGain]..[maxGain] so correction can never look artificial or clip.
/// A target of zero (all-black frames) yields identity gains.
List<double> computeFrameGains(
  List<double> meanLumas, {
  double minGain = 0.85,
  double maxGain = 1.25,
}) {
  if (meanLumas.isEmpty) return const [];
  final sorted = [...meanLumas]..sort();
  final target = sorted[sorted.length ~/ 2];
  if (target <= 1e-6) return List.filled(meanLumas.length, 1.0);
  return [for (final l in meanLumas) (target / l).clamp(minGain, maxGain)];
}

/// Mean luma (0..255) of an RGB byte buffer, sampled over the full frame.
double meanLumaOfRgb(Uint8List rgb) {
  final n = rgb.length ~/ 3;
  if (n == 0) return 0;
  var sum = 0.0;
  for (var i = 0; i < rgb.length; i += 3) {
    sum += 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  }
  return sum / n;
}

/// Bilinear sample of an RGB buffer at pixel coords (fx, fy), scaled by
/// [gain] and clamped. Edges clamp instead of wrapping.
(int, int, int) sampleBilinear(
  Uint8List rgb,
  int width,
  int height,
  double fx,
  double fy,
  double gain,
) {
  final x0 = fx.floor().clamp(0, width - 1);
  final y0 = fy.floor().clamp(0, height - 1);
  final x1 = min(x0 + 1, width - 1);
  final y1 = min(y0 + 1, height - 1);
  // Fractional parts must be clamped too: outside the image the coordinate
  // snaps to the corner pixel (t = 0), never extrapolates past it.
  final tx = (fx - x0).clamp(0.0, 1.0);
  final ty = (fy - y0).clamp(0.0, 1.0);

  double at(int x, int y, int c) => rgb[(y * width + x) * 3 + c].toDouble();
  double lerp(double a, double b, double t) => a + (b - a) * t;

  int channel(int c) {
    final c00 = at(x0, y0, c), c10 = at(x1, y0, c);
    final c01 = at(x0, y1, c), c11 = at(x1, y1, c);
    final top = lerp(c00, c10, tx);
    final bottom = lerp(c01, c11, tx);
    return (lerp(top, bottom, ty) * gain).clamp(0.0, 255.0).round();
  }

  return (channel(0), channel(1), channel(2));
}

/// Per-pixel blend accumulators (Float32 sums keep memory at ~33MB for a
/// 2048×1024 canvas — 4 buffers × 8MB).
class BlendAccumulator {
  final int width;
  final int height;
  final Float32List sumR;
  final Float32List sumG;
  final Float32List sumB;
  final Float32List sumW;

  BlendAccumulator(this.width, this.height)
    : sumR = Float32List(width * height),
      sumG = Float32List(width * height),
      sumB = Float32List(width * height),
      sumW = Float32List(width * height);
}

/// Conservative latitude band a frame can paint, INCLUDING roll: the corners
/// of a rolled frame extend further in latitude than the unrolled vertical
/// FOV (horizontal FOV rotates into latitude). Used to cull rows safely.
/// The bound is exact for the frame corners:
///   d_z(u,v) = fwd.z + tanH·u·right'_z + tanV·v·up'_z, u,v in [-1,1]
(double latMinDeg, double latMaxDeg) frameLatitudeBand(
  CameraBasis basis,
  CameraProfile profile,
) {
  final tanH = tan(profile.hFovDeg * pi / 360);
  final tanV = tan(profile.vFovDeg * pi / 360);
  final corner = tanH * basis.right.z.abs() + tanV * basis.up.z.abs();
  final maxDz = (basis.forward.z + corner).clamp(-1.0, 1.0);
  final minDz = (basis.forward.z - corner).clamp(-1.0, 1.0);
  // +1° margin for float noise.
  return (asin(minDz) * 180 / pi - 1, asin(maxDz) * 180 / pi + 1);
}

/// Accumulate one frame's contribution onto [acc]. Precomputed per-column
/// longitude and per-row latitude trig tables make the inner loop cheap.
void accumulateFrame(
  BlendAccumulator acc,
  BlendFrame frame,
  CameraProfile profile, {
  required List<double> sinLon,
  required List<double> cosLon,
  required List<double> sinLat,
  required List<double> cosLat,
}) {
  final w = acc.width, h = acc.height;
  final (tanH, tanV) = fovTangents(profile);
  final right = frame.basis.right,
      up = frame.basis.up,
      fwd = frame.basis.forward;

  // Only rows inside the frame's (roll-aware) latitude band can contribute —
  // halves the sweep for the pole rings without losing rolled edges.
  final (latMinDeg, latMaxDeg) = frameLatitudeBand(frame.basis, profile);
  final latMin = latMinDeg * pi / 180;
  final latMax = latMaxDeg * pi / 180;
  final yStart = max(0, ((pi / 2 - latMax) / pi * h).floor());
  final yEnd = min(h, ((pi / 2 - latMin) / pi * h).ceil());
  if (yStart >= yEnd) return;

  final rgb = frame.rgb;
  final fw = frame.width, fh = frame.height;
  final gain = frame.gain;
  final lowQuality = frame.lowQuality;

  for (var y = yStart; y < yEnd; y++) {
    final cosLatY = cosLat[y];
    final sinLatY = sinLat[y];
    final rowBase = y * w;
    for (var x = 0; x < w; x++) {
      final i = rowBase + x;
      // World direction of this equirect pixel.
      final dx = sinLon[x] * cosLatY;
      final dy = cosLon[x] * cosLatY;
      final dz = sinLatY;
      // Camera tangent coords.
      final f = dx * fwd.x + dy * fwd.y + dz * fwd.z;
      if (f <= 0.05) continue; // behind or grazing the camera
      final u = (dx * right.x + dy * right.y + dz * right.z) / f;
      final v = (dx * up.x + dy * up.y + dz * up.z) / f;
      final sx = u / tanH, sy = v / tanV; // normalize to [-1, 1]
      if (sx.abs() > 1 || sy.abs() > 1) continue;

      // Weight includes a f = cos(off-axis) factor: grazing regions of the
      // frame project onto proportionally larger equirect areas, so their
      // per-pixel contribution is scaled down to keep exposure even.
      final weight = frameWeight(sx, sy, lowQuality: lowQuality) * f;
      if (weight <= 0.001) continue;

      // Source pixel (bilinear).
      final px = (sx + 1) / 2 * (fw - 1);
      final py = (1 - sy) / 2 * (fh - 1);
      final (r, g, b) = sampleBilinear(rgb, fw, fh, px, py, gain);

      acc.sumR[i] += r * weight;
      acc.sumG[i] += g * weight;
      acc.sumB[i] += b * weight;
      acc.sumW[i] += weight;
    }
  }
}

/// Finalize accumulated sums into an equirect image. Uncovered pixels stay
/// black (honestly uncovered — no fabricated pixels).
img.Image finalizeBlend(BlendAccumulator acc) {
  final image = img.Image(width: acc.width, height: acc.height);
  final n = acc.width * acc.height;
  for (var i = 0; i < n; i++) {
    final wSum = acc.sumW[i];
    if (wSum <= 0) continue;
    final x = i % acc.width, y = i ~/ acc.width;
    image.setPixelRgb(
      x,
      y,
      (acc.sumR[i] / wSum).clamp(0.0, 255.0).round(),
      (acc.sumG[i] / wSum).clamp(0.0, 255.0).round(),
      (acc.sumB[i] / wSum).clamp(0.0, 255.0).round(),
    );
  }
  return image;
}
