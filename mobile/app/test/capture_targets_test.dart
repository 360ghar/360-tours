import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';

void main() {
  const screen = Size(400, 800);

  test('16 targets: 8 on the horizon, 4 up, 4 down', () {
    expect(kCaptureTargets.length, 16);
    expect(kCaptureTargets.where((t) => t.pitch == 0).length, 8);
    expect(kCaptureTargets.where((t) => t.pitch == 45).length, 4);
    expect(kCaptureTargets.where((t) => t.pitch == -45).length, 4);
    // Horizon ring is evenly spaced at 45°.
    final yaws = kCaptureTargets
        .where((t) => t.pitch == 0)
        .map((t) => (t.yaw + 360) % 360)
        .toList()
      ..sort();
    expect(yaws, [0, 45, 90, 135, 180, 225, 270, 315]);
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
      isAligned(const CaptureTarget(0, 0),
          const FrameOrientation(yaw: 4, pitch: -4)),
      isTrue,
    );
    expect(
      isAligned(const CaptureTarget(0, 0),
          const FrameOrientation(yaw: 6, pitch: 0)),
      isFalse,
    );
    // Wrap-around alignment.
    expect(
      isAligned(const CaptureTarget(180, 0),
          const FrameOrientation(yaw: -178, pitch: 0)),
      isTrue,
    );
  });
}
