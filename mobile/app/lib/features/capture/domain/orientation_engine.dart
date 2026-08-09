import 'dart:async';
import 'dart:math';

import 'package:flutter_rotation_sensor/flutter_rotation_sensor.dart'
    hide SensorInterval;
import 'package:sensors_plus/sensors_plus.dart';

import '../../../core/models/models.dart';

/// Fused device orientation.
///
/// Primary path: the platform rotation-vector sensor (gyroscope +
/// magnetometer + accelerometer fused by the OS) — smooth, drift-bounded
/// heading, no compass jitter. Fallback: the classic accelerometer +
/// magnetometer fusion (Android getRotationMatrix construction) for
/// platforms without a rotation-vector sensor (unit tests, desktop).
/// Yaw is reported relative to the heading captured by [zero] so targets
/// are laid out from wherever the agent starts — no compass calibration.
class OrientationEngine {
  OrientationEngine({this._accelStream, this._magStream, this._rotationStream});

  final Stream<AccelerometerEvent>? _accelStream;
  final Stream<MagnetometerEvent>? _magStream;
  final Stream<OrientationEvent>? _rotationStream;

  final _controller = StreamController<FrameOrientation>.broadcast();
  StreamSubscription<AccelerometerEvent>? _accelSub;
  StreamSubscription<MagnetometerEvent>? _magSub;
  StreamSubscription<OrientationEvent>? _rotationSub;
  Timer? _emitTimer;

  static const _alpha = 0.15; // low-pass factor

  // Movement detection: at rest |accel| == gravity regardless of tilt, so
  // magnitude deviation from 1g is a translation proxy (never a position
  // estimate — just "the phone moved while shooting").
  static const _gravity = 9.80665;

  /// |accel| must deviate from 1g by more than this fraction. Tuned to catch
  /// obvious movement (walking, repositioning) while ignoring gentle sway
  /// (standing holds typically stay under ~15%).
  static const double kMovementDeviation = 0.25;

  /// Samples in the movement window (~0.6s at game interval).
  static const int _movementWindow = 20;

  /// Fraction of the window that must exceed the deviation to call it motion.
  static const double _movementMajority = 0.6;

  final List<double> _magDevs = [];
  bool _moving = false;
  final _movementController = StreamController<bool>.broadcast();

  bool _fused = false;
  List<double>? _accel;
  List<double>? _mag;
  Quaternion? _quaternion;
  double? _yawZero;
  FrameOrientation _current = const FrameOrientation(yaw: 0, pitch: 0);
  bool get hasFix =>
      _fused ? _quaternion != null : (_accel != null && _mag != null);

  Stream<FrameOrientation> get stream => _controller.stream;
  FrameOrientation get current => _current;

  /// Emits true/false only on CHANGE: true while the device experiences
  /// linear acceleration beyond [kMovementDeviation] for a majority of the
  /// window. Not SLAM, not position tracking — a "keep the phone in the
  /// same spot" warning.
  Stream<bool> get movementStream => _movementController.stream;
  bool get isMoving => _moving;

  void start() {
    _accelSub =
        (_accelStream ??
                accelerometerEventStream(
                  samplingPeriod: SensorInterval.gameInterval,
                ))
            .listen(_onAccel);

    if (_rotationStream != null) {
      // Injected rotation-vector stream (tests).
      _fused = true;
      _rotationSub = _rotationStream.listen(
        _onRotation,
        onError: (_) => _rotationFailed(),
      );
    } else if (_accelStream != null || _magStream != null) {
      // Explicit fallback streams (tests): keep accel + mag fusion.
      _magSub = _magStream != null
          ? _magStream.listen((e) => _mag = _lowPass(_mag, [e.x, e.y, e.z]))
          : _subscribeDefaultMag();
    } else {
      // Real device: prefer the platform rotation-vector sensor.
      try {
        RotationSensor.samplingPeriod = SensorInterval.gameInterval;
        _rotationSub = RotationSensor.orientationStream.listen(
          _onRotation,
          onError: (_) => _rotationFailed(),
        );
        _fused = true;
      } catch (_) {
        // Synchronous failure (no rotation-vector sensor on this platform):
        // _fused is still false here, so _rotationFailed() would no-op —
        // subscribe the magnetometer fallback directly.
        _magSub ??= _subscribeDefaultMag();
      }
    }

    // Emit at a steady ~30 Hz for the overlay painter.
    _emitTimer = Timer.periodic(const Duration(milliseconds: 33), (_) {
      final o = _compute();
      if (o != null) {
        _current = o;
        _controller.add(o);
      }
    });
  }

  /// Snapshot the current yaw as the zero reference (call at capture start).
  void zero() {
    final o = _fused
        ? orientationFromQuaternion(
            _quaternion ?? Quaternion(0, 0, 0, 1),
            deviceUp: _accel,
          )
        : _computeAbsolute();
    if (o != null) _yawZero = o.yaw;
  }

  void _onAccel(AccelerometerEvent e) {
    _accel = _lowPass(_accel, [e.x, e.y, e.z]);
    final mag = sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
    final dev = (mag - _gravity).abs() / _gravity;
    _magDevs.add(dev);
    if (_magDevs.length > _movementWindow) _magDevs.removeAt(0);
    if (_magDevs.length < 10) return;
    final excited = _magDevs.where((d) => d > kMovementDeviation).length;
    final moving = excited / _magDevs.length >= _movementMajority;
    if (moving != _moving) {
      _moving = moving;
      _movementController.add(moving);
    }
  }

  void _onRotation(OrientationEvent e) {
    _quaternion = e.quaternion;
  }

  void _rotationFailed() {
    if (!_fused) return;
    _fused = false;
    _rotationSub?.cancel();
    _rotationSub = null;
    _magSub ??= _subscribeDefaultMag();
  }

  StreamSubscription<MagnetometerEvent>? _subscribeDefaultMag() {
    try {
      return magnetometerEventStream(
        samplingPeriod: SensorInterval.gameInterval,
      ).listen((e) => _mag = _lowPass(_mag, [e.x, e.y, e.z]));
    } catch (_) {
      return null;
    }
  }

  List<double> _lowPass(List<double>? prev, List<double> next) {
    if (prev == null) return next;
    return [for (var i = 0; i < 3; i++) prev[i] + _alpha * (next[i] - prev[i])];
  }

  FrameOrientation? _compute() {
    if (_fused) {
      final q = _quaternion;
      if (q == null) return null;
      return _offset(orientationFromQuaternion(q, deviceUp: _accel));
    }
    return _offset(_computeAbsolute());
  }

  FrameOrientation? _offset(FrameOrientation? abs) {
    if (abs == null) return null;
    final zero = _yawZero ?? 0;
    return FrameOrientation(
      yaw: wrapDegrees(abs.yaw - zero),
      pitch: abs.pitch,
      roll: abs.roll,
    );
  }

  /// Orientation of the BACK CAMERA's look direction from a rotation-vector
  /// quaternion. Device coords (portrait): X right, Y up, Z out of the
  /// screen; the back camera looks along -Z. World coords: (E, N, U).
  ///
  /// [deviceUp] is the low-passed accelerometer reading (the device "up"
  /// vector in device coords, opposite gravity). The rotation-vector
  /// convention maps device coords to world coords, so rotating device-up
  /// must land near world-up (+Z); if it lands near -Z the quaternion is
  /// inverted and its conjugate is used instead. Roll is read straight from
  /// the accelerometer (device-up tilt in the device XY plane) — it needs
  /// no quaternion and cannot drift.
  static FrameOrientation? orientationFromQuaternion(
    Quaternion q, {
    List<double>? deviceUp,
  }) {
    final qn = q.normalize();
    var rot = qn;
    if (deviceUp != null) {
      final up = rotate(rot, deviceUp);
      if (up[2] < 0) rot = qn.conjugate(); // inverted convention
    }
    final look = rotate(rot, const [0, 0, -1]);
    if (look[0].isNaN || look[1].isNaN || look[2].isNaN) return null;
    final yaw = atan2(look[0], look[1]) * 180 / pi; // 0 = north, CW positive
    final pitch = asin(look[2].clamp(-1.0, 1.0)) * 180 / pi;
    final roll = deviceUp == null
        ? 0.0
        : atan2(deviceUp[0], deviceUp[1]) * 180 / pi;
    return FrameOrientation(yaw: wrapDegrees(yaw), pitch: pitch, roll: roll);
  }

  /// Rotate [v] by the unit quaternion [q]: v' = q v q⁻¹.
  static List<double> rotate(Quaternion q, List<double> v) {
    final qv = [q.x, q.y, q.z];
    final t = _cross(qv, v);
    final t2 = [t[0] * 2, t[1] * 2, t[2] * 2];
    final u = _cross(qv, t2);
    return [
      v[0] + q.w * t2[0] + u[0],
      v[1] + q.w * t2[1] + u[1],
      v[2] + q.w * t2[2] + u[2],
    ];
  }

  /// Absolute yaw/pitch/roll of the BACK CAMERA's look direction, degrees.
  ///
  /// Device coords (portrait): X right, Y up (top of phone), Z out of the
  /// screen toward the user. The back camera looks along -Z.
  FrameOrientation? _computeAbsolute() {
    final a = _accel;
    final m = _mag;
    if (a == null || m == null) return null;

    // Gravity points down; accelerometer at rest reads +g opposite gravity.
    final g = _normalize(a);
    if (g == null) return null;
    final east = _normalize(_cross(m, g));
    if (east == null) return null;
    final north = _cross(g, east);

    // World axes expressed in device coordinates:
    //   east = E, north = N, g = up (U)
    // Camera look vector in device coords is (0, 0, -1).
    // Its world components are the negated third row of [E; N; U] transposed:
    final lookE = -east[2];
    final lookN = -north[2];
    final lookU = -g[2];

    final yaw = atan2(lookE, lookN) * 180 / pi; // 0 = north, CW positive
    final pitch = asin(lookU.clamp(-1.0, 1.0)) * 180 / pi;

    // Roll: angle of the device X axis vs the horizon.
    // Device X in world = first column components (east[0], north[0], g[0]).
    final roll = atan2(g[0], g[1]) * 180 / pi;

    return FrameOrientation(yaw: wrapDegrees(yaw), pitch: pitch, roll: roll);
  }

  void dispose() {
    _accelSub?.cancel();
    _magSub?.cancel();
    _rotationSub?.cancel();
    _emitTimer?.cancel();
    _controller.close();
    _movementController.close();
  }
}

/// Wrap any angle to (-180, 180].
double wrapDegrees(double deg) {
  var d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

List<double> _cross(List<double> a, List<double> b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

List<double>? _normalize(List<double> v) {
  final n = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (n < 1e-6) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}
