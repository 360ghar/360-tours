import 'dart:math';

import '../capture_targets.dart';

/// A 3D direction/vector in world coordinates (x=east, y=north, z=up —
/// matches the Phase 1 orientation-engine conventions).
class Vec3 {
  final double x, y, z;

  const Vec3(this.x, this.y, this.z);

  double get length => sqrt(x * x + y * y + z * z);

  Vec3 normalized() {
    final n = length;
    if (n < 1e-12) return const Vec3(0, 0, 1);
    return Vec3(x / n, y / n, z / n);
  }

  double dot(Vec3 o) => x * o.x + y * o.y + z * o.z;

  Vec3 cross(Vec3 o) =>
      Vec3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x);

  @override
  String toString() => 'Vec3($x, $y, $z)';
}

/// Camera pose expressed as its world-space basis vectors.
///
/// [right]/[up] span the image plane (right = image +x, up = image +y),
/// [forward] is the optical axis. Positive roll = phone top tilted right
/// (matches the Phase 1 orientation engine's roll sign).
class CameraBasis {
  final Vec3 right;
  final Vec3 up;
  final Vec3 forward;

  const CameraBasis({
    required this.right,
    required this.up,
    required this.forward,
  });
}

/// World-space camera basis for a pose, including ROLL about the optical
/// axis. Level pose matches the naive-stitcher conventions:
/// `forward = (sin yaw·cos pitch, cos yaw·cos pitch, sin pitch)`,
/// `right = (cos yaw, −sin yaw, 0)`, `up = (−sin yaw·sin pitch, …)`.
CameraBasis cameraBasis({
  required double yawDeg,
  required double pitchDeg,
  required double rollDeg,
}) {
  final yaw = yawDeg * pi / 180;
  final pitch = pitchDeg * pi / 180;
  final roll = rollDeg * pi / 180;
  final cp = cos(pitch), sp = sin(pitch);

  final fwd = Vec3(sin(yaw) * cp, cos(yaw) * cp, sp);
  final right = Vec3(cos(yaw), -sin(yaw), 0);
  final up = Vec3(-sin(yaw) * sp, -cos(yaw) * sp, cp);

  // Roll rotates the image plane about the optical axis. With the engine's
  // sign convention (positive roll = top tilted right, verified by
  // `panorama_geometry_test` via the top-center-pixel invariant):
  //   right' = cos(r)·right − sin(r)·up
  //   up'    = sin(r)·right + cos(r)·up
  final cr = cos(roll), sr = sin(roll);
  return CameraBasis(
    right: Vec3(
      cr * right.x - sr * up.x,
      cr * right.y - sr * up.y,
      cr * right.z - sr * up.z,
    ),
    up: Vec3(
      sr * right.x + cr * up.x,
      sr * right.y + cr * up.y,
      sr * right.z + cr * up.z,
    ),
    forward: fwd,
  );
}

/// Unit world direction for an equirectangular pixel.
///
/// [x] in `0..width-1` maps to yaw in `(−180, 180]` (east-positive), [y] in
/// `0..height-1` maps to latitude `+90 (top) … −90`.
Vec3 equirectToWorld(double x, double y, int width, int height) {
  final lon = (x / width) * 2 * pi - pi;
  final lat = pi / 2 - (y / height) * pi;
  final cosLat = cos(lat);
  return Vec3(cosLat * sin(lon), cosLat * cos(lon), sin(lat));
}

/// Inverse of [equirectToWorld]: equirect pixel coords for a world
/// direction. The x coordinate wraps at ±180° (the equirect seam).
(double, double) worldToEquirect(Vec3 d, int width, int height) {
  final dir = d.normalized();
  final lon = atan2(dir.x, dir.y);
  final lat = asin(dir.z.clamp(-1.0, 1.0));
  final x = ((lon + pi) / (2 * pi) * width) % width;
  final y = (pi / 2 - lat) / pi * height;
  return (x, y);
}

/// Tangent-space camera coordinates of a world direction: `u = d·right / d·fwd`,
/// `v = d·up / d·fwd` (tan of the lateral angles). Null when the direction is
/// behind the camera (dot with forward <= 0) — nothing behind the optical
/// plane can project onto the sensor.
(double, double)? worldToCamera(Vec3 d, CameraBasis basis) {
  final w = d.dot(basis.forward);
  if (w <= 0) return null;
  final u = d.dot(basis.right) / w;
  final v = d.dot(basis.up) / w;
  return (u, v);
}

/// Half-angle tangents for a profile: `tan(hFov/2)` / `tan(vFov/2)`.
(double, double) fovTangents(CameraProfile profile) =>
    (tan(profile.hFovDeg * pi / 360), tan(profile.vFovDeg * pi / 360));

/// True when tangent-space coords lie inside the frame's FOV (boundary
/// inclusive, small epsilon for float noise at exactly half-FOV).
bool insideFov(double u, double v, CameraProfile profile) {
  final (tanH, tanV) = fovTangents(profile);
  return u.abs() <= tanH * (1 + 1e-9) && v.abs() <= tanV * (1 + 1e-9);
}

/// Equirect pixel coords of a direction expressed in [basis]'s camera frame
/// (u/v tangent coords): inverse pinhole mapping, used by tests and the
/// roll-invariant check.
(double, double) cameraToEquirect(
  double u,
  double v,
  CameraBasis basis,
  int width,
  int height,
) {
  final d = Vec3(
    u * basis.right.x + v * basis.up.x + basis.forward.x,
    u * basis.right.y + v * basis.up.y + basis.forward.y,
    u * basis.right.z + v * basis.up.z + basis.forward.z,
  );
  return worldToEquirect(d, width, height);
}
