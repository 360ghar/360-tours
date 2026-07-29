import 'dart:math';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/capture_targets.dart';
import '../../domain/orientation_engine.dart';
import '../capture_controller.dart';

/// Camera overlay: the active target dot, dwell ring, center reticle,
/// off-screen edge arrow and ghost dots for upcoming targets. Roll is not
/// drawn here — it surfaces as text guidance via [instructionFor]. Repaints
/// from the controller's orientation stream via the state object it is given.
class TargetOverlayPainter extends CustomPainter {
  TargetOverlayPainter(this.state);

  final CaptureState state;

  @override
  void paint(Canvas canvas, Size size) {
    if (state.phase != CapturePhase.aiming &&
        state.phase != CapturePhase.shooting) {
      return;
    }

    final projection = projectTarget(
      target: state.currentTarget,
      orientation: state.orientation,
      screenSize: size,
    );
    final center = Offset(size.width / 2, size.height / 2);
    final aligned = projection.angularError < kAlignToleranceDeg;

    // Center reticle: a thin ring that tightens when aligned.
    final reticlePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = Colors.white.withValues(alpha: aligned ? 0.9 : 0.35);
    canvas.drawCircle(center, aligned ? 26 : 34, reticlePaint);

    if (projection.onScreen) {
      final t = projection.position;
      // Target dot, sized by proximity so it feels magnetic.
      final proximity =
          (1 - (projection.angularError / 40)).clamp(0.0, 1.0);
      final dotPaint = Paint()
        ..color = aligned
            ? AppColors.accent
            : Colors.white.withValues(alpha: 0.5 + 0.4 * proximity);
      canvas.drawCircle(t, 10 + 6 * proximity, dotPaint);
      canvas.drawCircle(
        t,
        22,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = Colors.white.withValues(alpha: 0.6),
      );

      // Dwell progress ring around the target while holding.
      if (state.dwellProgress > 0) {
        canvas.drawArc(
          Rect.fromCircle(center: t, radius: 22),
          -pi / 2,
          2 * pi * state.dwellProgress,
          false,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3.5
            ..strokeCap = StrokeCap.round
            ..color = AppColors.accent,
        );
      }
    } else {
      // Edge arrow pointing toward the target.
      final angle = projection.edgeAngle;
      final radius = min(size.width, size.height) * 0.38;
      final tip = center + Offset(cos(angle), sin(angle)) * radius;
      canvas.save();
      canvas.translate(tip.dx, tip.dy);
      canvas.rotate(angle);
      final arrow = Path()
        ..moveTo(14, 0)
        ..lineTo(-8, -10)
        ..lineTo(-3, 0)
        ..lineTo(-8, 10)
        ..close();
      canvas.drawPath(arrow, Paint()..color = AppColors.accent);
      canvas.restore();
    }

    // Ghost dots for remaining targets in the current ring (context cue).
    final ghostPaint = Paint()..color = Colors.white.withValues(alpha: 0.18);
    for (var i = state.targetIndex + 1;
        i < min(state.targetIndex + 3, kCaptureTargets.length);
        i++) {
      final p = projectTarget(
        target: kCaptureTargets[i],
        orientation: state.orientation,
        screenSize: size,
      );
      if (p.onScreen) canvas.drawCircle(p.position, 7, ghostPaint);
    }
  }

  @override
  bool shouldRepaint(TargetOverlayPainter oldDelegate) => true;
}

/// Human instruction for the current aim state.
String instructionFor(CaptureState state) {
  if (state.needMoreShots) {
    final remaining = 4 - state.framePaths.length;
    if (remaining <= 0) return 'Turn toward an uncovered area';
    final shots = remaining == 1 ? '1 more shot' : '$remaining more shots';
    return 'Need $shots — turn toward an uncovered area';
  }
  if (state.phase == CapturePhase.shooting) return 'Hold still…';
  final d = projectionDelta(state);
  final dYaw = d.$1, dPitch = d.$2;
  if (dYaw.abs() < kAlignToleranceDeg && dPitch.abs() < kAlignToleranceDeg) {
    return 'Hold…';
  }
  if (state.orientation.roll.abs() > 15) return 'Hold the phone upright';
  if (dYaw.abs() >= dPitch.abs()) {
    return dYaw > 0 ? 'Turn right' : 'Turn left';
  }
  return dPitch > 0 ? 'Tilt up' : 'Tilt down';
}

(double, double) projectionDelta(CaptureState state) {
  final t = state.currentTarget;
  return (
    wrapDegrees(t.yaw - state.orientation.yaw),
    t.pitch - state.orientation.pitch,
  );
}
