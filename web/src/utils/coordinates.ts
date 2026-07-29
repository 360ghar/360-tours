/**
 * Coordinate conversion utilities for 360 panorama viewer.
 *
 * Photo-sphere-viewer internally uses radians for positions,
 * but our API and database store positions in degrees.
 * These utilities handle conversions at the boundary.
 */

/**
 * Convert radians to degrees.
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Convert degrees to radians.
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Normalize yaw to range -180 to 180 degrees.
 * @param yaw - Yaw angle in degrees
 * @returns Normalized yaw in range [-180, 180]
 */
export function normalizeYaw(yaw: number): number {
  let normalized = yaw % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

/**
 * Clamp pitch to valid range -90 to 90 degrees.
 * @param pitch - Pitch angle in degrees
 * @returns Clamped pitch in range [-90, 90]
 */
export function clampPitch(pitch: number): number {
  return Math.max(-90, Math.min(90, pitch));
}

/**
 * Convert a position from radians (photo-sphere-viewer) to degrees (API).
 * Use this when getting click/drag positions from the viewer.
 */
export function viewerPositionToDegrees(position: {
  yaw: number;
  pitch: number;
}): { yaw: number; pitch: number } {
  return {
    yaw: normalizeYaw(radiansToDegrees(position.yaw)),
    pitch: clampPitch(radiansToDegrees(position.pitch)),
  };
}

/**
 * Convert a position from degrees (API) to radians (photo-sphere-viewer).
 * Use this when setting marker positions on the viewer.
 */
export function degreesToViewerPosition(position: {
  yaw: number;
  pitch: number;
}): { yaw: number; pitch: number } {
  return {
    yaw: degreesToRadians(position.yaw),
    pitch: degreesToRadians(position.pitch),
  };
}
