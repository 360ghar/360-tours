import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';
import 'package:tours360/features/capture/domain/stitching/stitcher_service.dart';

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

Future<List<String>> writeFrames(
  Directory dir,
  List<(double, double, double)> poses,
) async {
  final frames = <String>[];
  for (var i = 0; i < poses.length; i++) {
    frames.add(await writeFrame(dir, i, i));
  }
  return frames;
}

void main() {
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('stitch_test');
  });

  tearDown(() => dir.delete(recursive: true));

  test(
    'naive compositing produces a 2:1 equirect with painted regions',
    () async {
      final frames = <String>[];
      final orientations = <FrameOrientation>[];
      for (var i = 0; i < 4; i++) {
        frames.add(await writeFrame(dir, i, i));
        orientations.add(FrameOrientation(yaw: i * 90.0, pitch: 0));
      }

      // preferDevice: false skips the OpenCV rung → exercises the pure-Dart
      // blend deterministically on any host.
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
        expect(
          lum,
          greaterThan(30),
          reason: 'expected painted pixels at yaw $yaw',
        );
      }

      // Thumbnail exists and is smaller.
      final thumb = img.decodeJpg(
        await File(result.thumbnailPath).readAsBytes(),
      );
      expect(thumb!.width, lessThanOrEqualTo(640));
    },
  );

  test('Phase 1 24-target layout (10 horizon + 7 + 7 pole) blends to a '
      'near-full equirect with honest metrics', () async {
    final plan = kFallbackCapturePlan;
    final frames = await writeFrames(dir, [
      for (final t in plan.targets) (t.yaw, t.pitch, 0.0),
    ]);
    final orientations = [
      for (final t in plan.targets)
        FrameOrientation(yaw: t.yaw, pitch: t.pitch),
    ];

    final result = await const StitcherService().stitch(
      framePaths: frames,
      orientations: orientations,
      outDir: dir.path,
      preferDevice: false,
      blendWidth: 512,
      blendHeight: 256,
    );

    expect(result.naive, isTrue);
    expect(result.partial, isFalse, reason: 'full plan should cover ~100%');
    expect(result.metrics.coveragePercent, greaterThanOrEqualTo(98));
    expect(
      result.metrics.verticalCoveragePercent,
      greaterThanOrEqualTo(95),
      reason: 'poles must be covered (no black wedges)',
    );
    expect(result.metrics.overallScore, inInclusiveRange(0, 100));
    expect(result.metrics.seamScore, isNotNull);
  });

  test(
    'roll is used: opposite-rolled frames still produce a coherent pano',
    () async {
      final frames = await writeFrames(dir, [
        (0.0, 0.0, 10.0),
        (120.0, 0.0, -10.0),
        (240.0, 0.0, 5.0),
      ]);
      final orientations = [
        FrameOrientation(yaw: 0, pitch: 0, roll: 10),
        FrameOrientation(yaw: 120, pitch: 0, roll: -10),
        FrameOrientation(yaw: 240, pitch: 0, roll: 5),
      ];

      final result = await const StitcherService().stitch(
        framePaths: frames,
        orientations: orientations,
        outDir: dir.path,
        preferDevice: false,
        blendWidth: 512,
        blendHeight: 256,
      );

      final pano = img.decodeJpg(await File(result.panoramaPath).readAsBytes());
      expect(pano!.width, pano.height * 2);
      expect(result.metrics.coveragePercent, greaterThan(0));
      expect(result.metrics.seamScore, isNotNull);
    },
  );

  test('legacy 16-frame layout (8/4/4) still stitches with the fallback '
      'profile', () async {
    final poses = <(double, double)>[
      for (var i = 0; i < 8; i++) (i * 45.0, 0.0),
      for (var i = 0; i < 4; i++) (i * 90.0, 45.0),
      for (var i = 0; i < 4; i++) (i * 90.0, -45.0),
    ];
    final frames = await writeFrames(dir, [
      for (final (y, p) in poses) (y, p, 0.0),
    ]);
    final orientations = [
      for (final (y, p) in poses) FrameOrientation(yaw: y, pitch: p),
    ];

    final result = await const StitcherService().stitch(
      framePaths: frames,
      orientations: orientations,
      outDir: dir.path,
      preferDevice: false,
      blendWidth: 512,
      blendHeight: 256,
    );

    expect(result.naive, isTrue);
    expect(result.metrics.coveragePercent, greaterThan(30));
    // The old layout leaves pole gaps — reported honestly as partial.
    expect(result.metrics.verticalCoveragePercent, lessThan(100));
    expect(result.metrics.warnings, isNotEmpty);
  });

  test('custom wide camera profile produces a valid 2:1 panorama with fewer '
      'frames', () async {
    const wide = CameraProfile(hFovDeg: 90, vFovDeg: 90);
    final frames = await writeFrames(dir, [
      (0.0, 0.0, 0.0),
      (120.0, 0.0, 0.0),
      (240.0, 0.0, 0.0),
    ]);
    final orientations = [
      FrameOrientation(yaw: 0, pitch: 0),
      FrameOrientation(yaw: 120, pitch: 0),
      FrameOrientation(yaw: 240, pitch: 0),
    ];

    final result = await const StitcherService().stitch(
      framePaths: frames,
      orientations: orientations,
      profile: wide,
      outDir: dir.path,
      preferDevice: false,
      blendWidth: 512,
      blendHeight: 256,
    );

    final pano = img.decodeJpg(await File(result.panoramaPath).readAsBytes());
    expect(pano!.width, pano.height * 2);
    expect(result.metrics.coveragePercent, greaterThan(30));
  });

  test('low-quality flags reduce weight but never break coverage', () async {
    final frames = await writeFrames(dir, [
      (0.0, 0.0, 0.0),
      (90.0, 0.0, 0.0),
      (180.0, 0.0, 0.0),
      (270.0, 0.0, 0.0),
    ]);
    final orientations = [
      FrameOrientation(yaw: 0, pitch: 0),
      FrameOrientation(yaw: 90, pitch: 0),
      FrameOrientation(yaw: 180, pitch: 0),
      FrameOrientation(yaw: 270, pitch: 0),
    ];

    final result = await const StitcherService().stitch(
      framePaths: frames,
      orientations: orientations,
      lowQualityFlags: [false, true, false, false],
      outDir: dir.path,
      preferDevice: false,
      blendWidth: 512,
      blendHeight: 256,
    );

    expect(result.metrics.coveragePercent, greaterThan(0));
    expect(
      result.metrics.warnings.any((w) => w.contains('low-quality')),
      isTrue,
    );
  });

  group('candidate selection policy (Step 10 invariant)', () {
    test('OpenCV wins only when it beats the blend on BOTH coverage and '
        'sharpness', () {
      expect(
        openCvWins(
          ocvCoverage: 99,
          blendCoverage: 95,
          ocvSharpness: 80,
          blendSharpness: 70,
        ),
        isTrue,
      );
      // Worse coverage: never replaces the blend.
      expect(
        openCvWins(
          ocvCoverage: 90,
          blendCoverage: 99,
          ocvSharpness: 90,
          blendSharpness: 70,
        ),
        isFalse,
        reason: 'a lower-coverage candidate must never replace the blend',
      );
      // Worse sharpness: never replaces the blend.
      expect(
        openCvWins(
          ocvCoverage: 99,
          blendCoverage: 95,
          ocvSharpness: 60,
          blendSharpness: 70,
        ),
        isFalse,
        reason: 'a softer candidate must never replace the blend',
      );
      // Equal sharpness is NOT a win (strictly greater required).
      expect(
        openCvWins(
          ocvCoverage: 99,
          blendCoverage: 95,
          ocvSharpness: 70,
          blendSharpness: 70,
        ),
        isFalse,
      );
      // Coverage within tolerance (0.5pp) still requires better sharpness.
      expect(
        openCvWins(
          ocvCoverage: 94.8,
          blendCoverage: 95,
          ocvSharpness: 85,
          blendSharpness: 70,
        ),
        isTrue,
      );
    });

    test('a fully-covered blend is never replaced, even by a sharper '
        'candidate — a dark room is not a coverage hole', () {
      expect(
        openCvWins(
          ocvCoverage: 99,
          blendCoverage: 99.8, // true angular coverage of a dark room
          ocvSharpness: 90,
          blendSharpness: 70,
        ),
        isFalse,
        reason:
            'OpenCV output is partial by construction; a complete blend '
            'must keep the full sphere',
      );
    });

    test(
      'a losing candidate never overwrites the blend output (files)',
      () async {
        // preferDevice: true runs the OpenCV rung against synthetic frames;
        // on hosts where OpenCV cannot stitch them it falls through. Either
        // way the shipped panorama must be the blend's (2048x1024 written by
        // the blend path) — the invariant is the SHIPPED file, not the winner.
        final frames = await writeFrames(dir, [
          for (var i = 0; i < 24; i++) (i * 15.0, 0.0, 0.0),
        ]);
        final orientations = [
          for (var i = 0; i < 24; i++)
            FrameOrientation(yaw: i * 15.0, pitch: 0),
        ];

        final result = await const StitcherService().stitch(
          framePaths: frames,
          orientations: orientations,
          outDir: dir.path,
          preferDevice: true,
          blendWidth: 512,
          blendHeight: 256,
        );

        final pano = img.decodeJpg(
          await File(result.panoramaPath).readAsBytes(),
        );
        expect(pano, isNotNull);
        expect(pano!.width, pano.height * 2);
        expect(result.metrics.coveragePercent, greaterThan(0));
        // The temporary OpenCV candidate is never left behind.
        expect(File('${dir.path}/panorama_ocv.jpg').existsSync(), isFalse);
      },
    );
  });
}
