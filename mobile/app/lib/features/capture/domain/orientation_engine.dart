import 'dart:async';
import 'dart:math';

import 'package:sensors_plus/sensors_plus.dart';

import '../../../core/models/models.dart';

/// Fused device orientation from accelerometer + magnetometer, the classic
/// Android getRotationMatrix construction. Yaw is reported relative to the
/// heading captured by [zero] so targets are laid out from wherever the
/// agent starts — no compass calibration dance.
/// ponytail: no gyro fusion — swap to flutter_rotation_sensor if the reticle
/// jitters unacceptably on a real device.
class OrientationEngine {
  OrientationEngine({
    this._accelStream,
    this._magStream,
  });

  final Stream<AccelerometerEvent>? _accelStream;
  final Stream<MagnetometerEvent>? _magStream;

  final _controller = StreamController<FrameOrientation>.broadcast();
  StreamSubscription<AccelerometerEvent>? _accelSub;
  StreamSubscription<MagnetometerEvent>? _magSub;
  Timer? _emitTimer;

  static const _alpha = 0.15; // low-pass factor

  List<double>? _accel;
  List<double>? _mag;
  double? _yawZero;
  FrameOrientation _current = const FrameOrientation(yaw: 0, pitch: 0);
  bool get hasFix => _accel != null && _mag != null;

  Stream<FrameOrientation> get stream => _controller.stream;
  FrameOrientation get current => _current;

  void start() {
    _accelSub = (_accelStream ??
            accelerometerEventStream(
                samplingPeriod: SensorInterval.gameInterval))
        .listen((e) {
      _accel = _lowPass(_accel, [e.x, e.y, e.z]);
    });
    _magSub = (_magStream ??
            magnetometerEventStream(
                samplingPeriod: SensorInterval.gameInterval))
        .listen((e) {
      _mag = _lowPass(_mag, [e.x, e.y, e.z]);
    });
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
    final o = _computeAbsolute();
    if (o != null) _yawZero = o.yaw;
  }

  List<double> _lowPass(List<double>? prev, List<double> next) {
    if (prev == null) return next;
    return [
      for (var i = 0; i < 3; i++) prev[i] + _alpha * (next[i] - prev[i]),
    ];
  }

  FrameOrientation? _compute() {
    final abs = _computeAbsolute();
    if (abs == null) return null;
    final zero = _yawZero ?? 0;
    return FrameOrientation(
      yaw: wrapDegrees(abs.yaw - zero),
      pitch: abs.pitch,
      roll: abs.roll,
    );
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

    return FrameOrientation(
      yaw: wrapDegrees(yaw),
      pitch: pitch,
      roll: roll,
    );
  }

  void dispose() {
    _accelSub?.cancel();
    _magSub?.cancel();
    _emitTimer?.cancel();
    _controller.close();
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
