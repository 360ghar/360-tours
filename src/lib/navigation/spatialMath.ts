import * as THREE from 'three';
import type { TourSpatialManifest, NavigationNode } from '@/types/tourSpatial';

/** xyzw → THREE.Quaternion */
export function quatFromXyzw(q: [number, number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize();
}

export function applyAlign(
  p: [number, number, number],
  align: THREE.Quaternion,
): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(align);
}

export interface AlignedTour {
  align: THREE.Quaternion;
  spawnPosition: THREE.Vector3;
  spawnNodeId: string;
  nodes: Array<NavigationNode & { alignedPosition: THREE.Vector3 }>;
  lerpSeconds: number;
  fov: number;
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
}

export function alignManifest(manifest: TourSpatialManifest): AlignedTour {
  const align = quatFromXyzw(manifest.align.rotation_xyzw);
  const nodes = manifest.graph.nodes.map((n) => ({
    ...n,
    alignedPosition: applyAlign(n.position, align),
  }));

  let spawnNodeId =
    manifest.spawn.node_id ??
    manifest.rooms[0]?.spawn_node_id ??
    nodes[Math.floor(nodes.length / 2)]?.id ??
    nodes[0]?.id;

  const spawnFromNode = nodes.find((n) => n.id === spawnNodeId);
  const spawnPosition = spawnFromNode
    ? spawnFromNode.alignedPosition.clone()
    : applyAlign(manifest.spawn.position, align);

  return {
    align,
    spawnPosition,
    spawnNodeId: spawnNodeId ?? 'spawn',
    nodes,
    lerpSeconds: manifest.viewer_defaults.lerp_seconds ?? 1.2,
    fov: manifest.viewer_defaults.fov_deg ?? 70,
    boundsMin: applyAlign(manifest.bounds.min, align),
    boundsMax: applyAlign(manifest.bounds.max, align),
  };
}

/** Project point onto camera-tube walkable volume (path spheres). */
export function projectToWalkable(
  p: THREE.Vector3,
  path: THREE.Vector3[],
  radius: number,
): THREE.Vector3 {
  if (path.length === 0) return p.clone();
  let best = path[0].clone();
  let bestDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() + 1e-12)));
    const proj = a.clone().add(ab.multiplyScalar(t));
    const d = p.distanceTo(proj);
    if (d < bestDist) {
      bestDist = d;
      best = proj;
    }
  }
  if (bestDist <= radius) return p.clone();
  const dir = p.clone().sub(best);
  if (dir.lengthSq() < 1e-12) return best;
  return best.add(dir.normalize().multiplyScalar(radius));
}
