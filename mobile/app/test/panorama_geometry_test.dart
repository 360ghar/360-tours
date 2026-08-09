import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';
import 'package:tours360/features/capture/domain/stitching/panorama_geometry.dart';

void main() {
  group('equirect <-> world', () {
    test('round-trips at grid points', () {
      const w = 2048, h = 1024;
      for (final (x, y) in [
        (0, 0),
        (w ~/ 2, h ~/ 2),
        (w - 1, h - 1),
        (512, 900),
      ]) {
        final d = equirectToWorld(x.toDouble(), y.toDouble(), w, h);
        final (rx, ry) = worldToEquirect(d, w, h);
        expect(rx, closeTo(x.toDouble(), 0.01));
        expect(ry, closeTo(y.toDouble(), 0.01));
      }
    });

    test('maps east/north/up/zenith correctly', () {
      const w = 360, h = 180;
      // yaw +90 (east) at the horizon: x = 270? (yaw+180)/360*360 = 270.
      final east = equirectToWorld(270, 90, w, h);
      expect(east.x, closeTo(1, 1e-9));
      expect(east.y, closeTo(0, 1e-9));
      expect(east.z, closeTo(0, 1e-9));
      // North at x=180 (yaw 0).
      final north = equirectToWorld(180, 90, w, h);
      expect(north.y, closeTo(1, 1e-9));
      // Zenith at the top row.
      final zenith = equirectToWorld(180, 0, w, h);
      expect(zenith.z, closeTo(1, 1e-9));
    });

    test('x wraps at the ±180 seam', () {
      const w = 360, h = 180;
      final d = equirectToWorld(1, 90, w, h); // just past -180
      final (x, _) = worldToEquirect(d, w, h);
      expect(x, closeTo(1, 0.01)); // wraps back, never negative
      final e = equirectToWorld(359, 90, w, h);
      final (x2, _) = worldToEquirect(e, w, h);
      expect(x2, closeTo(359, 0.01));
    });
  });

  group('camera basis', () {
    test('level pose is orthonormal with right x up = -forward', () {
      final b = cameraBasis(yawDeg: 37, pitchDeg: 12, rollDeg: 0);
      expect(b.right.dot(b.up).abs(), lessThan(1e-9));
      expect(b.up.dot(b.forward).abs(), lessThan(1e-9));
      expect(b.forward.dot(b.right).abs(), lessThan(1e-9));
      expect(b.right.length, closeTo(1, 1e-9));
      final cross = b.right.cross(b.up);
      expect(cross.x, closeTo(-b.forward.x, 1e-9));
      expect(cross.y, closeTo(-b.forward.y, 1e-9));
      expect(cross.z, closeTo(-b.forward.z, 1e-9));
    });

    test('yaw rotates the look direction around world-up', () {
      final b = cameraBasis(yawDeg: 90, pitchDeg: 0, rollDeg: 0);
      expect(b.forward.x, closeTo(1, 1e-9)); // east
      expect(b.forward.y, closeTo(0, 1e-9));
    });

    test('pitch raises the look direction', () {
      final b = cameraBasis(yawDeg: 0, pitchDeg: 45, rollDeg: 0);
      expect(b.forward.z, closeTo(sin(pi / 4), 1e-9));
      expect(b.forward.y, closeTo(cos(pi / 4), 1e-9));
    });

    test('roll keeps the optical axis and preserves handedness', () {
      final b = cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 10);
      expect(b.forward.x, closeTo(0, 1e-12));
      expect(b.forward.y, closeTo(1, 1e-12));
      // Positive roll (top tilted right) tips image-up toward +x (east).
      expect(b.up.x, greaterThan(0.1));
      final level = cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 0);
      final cross = b.right.cross(b.up);
      final levelCross = level.right.cross(level.up);
      expect(cross.x, closeTo(levelCross.x, 1e-9));
      expect(cross.y, closeTo(levelCross.y, 1e-9));
      expect(cross.z, closeTo(levelCross.z, 1e-9));
    });

    test('roll sign: top-center pixel of a level rolled frame lands at '
        'yaw ~ atan2(tan(vFov/2)*sin(roll), 1) — the mobile invariant', () {
      const roll = 10.0;
      final b = cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: roll);
      final tanV = tan(69 * pi / 360);
      final d = Vec3(
        b.up.x * tanV + b.forward.x,
        b.up.y * tanV + b.forward.y,
        b.up.z * tanV + b.forward.z,
      );
      final yaw = atan2(d.x, d.y) * 180 / pi;
      final expected = atan2(sin(roll * pi / 180) * tanV, 1.0) * 180 / pi;
      expect(yaw, closeTo(expected, 0.5));
      expect(yaw, greaterThan(0)); // positive roll → positive yaw
    });
  });

  group('worldToCamera / FOV', () {
    test('on-axis direction projects to the frame center', () {
      final b = cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 0);
      final (u, v) = worldToCamera(b.forward, b)!;
      expect(u, closeTo(0, 1e-9));
      expect(v, closeTo(0, 1e-9));
    });

    test('directions behind the camera are rejected', () {
      final b = cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 0);
      expect(worldToCamera(Vec3(0, -1, 0), b), isNull);
    });

    test('FOV boundaries: exactly half-FOV is inside, beyond is outside', () {
      const profile = CameraProfile.fallbackWide;
      final tanH = tan(55 * pi / 360);
      final tanV = tan(69 * pi / 360);
      expect(insideFov(tanH, 0, profile), isTrue);
      expect(insideFov(0, tanV, profile), isTrue);
      expect(insideFov(tanH * 1.01, 0, profile), isFalse);
      expect(insideFov(0, tanV * 1.01, profile), isFalse);
    });

    test('a rolled frame maps the same world direction to rotated camera '
        'coords', () {
      // World direction at the frame top-center of a level pose, seen
      // through the rolled pose: the roll rotates it off the vertical plane.
      final level = cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 0);
      final tanV = tan(69 * pi / 360);
      final d = Vec3(
        level.up.x * tanV + level.forward.x,
        level.up.y * tanV + level.forward.y,
        level.up.z * tanV + level.forward.z,
      );
      final rolled = cameraBasis(yawDeg: 0, pitchDeg: 0, rollDeg: 10);
      final (u, v) = worldToCamera(d, rolled)!;
      expect(
        u,
        isNot(closeTo(0, 0.01)),
        reason: 'rolled frame sees it off-axis',
      );
      expect(v, lessThan(tanV)); // still inside the vertical FOV
    });
  });
}
