import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_rotation_sensor/flutter_rotation_sensor.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:tours360/features/capture/domain/orientation_engine.dart';

/// Unit quaternion rotating about [axis] by [degrees] (right-hand rule).
Quaternion _qFromAxis(List<double> axis, double degrees) {
  final rad = degrees * math.pi / 180;
  final s = math.sin(rad / 2);
  final n = math.sqrt(
    axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2],
  );
  return Quaternion(
    axis[0] / n * s,
    axis[1] / n * s,
    axis[2] / n * s,
    math.cos(rad / 2),
  );
}

/// Hamilton product: apply [b] first, then [a] (like matrix composition).
Quaternion _qMul(Quaternion a, Quaternion b) => Quaternion(
  a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
);

OrientationEvent _event(Quaternion q) =>
    OrientationEvent(quaternion: q, accuracy: -1, timestamp: 0);

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

  group('orientationFromQuaternion (rotation-vector math)', () {
    const up = [0.0, 1.0, 0.0]; // upright phone: accelerometer reads +Y

    test('upright facing north → yaw 0, pitch 0, roll 0', () {
      final o = OrientationEngine.orientationFromQuaternion(
        _qFromAxis(const [1, 0, 0], 90), // portrait tilt: device→world
        deviceUp: up,
      )!;
      expect(o.yaw.abs(), lessThan(1));
      expect(o.pitch.abs(), lessThan(1));
      expect(o.roll.abs(), lessThan(1));
    });

    test('turned 45° right → yaw 45', () {
      final q = _qMul(
        _qFromAxis(const [0, 0, -1], 45), // -90° about +Z: turn right
        _qFromAxis(const [1, 0, 0], 90),
      );
      final o = OrientationEngine.orientationFromQuaternion(q, deviceUp: up)!;
      expect(o.yaw, closeTo(45, 1));
      expect(o.pitch.abs(), lessThan(1));
    });

    test('tilted up 45° → pitch 45, yaw unchanged', () {
      final q = _qFromAxis(const [1, 0, 0], 135); // 90 + 45 about east axis
      final o = OrientationEngine.orientationFromQuaternion(q, deviceUp: up)!;
      expect(o.pitch, closeTo(45, 1));
      expect(o.yaw.abs(), lessThan(1));
      expect(o.roll.abs(), lessThan(1));
    });

    test('inverted quaternion convention is corrected via gravity check', () {
      final q = _qFromAxis(const [1, 0, 0], 135).conjugate();
      final o = OrientationEngine.orientationFromQuaternion(q, deviceUp: up)!;
      expect(o.pitch, closeTo(45, 1)); // flipped back to the true pose
      expect(o.yaw.abs(), lessThan(1));
    });

    test('roll is read from the accelerometer, not the quaternion', () {
      final o = OrientationEngine.orientationFromQuaternion(
        _qFromAxis(const [1, 0, 0], 90),
        deviceUp: const [0.5, 0.866, 0], // device rolled 30° right
      )!;
      expect(o.roll, closeTo(30, 1));
    });

    test('without accelerometer data the standard convention is assumed', () {
      final o = OrientationEngine.orientationFromQuaternion(
        _qFromAxis(const [1, 0, 0], 135),
      )!;
      expect(o.pitch, closeTo(45, 1));
      expect(o.roll, 0);
    });
  });

  group('OrientationEngine fused (rotation-vector stream)', () {
    late StreamController<AccelerometerEvent> accel;
    late StreamController<OrientationEvent> rotation;
    late OrientationEngine engine;

    setUp(() {
      accel = StreamController.broadcast();
      rotation = StreamController.broadcast();
      engine = OrientationEngine(
        accelStream: accel.stream,
        rotationStream: rotation.stream,
      );
    });

    tearDown(() {
      engine.dispose();
      accel.close();
      rotation.close();
    });

    Future<void> feed(Quaternion q) async {
      for (var i = 0; i < 60; i++) {
        accel.add(AccelerometerEvent(0, 9.81, 0, DateTime.now()));
        rotation.add(_event(q));
        await Future<void>.delayed(Duration.zero);
      }
      await Future<void>.delayed(const Duration(milliseconds: 90));
    }

    test('reports yaw from the fused quaternion', () async {
      engine.start();
      final q = _qMul(
        _qFromAxis(const [0, 0, -1], 45),
        _qFromAxis(const [1, 0, 0], 90),
      );
      await feed(q);
      expect(engine.current.yaw, closeTo(45, 3));
      expect(engine.current.pitch.abs(), lessThan(3));
    });

    test('zero() re-bases the fused heading', () async {
      engine.start();
      final q = _qMul(
        _qFromAxis(const [0, 0, -1], 90), // facing east
        _qFromAxis(const [1, 0, 0], 90),
      );
      await feed(q);
      expect(engine.current.yaw, closeTo(90, 3));
      engine.zero();
      await feed(q);
      expect(engine.current.yaw.abs(), lessThan(3));
    });
  });

  group('OrientationEngine movement detection', () {
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

    Future<void> feed(List<AccelerometerEvent> samples) async {
      for (final s in samples) {
        accel.add(s);
        await Future<void>.delayed(Duration.zero);
      }
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }

    AccelerometerEvent sample(double x, double y, double z) =>
        AccelerometerEvent(x, y, z, DateTime.now());

    test('sustained linear acceleration (|a| deviates >25% from 1g) emits '
        'a movement warning, calm rest clears it', () async {
      engine.start();
      final warnings = <bool>[];
      final sub = engine.movementStream.listen(warnings.add);
      // Walking-style acceleration: |(10,10,0)| = 14.14 ≈ 1.44g.
      await feed([for (var i = 0; i < 25; i++) sample(10, 10, 0)]);
      expect(engine.isMoving, isTrue);
      expect(warnings.last, isTrue);
      // Back at rest: |(0, 9.81, 0)| = 1g.
      await feed([for (var i = 0; i < 25; i++) sample(0, 9.81, 0)]);
      expect(engine.isMoving, isFalse);
      expect(warnings.last, isFalse);
      await sub.cancel();
    });

    test('gentle sway stays below the threshold: no warning', () async {
      engine.start();
      final warnings = <bool>[];
      final sub = engine.movementStream.listen(warnings.add);
      // Standing sway: ~5% magnitude deviation.
      await feed([for (var i = 0; i < 40; i++) sample(0.5, 9.81, 0.5)]);
      expect(engine.isMoving, isFalse);
      expect(warnings, isEmpty);
      await sub.cancel();
    });
  });
}
