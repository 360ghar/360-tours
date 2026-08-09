import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';

void main() {
  const screen = Size(400, 800);

  test('fallback profile plan: 24 targets, 10 horizon + 7 + 7 pole rings', () {
    final plan = kFallbackCapturePlan;
    expect(plan.total, 24);
    expect(plan.rings.length, 3);
    expect(plan.rings[0].pitchDeg, 0);
    expect(plan.rings[0].yawCount, 10);
    expect(plan.rings[1].pitchDeg, 55.5);
    expect(plan.rings[1].yawCount, 7);
    expect(plan.rings[2].pitchDeg, -55.5);
    expect(plan.rings[2].yawCount, 7);
    // Horizon ring is evenly spaced at 36°.
    final yaws =
        plan.targets
            .where((t) => t.pitch == 0)
            .map((t) => (t.yaw + 360) % 360)
            .toList()
          ..sort();
    expect(yaws, [for (var i = 0; i < 10; i++) i * 36.0]);
  });

  test('aligned target projects to screen center', () {
    final p = projectTarget(
      target: const CaptureTarget(30, 10),
      orientation: const FrameOrientation(yaw: 30, pitch: 10),
      screenSize: screen,
    );
    expect(p.position.dx, closeTo(200, 0.001));
    expect(p.position.dy, closeTo(400, 0.001));
    expect(p.onScreen, isTrue);
    expect(p.angularError, closeTo(0, 0.001));
  });

  test('target to the right projects right of center', () {
    final p = projectTarget(
      target: const CaptureTarget(20, 0),
      orientation: const FrameOrientation(yaw: 0, pitch: 0),
      screenSize: screen,
    );
    expect(p.position.dx, greaterThan(200));
    expect(p.position.dy, closeTo(400, 0.001));
    expect(p.onScreen, isTrue);
  });

  test('target above projects above center', () {
    final p = projectTarget(
      target: const CaptureTarget(0, 20),
      orientation: const FrameOrientation(yaw: 0, pitch: 0),
      screenSize: screen,
    );
    expect(p.position.dy, lessThan(400));
  });

  test('yaw wrap-around: target at -170 seen from +170 is 20° right', () {
    final p = projectTarget(
      target: const CaptureTarget(-170, 0),
      orientation: const FrameOrientation(yaw: 170, pitch: 0),
      screenSize: screen,
    );
    expect(p.onScreen, isTrue);
    expect(p.position.dx, greaterThan(200));
    expect(p.angularError, closeTo(20, 0.001));
  });

  test('target behind the camera is off-screen with an edge angle', () {
    final p = projectTarget(
      target: const CaptureTarget(180, 0),
      orientation: const FrameOrientation(yaw: 0, pitch: 0),
      screenSize: screen,
    );
    expect(p.onScreen, isFalse);
  });

  test('alignment threshold honours the 5° tolerance', () {
    expect(
      isAligned(
        const CaptureTarget(0, 0),
        const FrameOrientation(yaw: 4, pitch: -4),
      ),
      isTrue,
    );
    expect(
      isAligned(
        const CaptureTarget(0, 0),
        const FrameOrientation(yaw: 6, pitch: 0),
      ),
      isFalse,
    );
    // Wrap-around alignment.
    expect(
      isAligned(
        const CaptureTarget(180, 0),
        const FrameOrientation(yaw: -178, pitch: 0),
      ),
      isTrue,
    );
  });
}
