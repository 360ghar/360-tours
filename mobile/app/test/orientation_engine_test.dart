import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:tours360/features/capture/domain/orientation_engine.dart';

void main() {
  group('wrapDegrees', () {
    test('wraps into (-180, 180]', () {
      expect(wrapDegrees(0), 0);
      expect(wrapDegrees(180), 180);
      expect(wrapDegrees(-180), 180);
      expect(wrapDegrees(190), -170);
      expect(wrapDegrees(-190), 170);
      expect(wrapDegrees(360), 0);
      expect(wrapDegrees(540), 180);
      expect(wrapDegrees(-350), 10);
    });
  });

  group('OrientationEngine fusion', () {
    late StreamController<AccelerometerEvent> accel;
    late StreamController<MagnetometerEvent> mag;
    late OrientationEngine engine;

    setUp(() {
      accel = StreamController.broadcast();
      mag = StreamController.broadcast();
      engine = OrientationEngine(
        accelStream: accel.stream,
        magStream: mag.stream,
      );
    });

    tearDown(() {
      engine.dispose();
      accel.close();
      mag.close();
    });

    /// Feed identical samples repeatedly so the low-pass converges, then
    /// give the 33 ms emit timer real time to fire.
    Future<void> feed(AccelerometerEvent a, MagnetometerEvent m) async {
      for (var i = 0; i < 60; i++) {
        accel.add(a);
        mag.add(m);
        await Future<void>.delayed(Duration.zero);
      }
      await Future<void>.delayed(const Duration(milliseconds: 90));
    }

    test('phone upright facing north → yaw 0, pitch ~0', () async {
      engine.start();
      // Portrait upright: gravity along -Y device axis → accel reads +Y.
      // Magnetic field points north and down (northern hemisphere), but for
      // the math only the horizontal component matters: north = -Z device
      // (camera looks north) with a downward dip.
      await feed(
        AccelerometerEvent(0, 9.81, 0, DateTime.now()),
        MagnetometerEvent(0, 20, -40, DateTime.now()),
      );
      final o = engine.current;
      expect(o.pitch.abs(), lessThan(3));
      expect(wrapDegrees(o.yaw).abs(), lessThan(3));
      expect(o.roll.abs(), lessThan(3));
    });

    test('tilt up 45° changes pitch, not yaw', () async {
      engine.start();
      // Device pitched up 45° about the world east axis, still facing north.
      // World field F = (E:0, N:20, U:-40) expressed in the rotated device
      // frame: mag = (0, -42.43, 14.14); gravity: accel = (0, 6.94, -6.94).
      await feed(
        AccelerometerEvent(0, 6.94, -6.94, DateTime.now()),
        MagnetometerEvent(0, -42.43, 14.14, DateTime.now()),
      );
      final o = engine.current;
      expect(o.pitch, greaterThan(35));
      expect(o.pitch, lessThan(55));
      expect(wrapDegrees(o.yaw).abs(), lessThan(6));
    });

    test('zero() makes current heading yaw 0', () async {
      engine.start();
      // Upright, camera facing EAST: device basis X=-N, Y=U, Z=-E, so the
      // world field F = (E:0, N:20, U:-40) reads as mag = (-20, -40, 0).
      await feed(
        AccelerometerEvent(0, 9.81, 0, DateTime.now()),
        MagnetometerEvent(-20, -40, 0, DateTime.now()),
      );
      final before = engine.current.yaw;
      expect(before, closeTo(90, 5)); // east, before zeroing
      engine.zero();
      await feed(
        AccelerometerEvent(0, 9.81, 0, DateTime.now()),
        MagnetometerEvent(-20, -40, 0, DateTime.now()),
      );
      expect(engine.current.yaw.abs(), lessThan(3));
    });
  });
}
