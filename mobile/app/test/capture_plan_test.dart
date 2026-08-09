import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';

/// Validates the PHASE 1L invariants on any plan. Returns human-readable
/// failures (empty = valid).
List<String> validatePlan(CapturePlan plan) {
  final errors = <String>[];
  final p = plan.profile;
  final ov = p.overlap;
  final v = p.vFovDeg;

  if (plan.rings.isEmpty || plan.targets.isEmpty) {
    errors.add('empty plan');
    return errors;
  }
  if (plan.targets.length != plan.rings.fold(0, (s, r) => s + r.yawCount)) {
    errors.add('target count does not match rings');
  }

  for (final ring in plan.rings) {
    // Test 1/4: azimuthal overlap >= overlap fraction (no holes even at the
    // horizon ring, the worst case).
    final maxSpacing = 2 * ring.azHalfDeg * (1 - ov) + 1e-6;
    if (ring.spacingDeg > maxSpacing) {
      errors.add(
        'ring ${ring.pitchDeg}: spacing ${ring.spacingDeg} > max $maxSpacing',
      );
    }
    if (ring.azHalfDeg <= 0) {
      errors.add('ring ${ring.pitchDeg}: degenerate azimuth coverage');
    }
  }

  // Test 2/3: ring bands tile [-90, 90] with no elevation holes.
  final bands =
      plan.rings.map((r) => (r.pitchDeg - v / 2, r.pitchDeg + v / 2)).toList()
        ..sort((a, b) => a.$1.compareTo(b.$1));
  var covered = -90.0;
  for (final b in bands) {
    if (b.$1 > covered + 1e-6) {
      errors.add('elevation hole: [${b.$1}, ${b.$2}] starts above $covered');
    }
    covered = max(covered, b.$2);
  }
  if (covered < 90 - 1e-6) {
    errors.add('zenith not covered (top edge $covered)');
  }

  // Test 5/6: unique directions, valid bounds, no impossible targets.
  final seen = <String>{};
  for (final t in plan.targets) {
    if (t.pitch < -90 || t.pitch > 90) {
      errors.add('pitch out of bounds: ${t.pitch}');
    }
    if (t.yaw < 0 || t.yaw >= 360) {
      errors.add('yaw out of bounds: ${t.yaw}');
    }
    if (t.pitch.abs() > 90 - v / 2 + 1e-6) {
      errors.add('pitch ${t.pitch} beyond usable max ${90 - v / 2}');
    }
    final key = '${t.yaw.toStringAsFixed(2)},${t.pitch.toStringAsFixed(2)}';
    if (!seen.add(key)) {
      errors.add('duplicate target direction $key');
    }
  }

  return errors;
}

void main() {
  const planner = CaptureTargetPlanner();

  const profiles = {
    'fallback wide 55x69': CameraProfile.fallbackWide,
    'ultrawide 90x90': CameraProfile(hFovDeg: 90, vFovDeg: 90, overlap: 0.30),
    'telephoto 30x40 (narrow)': CameraProfile(
      hFovDeg: 30,
      vFovDeg: 40,
      overlap: 0.30,
    ),
    'small overlap 55x69@0.2': CameraProfile(
      hFovDeg: 55,
      vFovDeg: 69,
      overlap: 0.20,
    ),
    'extreme overlap 55x69@0.6': CameraProfile(
      hFovDeg: 55,
      vFovDeg: 69,
      overlap: 0.60,
    ),
  };

  for (final entry in profiles.entries) {
    test('${entry.key}: plan is valid (Tests 1-6, 8)', () {
      final errors = validatePlan(planner.createPlan(entry.value));
      expect(errors, isEmpty, reason: '${entry.key}: ${errors.join('; ')}');
    });
  }

  test('fallback profile is the safe default (Test 8)', () {
    final errors = validatePlan(kFallbackCapturePlan);
    expect(errors, isEmpty, reason: errors.join('; '));
    expect(kFallbackCapturePlan.profile.name, 'fallback-wide-55x69');
  });

  test('different FOV profiles produce different valid plans (Test 7)', () {
    final fallback = planner.createPlan(CameraProfile.fallbackWide);
    final wide = planner.createPlan(
      const CameraProfile(hFovDeg: 90, vFovDeg: 90, overlap: 0.30),
    );
    final narrow = planner.createPlan(
      const CameraProfile(hFovDeg: 30, vFovDeg: 40, overlap: 0.30),
    );

    // A wider lens needs fewer shots for the same coverage.
    expect(wide.total, lessThan(fallback.total));
    // A narrow lens needs MORE shots and intermediate rings to reach the
    // pole without elevation holes.
    expect(narrow.total, greaterThan(fallback.total));
    expect(narrow.rings.length, greaterThan(fallback.rings.length));
    // Different layouts, not just scaled counts.
    expect(
      fallback.rings.map((r) => r.pitchDeg).toList(),
      isNot(narrow.rings.map((r) => r.pitchDeg).toList()),
    );
  });

  test('planner never produces an impossible target (Test 9)', () {
    const extreme = [
      CameraProfile(hFovDeg: 5, vFovDeg: 50, overlap: 0.30),
      CameraProfile(hFovDeg: 100, vFovDeg: 100, overlap: 0.30),
      CameraProfile(hFovDeg: 55, vFovDeg: 179.9, overlap: 0.30),
      CameraProfile(hFovDeg: 170, vFovDeg: 69, overlap: 0.8),
    ];
    for (final profile in extreme) {
      final plan = planner.createPlan(profile);
      final errors = validatePlan(plan);
      expect(errors, isEmpty, reason: '${profile.name}: ${errors.join('; ')}');
      for (final t in plan.targets) {
        expect(t.pitch.abs(), lessThanOrEqualTo(90));
        expect(t.yaw, inInclusiveRange(0, 360));
      }
    }
  });

  test('overlap is configurable and respected (Test 4)', () {
    final lean = planner.createPlan(
      const CameraProfile(hFovDeg: 55, vFovDeg: 69, overlap: 0.20),
    );
    final fat = planner.createPlan(
      const CameraProfile(hFovDeg: 55, vFovDeg: 69, overlap: 0.60),
    );
    // More overlap -> more targets, tighter spacing, on the same profile.
    expect(fat.total, greaterThan(lean.total));
    expect(fat.rings.first.spacingDeg, lessThan(lean.rings.first.spacingDeg));
    // Count = ceil(360 / targetSpacing) so the actual spacing is the largest
    // even divisor <= the target spacing: guarantee holds by construction.
    double targetSpacing(double leanOv) => 2 * 27.5 * (1 - leanOv);
    expect(
      lean.rings.first.spacingDeg,
      lessThanOrEqualTo(targetSpacing(0.20) + 1e-9),
    );
    expect(lean.rings.first.spacingDeg, 40.0); // 360/9
    expect(
      fat.rings.first.spacingDeg,
      lessThanOrEqualTo(targetSpacing(0.60) + 1e-9),
    );
  });

  test('fallback profile: horizon ring at 36°, pole rings reach the zenith '
      '(Test 1-3 sanity)', () {
    final plan = kFallbackCapturePlan;
    expect(plan.total, 24);
    final horizon = plan.rings.first;
    expect(horizon.pitchDeg, 0);
    expect(horizon.spacingDeg, closeTo(36, 1e-9));
    expect(horizon.azHalfDeg, closeTo(27.5, 1e-9));
    // Pole ring top edge = pitch + vFov/2 = 55.5 + 34.5 = 90.
    expect(plan.rings[1].pitchDeg + 69 / 2, closeTo(90, 1e-9));
    expect(plan.rings[2].pitchDeg - 69 / 2, closeTo(-90, 1e-9));
  });

  test('missingTargets / misalignedTargets helpers', () {
    final plan = kFallbackCapturePlan;
    final captured = {0, 1, 2, 3};
    expect(plan.missingTargets(captured), isNot(contains(0)));
    expect(plan.missingTargets(captured), contains(4));

    const target0 = CaptureTarget(0, 0);
    expect(target0.yaw, 0);
    final aligned = {
      0: const FrameOrientation(yaw: 2, pitch: 1),
      1: const FrameOrientation(yaw: 36, pitch: 0),
    };
    expect(plan.misalignedTargets(aligned), isEmpty);
    final off = {
      0: const FrameOrientation(yaw: 40, pitch: 0), // 40° off target 0
    };
    expect(plan.misalignedTargets(off), [0]);
  });
}
