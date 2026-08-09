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

/// Camera field of view basis for the guide.
///
/// SOURCE OF TRUTH: the `camera` plugin (0.12.x, verified in this repo)
/// exposes NO focal length, sensor size or FOV — `CameraDescription` carries
/// only name/lensDirection/sensorOrientation/lensType, and `lensType` is not
/// populated on Android (camerax). These constants are the documented
/// estimate for a portrait phone main camera (55° H × 69° V) and are
/// deliberately conservative: real wide main lenses are >= this FOV, so
/// guided coverage only gains overlap. [CameraProfile.fallbackWide] and the
/// naive stitcher both derive from here — one source of truth, never
/// scattered magic numbers.
const double kHFovDeg = 55;
const double kVFovDeg = 69;

/// Alignment thresholds.
const double kAlignToleranceDeg = 5;
const double kStableToleranceDeg = 2;
const Duration kDwell = Duration(milliseconds: 400);

/// Camera characteristics the target planner needs. See [kHFovDeg] for why
/// FOV is a documented estimate rather than a device query.
class CameraProfile {
  /// Usable horizontal field of view of a captured frame, degrees.
  final double hFovDeg;

  /// Usable vertical field of view of a captured frame, degrees.
  final double vFovDeg;

  /// Fraction of frame angular extent kept between azimuthally adjacent
  /// targets. 0.30 default rationale: OpenCV feature matching needs roughly
  /// 15-25% overlap, and the ±5° alignment tolerance can consume up to ~10°
  /// of nominal overlap, so 30% keeps the worst case comfortably positive.
  final double overlap;

  /// Human-readable profile name (persisted with capture sessions).
  final String name;

  const CameraProfile({
    required this.hFovDeg,
    required this.vFovDeg,
    this.overlap = 0.30,
    this.name = 'custom',
  });

  /// Documented fallback profile (see [kHFovDeg]).
  static const CameraProfile fallbackWide = CameraProfile(
    hFovDeg: kHFovDeg,
    vFovDeg: kVFovDeg,
    overlap: 0.30,
    name: 'fallback-wide-55x69',
  );

  Map<String, dynamic> toJson() => {
    'hFovDeg': hFovDeg,
    'vFovDeg': vFovDeg,
    'overlap': overlap,
    'name': name,
  };

  factory CameraProfile.fromJson(Map<String, dynamic> json) {
    final h = (json['hFovDeg'] as num?)?.toDouble() ?? kHFovDeg;
    final v = (json['vFovDeg'] as num?)?.toDouble() ?? kVFovDeg;
    final o = (json['overlap'] as num?)?.toDouble() ?? 0.30;
    // Rectilinear projection is undefined at/above 180° FOV — persisted
    // boundary values would degenerate the tangent tables (empty or
    // collapsed panoramas). Fall back instead of trusting them.
    if (h <= 0 || h >= 180 || v <= 0 || v >= 180) {
      return CameraProfile.fallbackWide;
    }
    return CameraProfile(
      hFovDeg: h,
      vFovDeg: v,
      overlap: o,
      name: json['name'] as String? ?? 'restored',
    );
  }
}

/// One ring of a plan: targets sharing the same pitch.
class CaptureRing {
  final double pitchDeg;
  final int yawCount;

  /// Half the azimuth one frame covers at [pitchDeg] (degrees).
  final double azHalfDeg;

  const CaptureRing({
    required this.pitchDeg,
    required this.yawCount,
    required this.azHalfDeg,
  });

  double get spacingDeg => 360 / yawCount;
}

/// The full adaptive layout for one capture session.
class CapturePlan {
  final CameraProfile profile;

  /// Rings in visit order.
  final List<CaptureRing> rings;

  /// Targets in visit order.
  final List<CaptureTarget> targets;

  const CapturePlan({
    required this.profile,
    required this.rings,
    required this.targets,
  });

  int get total => targets.length;

  /// Indices of targets with no captured frame yet.
  Set<int> missingTargets(Set<int> capturedTargetIndices) {
    final missing = <int>{};
    for (var i = 0; i < targets.length; i++) {
      if (!capturedTargetIndices.contains(i)) missing.add(i);
    }
    return missing;
  }

  /// Captured indices whose frame orientation is not within [tolerance] of
  /// their target (an aligned capture of target N is at least
  /// `spacing - 2*tolerance` away from its neighbors, so this only trips on
  /// real misalignment or a stale sensor reading).
  List<int> misalignedTargets(
    Map<int, FrameOrientation> orientations, {
    double tolerance = kAlignToleranceDeg,
  }) {
    final bad = <int>[];
    orientations.forEach((index, o) {
      if (index < 0 || index >= targets.length) return;
      if (!isAlignedWithTolerance(targets[index], o, tolerance)) bad.add(index);
    });
    return bad;
  }
}

/// True when two look directions are within [tolerance] (degrees) of each
/// other — the duplicate-angle check.
bool sameDirection(
  FrameOrientation a,
  FrameOrientation b, {
  double tolerance = kAlignToleranceDeg,
}) =>
    wrapDegrees(a.yaw - b.yaw).abs() < tolerance &&
    (a.pitch - b.pitch).abs() < tolerance;

bool isAlignedWithTolerance(
  CaptureTarget target,
  FrameOrientation orientation,
  double tolerance,
) =>
    wrapDegrees(target.yaw - orientation.yaw).abs() < tolerance &&
    (target.pitch - orientation.pitch).abs() < tolerance;

/// Geometry-driven capture layout for a [CameraProfile].
///
/// Algorithm (angles in degrees):
///
/// 1. Horizon ring at pitch 0. The azimuthal half-coverage of one frame at
///    pitch p is `azHalf(p) = atan(tan(hFov/2) / cos(p))` — a rectilinear
///    frame covers MORE azimuth when tilted, so the horizon is the worst
///    case. Per-ring spacing is `2 * azHalf(p) * (1 - overlap)` and the count
///    is the smallest integer covering 360°, guaranteeing adjacent frames in
///    a ring overlap by >= `overlap` of the ring's azimuthal extent with ZERO
///    azimuthal holes (the previous fixed ±45° rings were ~17° short per
///    side — the "black wedges").
///
/// 2. Ring pitches: the pole ring is snapped to `maxPitch = 90 - vFov/2`,
///    the pitch at which the frame's top edge reaches the zenith — zero pole
///    gap (previously a 10.5° zenith cap that no ring could see). Additional
///    rings at `delta = vFov * (1 - overlap)` are only inserted while the
///    band chain has not yet reached the pole band (happens for vFov < 60
///    with the default overlap). The pole ring may overlap its neighbor by
///    less than the nominal fraction (13.5° = 19.6% of VFOV for the default
///    profile) — documented trade-off: an extra ring whose only purpose is
///    re-overlapping an already-overlapping band would add ~14 frames for
///    zero coverage gain.
///
/// 3. Visit order: horizon ring first (least neck strain), then up rings
///    nearest-first, then down rings nearest-first. Yaw phases are identical
///    across rings (column-aligned; seam stagger is stitch-time polish).
class CaptureTargetPlanner {
  const CaptureTargetPlanner();

  CapturePlan createPlan(CameraProfile profile) {
    final h = profile.hFovDeg;
    final v = profile.vFovDeg;
    final ov = profile.overlap.clamp(0.0, 0.8);

    final maxPitch = max(0.0, 90 - v / 2);

    // Ring levels: horizon + upward levels (mirrored downward below).
    final upLevels = <double>[0];
    final poleBandBottom = maxPitch - v / 2;
    if (v / 2 < poleBandBottom) {
      final delta = v * (1 - ov);
      var p = delta;
      while (p + v / 2 < poleBandBottom) {
        upLevels.add(p);
        p += delta;
      }
      upLevels.add(p);
    }
    if (upLevels.last < maxPitch) upLevels.add(maxPitch);

    final ringOrder = <double>[
      0,
      for (final p in upLevels)
        if (p > 0) p,
      for (final p in upLevels.reversed)
        if (p > 0) -p,
    ];

    final rings = <CaptureRing>[];
    final targets = <CaptureTarget>[];
    for (final pitch in ringOrder) {
      final cosP = cos(pitch * pi / 180);
      // cos(p) > 0 always: |pitch| <= maxPitch = 90 - vFov/2 < 90.
      final azHalf = atan(tan(h * pi / 360) / cosP) * 180 / pi;
      final spacing = 2 * azHalf * (1 - ov);
      final count = max(1, (360 / spacing).ceil());
      rings.add(
        CaptureRing(pitchDeg: pitch, yawCount: count, azHalfDeg: azHalf),
      );
      for (var i = 0; i < count; i++) {
        targets.add(CaptureTarget(i * 360 / count, pitch));
      }
    }

    return CapturePlan(profile: profile, rings: rings, targets: targets);
  }
}

/// The plan every fresh session starts with (built once from the documented
/// fallback profile: 24 targets — 10 horizon + 7 + 7 pole rings at ±55.5°).
final CapturePlan kFallbackCapturePlan = const CaptureTargetPlanner()
    .createPlan(CameraProfile.fallbackWide);

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
/// which is where alignment happens. FOV comes from [profile] (defaults to
/// the documented fallback, which is what every live session is planned on).
TargetProjection projectTarget({
  required CaptureTarget target,
  required FrameOrientation orientation,
  required Size screenSize,
  CameraProfile? profile,
}) {
  final p = profile ?? CameraProfile.fallbackWide;
  final dYaw = wrapDegrees(target.yaw - orientation.yaw);
  final dPitch = target.pitch - orientation.pitch;

  final x = screenSize.width / 2 + (dYaw / p.hFovDeg) * screenSize.width;
  final y = screenSize.height / 2 - (dPitch / p.vFovDeg) * screenSize.height;

  final onScreen = dYaw.abs() < p.hFovDeg / 2 && dPitch.abs() < p.vFovDeg / 2;

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
