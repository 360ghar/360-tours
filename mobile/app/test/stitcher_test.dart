import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/capture/domain/stitcher_service.dart';

/// Synthetic textured frame: noise + a colored band so output is checkable.
Future<String> writeFrame(Directory dir, int i, int seed) async {
  final frame = img.Image(width: 320, height: 400);
  final rng = seed;
  for (var y = 0; y < frame.height; y++) {
    for (var x = 0; x < frame.width; x++) {
      final v = ((x * 7 + y * 13 + rng * 31) % 255);
      frame.setPixelRgb(x, y, v, (v + i * 40) % 255, 255 - v);
    }
  }
  final path = '${dir.path}/frame_$i.jpg';
  await File(path).writeAsBytes(img.encodeJpg(frame, quality: 90));
  return path;
}

void main() {
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('stitch_test');
  });

  tearDown(() => dir.delete(recursive: true));

  test('naive compositing produces a 2:1 equirect with painted regions',
      () async {
    final frames = <String>[];
    final orientations = <FrameOrientation>[];
    for (var i = 0; i < 4; i++) {
      frames.add(await writeFrame(dir, i, i));
      orientations.add(FrameOrientation(yaw: i * 90.0, pitch: 0));
    }

    // preferDevice: false skips the OpenCV rung → exercises the pure-Dart
    // fallback deterministically on any host.
    final result = await const StitcherService().stitch(
      framePaths: frames,
      orientations: orientations,
      outDir: dir.path,
      preferDevice: false,
    );

    expect(result.naive, isTrue);
    final pano = img.decodeJpg(await File(result.panoramaPath).readAsBytes());
    expect(pano, isNotNull);
    expect(pano!.width, pano.height * 2, reason: 'equirect must be 2:1');

    // The horizon row must be painted (non-black) around each frame center.
    final midY = pano.height ~/ 2;
    for (final yaw in [0.0, 90.0, 180.0, -90.0]) {
      final x = (((yaw + 180) / 360) * pano.width).round() % pano.width;
      final px = pano.getPixel(x, midY);
      final lum = px.r + px.g + px.b;
      expect(lum, greaterThan(30),
          reason: 'expected painted pixels at yaw $yaw');
    }

    // Thumbnail exists and is smaller.
    final thumb =
        img.decodeJpg(await File(result.thumbnailPath).readAsBytes());
    expect(thumb!.width, lessThanOrEqualTo(640));
  });
}
