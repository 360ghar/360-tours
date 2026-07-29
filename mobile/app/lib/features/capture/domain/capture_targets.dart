import 'dart:math';
import 'dart:ui';

import '../../../core/models/models.dart';
import 'orientation_engine.dart';

/// One capture target on the sphere (degrees, yaw relative to capture start).
class CaptureTarget {
  final double yaw;
  final double pitch;

  const CaptureTarget(this.yaw, this.pitch);
}

/// The guided 16-shot layout: 8 around the horizon, 4 up, 4 down.
/// Visited in this order — horizon sweep first (least neck strain),
/// then the up ring, then the down ring.
const List<CaptureTarget> kCaptureTargets = [
  // Ring A: pitch 0°, every 45°
  CaptureTarget(0, 0),
  CaptureTarget(45, 0),
  CaptureTarget(90, 0),
  CaptureTarget(135, 0),
  CaptureTarget(180, 0),
  CaptureTarget(-135, 0),
  CaptureTarget(-90, 0),
  CaptureTarget(-45, 0),
  // Ring B: pitch +45°
  CaptureTarget(0, 45),
  CaptureTarget(90, 45),
  CaptureTarget(180, 45),
  CaptureTarget(-90, 45),
  // Ring C: pitch -45°
  CaptureTarget(0, -45),
  CaptureTarget(90, -45),
  CaptureTarget(180, -45),
  CaptureTarget(-90, -45),
];

/// Camera field of view used for the screen projection (portrait iPhone
/// main camera, approximate — the guide only needs to point the right way).
const double kHFovDeg = 55;
const double kVFovDeg = 69;

/// Alignment thresholds.
const double kAlignToleranceDeg = 5;
const double kStableToleranceDeg = 2;
const Duration kDwell = Duration(milliseconds: 400);

/// Where a target lands on screen for the current orientation.
class TargetProjection {
  /// Screen position (may be off-screen).
  final Offset position;

  /// True when the target is within the camera's field of view.
  final bool onScreen;

  /// Direction (radians, screen coords) toward the target when off-screen.
  final double edgeAngle;

  /// Angular distance to the target in degrees (max of yaw/pitch deltas).
  final double angularError;

  const TargetProjection({
    required this.position,
    required this.onScreen,
    required this.edgeAngle,
    required this.angularError,
  });
}

/// Projects [target] onto a [screenSize] viewport given the current
/// [orientation]. Linear pinhole approximation — exact near the center,
/// which is where alignment happens.
TargetProjection projectTarget({
  required CaptureTarget target,
  required FrameOrientation orientation,
  required Size screenSize,
}) {
  final dYaw = wrapDegrees(target.yaw - orientation.yaw);
  final dPitch = target.pitch - orientation.pitch;

  final x = screenSize.width / 2 + (dYaw / kHFovDeg) * screenSize.width;
  final y = screenSize.height / 2 - (dPitch / kVFovDeg) * screenSize.height;

  final onScreen = dYaw.abs() < kHFovDeg / 2 && dPitch.abs() < kVFovDeg / 2;

  return TargetProjection(
    position: Offset(x, y),
    onScreen: onScreen,
    edgeAngle: atan2(-dPitch, dYaw),
    angularError: max(dYaw.abs(), dPitch.abs()),
  );
}

/// True when the current orientation is close enough to shoot.
bool isAligned(CaptureTarget target, FrameOrientation orientation) =>
    wrapDegrees(target.yaw - orientation.yaw).abs() < kAlignToleranceDeg &&
    (target.pitch - orientation.pitch).abs() < kAlignToleranceDeg;
