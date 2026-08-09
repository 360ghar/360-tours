import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/capture/domain/stitching/stitcher_service.dart';

/// Production-resolution blend benchmark (Phase 3, Step 5).
///
/// Runs ONLY with `--dart-define=PERF=true` (it stitches at the production
/// 2048x1024 canvas and takes tens of seconds):
///
///   flutter test --dart-define=PERF=true test/stitcher_perf_test.dart
///
/// NOTE: timings are from the test VM (JIT) — real devices (AOT) are
/// typically 2-4x faster. This is a regression/cost tracker, not a device
/// benchmark. Peak blend memory is documented, not measured (VM cannot
/// report per-isolate RSS): ~33.5MB float accumulators + 8.4MB canvas +
/// ~39MB decoded working frames at 640px ≈ 81MB peak.
const _runPerf = bool.fromEnvironment('PERF');

/// Portrait 1080x1920 frames (ResolutionPreset.veryHigh-class content),
/// generated cheaply at half size then resized (generation speed, not
/// quality, is the point here).
img.Image _portraitFrame(int seed) {
  final small = img.Image(width: 540, height: 960);
  for (var y = 0; y < 960; y++) {
    for (var x = 0; x < 540; x++) {
      final v =
          (x * 3 + y * 5 + (x ~/ 25) * 40 + (y ~/ 35) * 30 + seed * 17) % 255;
      small.setPixelRgb(x, y, v, v, v);
    }
  }
  return img.copyResize(small, width: 1080, height: 1920);
}

void main() {
  test('production-resolution blend: 16 / 20 / 24 portrait frames', () async {
    if (!_runPerf) {
      markTestSkipped('run with --dart-define=PERF=true');
      return;
    }
    final dir = await Directory.systemTemp.createTemp('stitch_perf');
    final out = Directory('${dir.path}/out')..createSync(recursive: true);
    // ignore: avoid_print
    print('PERF: generating 24 x 1080x1920 frames...');
    final frames = <String>[];
    for (var i = 0; i < 24; i++) {
      final path = '${dir.path}/f$i.jpg';
      await File(
        path,
      ).writeAsBytes(img.encodeJpg(_portraitFrame(i), quality: 88));
      frames.add(path);
    }
    // ignore: avoid_print
    print('PERF: generated ${frames.length} frames');

    for (final count in [16, 20, 24]) {
      final orientations = [
        for (var i = 0; i < count; i++)
          FrameOrientation(yaw: i * 360.0 / count, pitch: 0),
      ];
      final watch = Stopwatch()..start();
      final result = await const StitcherService().stitch(
        framePaths: frames.sublist(0, count),
        orientations: orientations,
        outDir: out.path,
        preferDevice: false,
      );
      watch.stop();
      final panoSize = File(result.panoramaPath).lengthSync();
      // ignore: avoid_print
      print(
        'PERF: $count frames -> ${watch.elapsedMilliseconds}ms '
        '(${(watch.elapsedMilliseconds / count).toStringAsFixed(0)}ms/frame), '
        'coverage=${result.metrics.coveragePercent.toStringAsFixed(1)}% '
        'overall=${result.metrics.overallScore} '
        'pano=${result.metrics.width}x${result.metrics.height} '
        '${(panoSize / 1024).round()}KB',
      );
    }
    dir.deleteSync(recursive: true);
  });
}
