import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:math';

import 'package:image/image.dart' as img;
import 'package:opencv_dart/opencv_dart.dart' as cv;

import '../../../core/models/models.dart';
import 'capture_targets.dart';

/// Result of a stitch attempt.
class StitchResult {
  final String panoramaPath;
  final String thumbnailPath;
  final bool naive;

  const StitchResult({
    required this.panoramaPath,
    required this.thumbnailPath,
    this.naive = false,
  });
}

/// Stitches captured frames into an equirectangular panorama.
///
/// Ladder: OpenCV Stitcher (quality) → naive orientation-based compositing
/// (always succeeds, visible seams). The cloud rung lives in the upload
/// pipeline (`POST /scenes/{id}/stitch`) and is tried by the caller when
/// this returns a naive result and connectivity allows.
class StitcherService {
  const StitcherService();

  static const _openCvTimeout = Duration(seconds: 90);

  /// Stitch [framePaths] (with matching [orientations]) into [outDir].
  /// [preferDevice] false (cloud-first setting) skips the OpenCV rung so
  /// the backend stitcher does the quality work.
  Future<StitchResult> stitch({
    required List<String> framePaths,
    required List<FrameOrientation> orientations,
    required String outDir,
    bool preferDevice = true,
  }) async {
    final panoPath = '$outDir/panorama.jpg';
    final thumbPath = '$outDir/thumb.jpg';

    // Rung 1: OpenCV spherical stitcher.
    if (preferDevice) {
      try {
        final ok = await _stitchOpenCv(framePaths, panoPath)
            .timeout(_openCvTimeout, onTimeout: () => false);
        if (ok) {
          await _writeThumbnail(panoPath, thumbPath);
          return StitchResult(
              panoramaPath: panoPath, thumbnailPath: thumbPath);
        }
      } catch (_) {
        // fall through to naive
      }
    }

    // Rung 2: naive compositing (always-available device fallback).
    // Rung 3 (cloud stitch) is the caller's job when naive && online.
    // ponytail: no blending, no roll correction — quality ceiling is
    // "obviously stitched"; acceptable as the never-fails fallback.
    await Isolate.run(() => _naiveStitch(
          framePaths: framePaths,
          orientations: orientations.map((o) => [o.yaw, o.pitch]).toList(),
          outPath: panoPath,
        ));
    await _writeThumbnail(panoPath, thumbPath);
    return StitchResult(
      panoramaPath: panoPath,
      thumbnailPath: thumbPath,
      naive: true,
    );
  }

  /// OpenCV panorama stitch. Downscales inputs first (16 full-res frames
  /// OOM mid-range phones), pads the result onto a 2:1 equirect canvas.
  Future<bool> _stitchOpenCv(List<String> framePaths, String outPath) async {
    final mats = <cv.Mat>[];
    try {
      for (final path in framePaths) {
        final mat = cv.imread(path);
        if (mat.isEmpty) continue;
        final longSide = max(mat.width, mat.height);
        if (longSide > 1600) {
          final scale = 1600 / longSide;
          final resized = await cv.resizeAsync(
            mat,
            ((mat.width * scale).round(), (mat.height * scale).round()),
          );
          mat.dispose();
          mats.add(resized);
        } else {
          mats.add(mat);
        }
      }
      if (mats.length < 2) return false;

      final stitcher = cv.Stitcher.create(mode: cv.StitcherMode.PANORAMA);
      final (status, pano) = await stitcher.stitchAsync(cv.VecMat.fromList(mats));
      stitcher.dispose();
      if (status != cv.StitcherStatus.OK || pano.isEmpty) {
        pano.dispose();
        return false;
      }

      // Letterbox onto a 2:1 black canvas — the viewer expects equirect 2:1.
      final padded = _padToTwoToOne(pano);
      pano.dispose();
      final ok = cv.imwrite(outPath, padded);
      padded.dispose();
      return ok;
    } finally {
      for (final m in mats) {
        m.dispose();
      }
    }
  }

  cv.Mat _padToTwoToOne(cv.Mat pano) {
    final w = pano.width, h = pano.height;
    if (w == 2 * h) return pano.clone();
    late int outW, outH;
    if (w > 2 * h) {
      outW = w;
      outH = (w / 2).round();
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

/// Pure-Dart equirectangular compositing from per-frame yaw/pitch.
/// Runs in an isolate. Inverse-maps every destination pixel in each frame's
/// angular footprint through a pinhole model back to a source pixel.
void _naiveStitch({
  required List<String> framePaths,
  required List<List<double>> orientations, // [yaw, pitch] degrees
  required String outPath,
}) {
  const outW = 2048, outH = 1024; // ponytail: modest canvas keeps this fast
  final canvas = img.Image(width: outW, height: outH);

  // Precompute per-column / per-row angles.
  final sinLon = List<double>.filled(outW, 0);
  final cosLon = List<double>.filled(outW, 0);
  for (var x = 0; x < outW; x++) {
    final lon = (x / outW) * 2 * pi - pi; // -180..180, yaw east-positive
    sinLon[x] = sin(lon);
    cosLon[x] = cos(lon);
  }
  final sinLat = List<double>.filled(outH, 0);
  final cosLat = List<double>.filled(outH, 0);
  for (var y = 0; y < outH; y++) {
    final lat = pi / 2 - (y / outH) * pi; // +90 (top) .. -90
    sinLat[y] = sin(lat);
    cosLat[y] = cos(lat);
  }

  final tanH = tan(kHFovDeg * pi / 360); // tan(hfov/2)
  final tanV = tan(kVFovDeg * pi / 360);

  for (var i = 0; i < framePaths.length && i < orientations.length; i++) {
    final srcBytes = File(framePaths[i]).readAsBytesSync();
    final src = img.decodeJpg(srcBytes);
    if (src == null) continue;

    final yaw = orientations[i][0] * pi / 180;
    final pitch = orientations[i][1] * pi / 180;

    // Camera basis in world coords (x=east, y=north, z=up), roll ignored.
    final fwd = [sin(yaw) * cos(pitch), cos(yaw) * cos(pitch), sin(pitch)];
    final right = [cos(yaw), -sin(yaw), 0.0];
    final up = [
      -sin(yaw) * sin(pitch),
      -cos(yaw) * sin(pitch),
      cos(pitch),
    ];

    // Only sweep rows within the frame's vertical footprint (+margin).
    final latMin = pitch - (kVFovDeg + 14) * pi / 360;
    final latMax = pitch + (kVFovDeg + 14) * pi / 360;
    final yStart = max(0, ((pi / 2 - latMax) / pi * outH).floor());
    final yEnd = min(outH, ((pi / 2 - latMin) / pi * outH).ceil());

    for (var y = yStart; y < yEnd; y++) {
      for (var x = 0; x < outW; x++) {
        final dir = [
          sinLon[x] * cosLat[y],
          cosLon[x] * cosLat[y],
          sinLat[y],
        ];
        final w =
            dir[0] * fwd[0] + dir[1] * fwd[1] + dir[2] * fwd[2];
        if (w <= 0.1) continue; // behind or grazing the camera
        final u =
            (dir[0] * right[0] + dir[1] * right[1] + dir[2] * right[2]) / w;
        final v = (dir[0] * up[0] + dir[1] * up[1] + dir[2] * up[2]) / w;
        final sx = u / tanH; // -1..1 across the frame width
        final sy = v / tanV;
        if (sx.abs() > 1 || sy.abs() > 1) continue;
        final px = ((sx + 1) / 2 * (src.width - 1)).round();
        final py = ((1 - sy) / 2 * (src.height - 1)).round();
        canvas.setPixel(x, y, src.getPixel(px, py));
      }
    }
  }

  File(outPath).writeAsBytesSync(img.encodeJpg(canvas, quality: 85));
}
