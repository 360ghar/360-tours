import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';
import 'package:tours360/features/capture/domain/frame_quality.dart';
import 'package:tours360/features/capture/presentation/capture_controller.dart';

/// Deterministic fixtures: a textured 256x256 image (gradient + noise +
/// block edges), then blur/dark/bright variants. The same fixture pixels are
/// used on every run, so gate thresholds are stable.
img.Image _textured({int seed = 42}) {
  final rng = Random(seed);
  final image = img.Image(width: 256, height: 256);
  for (var y = 0; y < 256; y++) {
    for (var x = 0; x < 256; x++) {
      var l = 120 + 80 * x / 256 + (rng.nextDouble() - 0.5) * 40;
      if ((x ~/ 32) % 2 == (y ~/ 32) % 2) l += 30;
      final li = l.clamp(0, 255).round();
      image.setPixelRgb(x, y, li, li, li);
    }
  }
  return image;
}

img.Image _solid(double luma, {double noise = 0}) {
  final rng = Random(7);
  final image = img.Image(width: 256, height: 256);
  for (var y = 0; y < 256; y++) {
    for (var x = 0; x < 256; x++) {
      final v = (luma + (rng.nextDouble() - 0.5) * 2 * noise)
          .clamp(0, 255)
          .round();
      image.setPixelRgb(x, y, v, v, v);
    }
  }
  return image;
}

/// A photo-like room fixture: ceiling (light), wall (mid), floor (dark),
/// a bright window region, mild sensor noise, and a soft furniture edge.
/// More representative of real captures than pure noise — used by the
/// calibration sweep to measure the gate's real margins.
img.Image _roomLike({int seed = 3}) {
  final rng = Random(seed);
  final image = img.Image(width: 256, height: 256);
  for (var y = 0; y < 256; y++) {
    final region = y < 70
        ? 190.0 // ceiling
        : y < 190
        ? 130.0 // wall
        : 70.0; // floor
    for (var x = 0; x < 256; x++) {
      var l = region;
      if (y > 70 && y < 190 && x > 180) l = 235.0; // window
      if ((x - y).abs() < 4 && y > 150 && y < 190) l = 60.0; // table edge
      l += (rng.nextDouble() - 0.5) * 8; // sensor noise
      final v = l.clamp(0, 255).round();
      image.setPixelRgb(x, y, v, v, v);
    }
  }
  return image;
}

void main() {
  late Directory dir;
  final gate = const FrameQualityGate();

  Future<String> write(String name, img.Image image) async {
    final path = '${dir.path}/$name.jpg';
    await File(path).writeAsBytes(img.encodeJpg(image, quality: 90));
    return path;
  }

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('tours360_quality');
  });

  tearDown(() => dir.delete(recursive: true));

  group('calibration', () {
    test('prints measured sharpness/brightness of the fixtures', () async {
      final sharp = await write('sharp', _textured());
      final blur4 = await write(
        'blur4',
        img.gaussianBlur(_textured(), radius: 4),
      );
      final blur8 = await write(
        'blur8',
        img.gaussianBlur(_textured(), radius: 8),
      );
      final blur2 = await write(
        'blur2',
        img.gaussianBlur(_textured(), radius: 2),
      );
      final dark = await write('dark', _solid(8));
      final bright = await write('bright', _solid(255));
      for (final f in [sharp, blur2, blur4, blur8, dark, bright]) {
        final q = gate.evaluate(f);
        // ignore: avoid_print
        print(
          'quality ${f.split('\\').last}: sharp=${q.sharpness.toStringAsFixed(1)} bright=${q.brightness.toStringAsFixed(3)}',
        );
      }
    });

    test('photo-like room fixture: blur sweep vs kMinSharpness (Phase 3 '
        'calibration evidence)', () async {
      // A representative room image (ceiling/wall/floor/window/edge) blurred
      // from 0 to 8px at 256px. Documents the threshold margin against
      // photo-real content, not pure noise. NOTE: img.gaussianBlur mutates
      // its input, so every radius gets a fresh fixture.
      final rows = <String>[];
      var acceptedUpTo = -1;
      for (var radius = 0; radius <= 8; radius++) {
        final q = gate.evaluate(
          await write(
            'room_blur$radius',
            radius == 0
                ? _roomLike()
                : img.gaussianBlur(_roomLike(), radius: radius),
          ),
        );
        final accepted = q.sharpness >= FrameQualityGate.kMinSharpness;
        if (accepted) acceptedUpTo = radius;
        rows.add(
          '  radius=$radius: sharp=${q.sharpness.toStringAsFixed(1)} '
          '${accepted ? 'ACCEPT' : 'reject'}',
        );
        // ignore: avoid_print
        print(
          'calibration room blur=$radius sharp=${q.sharpness.toStringAsFixed(1)} '
          'bright=${q.brightness.toStringAsFixed(3)} '
          '${accepted ? 'ACCEPT' : 'reject'}',
        );
      }
      // A sharp room photo is far above the threshold; heavy blur (radius
      // >= 6 at 256px = badly defocused capture) is far below.
      final sharp = gate.evaluate(await write('room_sharp', _roomLike()));
      expect(
        sharp.sharpness,
        greaterThan(FrameQualityGate.kMinSharpness * 3),
        reason:
            'sharp room content must sit well above the threshold:\n'
            '${rows.join('\n')}',
      );
      // Mild blur (radius 1) must NOT be false-rejected (hand-shake class).
      final mild = gate.evaluate(
        await write('room_blur1', img.gaussianBlur(_roomLike(), radius: 1)),
      );
      expect(
        mild.sharpness,
        greaterThanOrEqualTo(FrameQualityGate.kMinSharpness),
        reason:
            'mild blur must be accepted — threshold must stay below it:\n'
            '${rows.join('\n')}',
      );
      final heavy = gate.evaluate(
        await write('room_blur6', img.gaussianBlur(_roomLike(), radius: 6)),
      );
      expect(
        heavy.sharpness,
        lessThan(FrameQualityGate.kMinSharpness),
        reason:
            'heavy blur must sit well below the threshold:\n'
            '${rows.join('\n')}',
      );
      // Moderate blur (radius 2-3) is borderline — hysteresis handles it.
      // ignore: avoid_print
      print('calibration crossing: accepted up to radius=$acceptedUpTo');
    });

    test('exposure sweep vs photo-like content (Phase 3 calibration '
        'evidence)', () async {
      final base = _roomLike(seed: 11);
      for (final scale in [0.02, 0.04, 0.05, 0.10, 0.9, 0.96, 0.97, 0.99]) {
        final scaled = img.Image(width: base.width, height: base.height);
        for (var y = 0; y < base.height; y++) {
          for (var x = 0; x < base.width; x++) {
            final px = base.getPixel(x, y);
            final v = (px.r * scale).round().clamp(0, 255);
            scaled.setPixelRgb(x, y, v, v, v);
          }
        }
        final q = gate.evaluate(
          await write('exp${scale.toStringAsFixed(2)}', scaled),
        );
        // ignore: avoid_print
        print(
          'calibration exposure scale=$scale '
          'bright=${q.brightness.toStringAsFixed(4)} '
          'sharp=${q.sharpness.toStringAsFixed(1)}',
        );
      }
      // A legitimately dark-ish room (mean ~0.08, textured) must be
      // accepted; a truly black frame rejected.
      final darkish = _solid(20, noise: 12);
      final darkResult = gate.assess(
        gate.evaluate(await write('darkish', darkish)),
        consecutiveRejects: 0,
      );
      expect(
        darkResult.accepted,
        isTrue,
        reason: 'normal dark rooms must not be rejected',
      );
    });
  });

  group('gate decisions', () {
    test('sharp image -> accepted', () async {
      final path = await write('sharp', _textured());
      final q = gate.evaluate(path);
      final r = gate.assess(q, consecutiveRejects: 0);
      expect(r.accepted, isTrue);
      expect(r.rejectionReason, isNull);
      expect(q.sharpness, greaterThan(FrameQualityGate.kMinSharpness));
    });

    test('extremely blurry image -> rejected tooBlurry', () async {
      final path = await write(
        'blur8',
        img.gaussianBlur(_textured(), radius: 8),
      );
      final q = gate.evaluate(path);
      final r = gate.assess(q, consecutiveRejects: 0);
      expect(r.accepted, isFalse);
      expect(r.rejectionReason, FrameRejectionReason.tooBlurry);
    });

    test('extremely dark image -> rejected tooDark', () async {
      final path = await write('dark', _solid(8));
      final q = gate.evaluate(path);
      final r = gate.assess(q, consecutiveRejects: 0);
      expect(r.accepted, isFalse);
      expect(r.rejectionReason, FrameRejectionReason.tooDark);
    });

    test('extremely bright image -> rejected tooBright', () async {
      final path = await write('bright', _solid(255));
      final q = gate.evaluate(path);
      final r = gate.assess(q, consecutiveRejects: 0);
      expect(r.accepted, isFalse);
      expect(r.rejectionReason, FrameRejectionReason.tooBright);
    });

    test('borderline (mild blur, normal-ish exposure) -> accepted', () async {
      // radius 1 keeps most texture: measured variance stays well above
      // kMinSharpness (radius 2 collapses it below — that IS blurry).
      final path = await write(
        'blur1',
        img.gaussianBlur(_textured(), radius: 1),
      );
      final q = gate.evaluate(path);
      expect(q.sharpness, greaterThan(FrameQualityGate.kMinSharpness));
      final r = gate.assess(q, consecutiveRejects: 0);
      expect(r.accepted, isTrue);
    });

    test(
      'bright-but-legal exposure (luma 0.94, textured) -> accepted',
      () async {
        // Textured so sharpness is not the issue: only exposure is being
        // probed here.
        final path = await write('whitewall', _solid(240, noise: 12));
        final q = gate.evaluate(path);
        expect(q.brightness, closeTo(240 / 255, 0.01));
        expect(q.sharpness, greaterThan(FrameQualityGate.kMinSharpness));
        final r = gate.assess(q, consecutiveRejects: 0);
        expect(r.accepted, isTrue);
      },
    );

    test('hysteresis: after 3 rejections the blurry frame is accepted '
        'with the low-quality flag', () async {
      final path = await write(
        'blur8',
        img.gaussianBlur(_textured(), radius: 8),
      );
      final q = gate.evaluate(path);
      for (var i = 0; i < 2; i++) {
        expect(gate.assess(q, consecutiveRejects: i).accepted, isFalse);
      }
      final r = gate.assess(q, consecutiveRejects: 2);
      expect(r.accepted, isTrue);
      expect(r.quality.lowQuality, isTrue);
    });
  });

  group('decideCapture state machine', () {
    const oriented = FrameOrientation(yaw: 0, pitch: 0, roll: 0);
    FrameQualityResult ok({bool lowQuality = false}) => FrameQualityResult(
      quality: FrameQuality(
        sharpness: 500,
        brightness: 0.5,
        lowQuality: lowQuality,
      ),
      accepted: true,
    );

    test('rejection keeps the SAME target (single-target retake)', () {
      final s = decideCapture(
        state: const CaptureState(
          phase: CapturePhase.aiming,
          targetIndex: 3,
          framePaths: ['a', 'b'],
        ),
        path: 'c.jpg',
        orientation: oriented,
        qualityResult: const FrameQualityResult(
          quality: FrameQuality(sharpness: 1, brightness: 0.5),
          accepted: false,
          rejectionReason: FrameRejectionReason.tooBlurry,
        ),
        duplicate: false,
        consecutiveRejects: 0,
      );
      expect(s.state.targetIndex, 3);
      expect(s.state.phase, CapturePhase.aiming);
      expect(s.state.framePaths.length, 2, reason: 'no frame recorded');
      expect(s.state.rejectionReason, FrameRejectionReason.tooBlurry);
      expect(s.consecutiveRejects, 1);
    });

    test(
      'acceptance advances and records the frame for the current target',
      () {
        final s = decideCapture(
          state: const CaptureState(
            phase: CapturePhase.aiming,
            targetIndex: 3,
            framePaths: ['a', 'b'],
          ),
          path: 'c.jpg',
          orientation: oriented,
          qualityResult: ok(),
          duplicate: false,
          consecutiveRejects: 2,
        );
        expect(s.state.targetIndex, 4);
        expect(s.state.framePaths, ['a', 'b', 'c.jpg']);
        expect(s.state.capturedTargets, [3]);
        expect(s.state.rejectionReason, isNull);
        expect(s.consecutiveRejects, 0);
      },
    );

    test('duplicate angle is rejected even when quality is fine', () {
      final s = decideCapture(
        state: const CaptureState(
          phase: CapturePhase.aiming,
          targetIndex: 2,
          capturedTargets: [1],
          framePaths: ['b.jpg'],
          frameOrientations: [FrameOrientation(yaw: 36, pitch: 0)],
        ),
        path: 'c.jpg',
        orientation: const FrameOrientation(yaw: 34, pitch: 1),
        qualityResult: ok(),
        duplicate: true,
        consecutiveRejects: 2,
      );
      expect(s.state.targetIndex, 2, reason: 'same target, no advance');
      expect(s.state.rejectionReason, FrameRejectionReason.duplicate);
      expect(
        s.consecutiveRejects,
        2,
        reason: 'duplicates never count toward the blur hysteresis',
      );
    });

    test('last target captured + all angles present -> review', () {
      final plan = kFallbackCapturePlan;
      final state = CaptureState(
        phase: CapturePhase.aiming,
        targetIndex: plan.total - 1,
        capturedTargets: [for (var i = 0; i < plan.total - 1; i++) i],
        framePaths: [for (var i = 0; i < plan.total - 1; i++) '$i.jpg'],
        frameOrientations: [for (var i = 0; i < plan.total - 1; i++) oriented],
        plan: plan,
      );
      final s = decideCapture(
        state: state,
        path: 'last.jpg',
        orientation: oriented,
        qualityResult: ok(),
        duplicate: false,
        consecutiveRejects: 0,
      );
      expect(s.state.phase, CapturePhase.review);
      expect(s.state.captureComplete, isTrue);
      expect(s.state.done, isTrue);
    });

    test('last target captured with skips -> stays aiming, completion flag, '
        'missing angles surfaced', () {
      final plan = kFallbackCapturePlan;
      final state = CaptureState(
        phase: CapturePhase.aiming,
        targetIndex: plan.total - 1,
        capturedTargets: [0, 1],
        framePaths: ['0.jpg', '1.jpg'],
        frameOrientations: [oriented, oriented],
        skippedTargets: {2},
        plan: plan,
      );
      final s = decideCapture(
        state: state,
        path: 'last.jpg',
        orientation: oriented,
        qualityResult: ok(),
        duplicate: false,
        consecutiveRejects: 0,
      );
      expect(s.state.phase, CapturePhase.aiming);
      expect(s.state.captureComplete, isTrue);
      final missing = plan.missingTargets(s.state.capturedTargets.toSet());
      expect(missing.length, plan.total - 3);
    });

    test('hysteresis accepted frame is flagged low quality', () {
      final s = decideCapture(
        state: const CaptureState(
          phase: CapturePhase.aiming,
          targetIndex: 1,
          framePaths: ['a'],
        ),
        path: 'b.jpg',
        orientation: oriented,
        qualityResult: ok(lowQuality: true),
        duplicate: false,
        consecutiveRejects: 2,
      );
      expect(s.state.lowQualityTargets, {1});
    });
  });
}
