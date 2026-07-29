import * as THREE from 'three';
import type { TourSpatialManifest, NavigationNode } from '@/types/tourSpatial';

/** xyzw → THREE.Quaternion */
export function quatFromXyzw(q: [number, number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize();
}

/** Extract yaw (around Y) / pitch (around X) from a Y-up viewer-space orientation. */
export function quaternionToYawPitch(q: THREE.Quaternion): { yaw: number; pitch: number } {
  const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return { yaw: euler.y, pitch: euler.x };
}

export function applyAlign(
  p: [number, number, number],
  align: THREE.Quaternion,
): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(align);
}

/**
 * Rotate an axis-aligned box by `align` and return the axis-aligned box that
 * encloses the result. Rotating just the min/max corner points is not a valid
 * AABB transform — all eight corners must be rotated, then re-extremized.
 */
export function applyAlignToBounds(
  min: [number, number, number],
  max: [number, number, number],
  align: THREE.Quaternion,
): { min: THREE.Vector3; max: THREE.Vector3 } {
  const corners: Array<[number, number, number]> = [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], min[1], max[2]],
    [min[0], max[1], max[2]],
    [max[0], max[1], max[2]],
  ];
  const rotated = corners.map((c) => applyAlign(c, align));
  const out = {
    min: rotated[0].clone(),
    max: rotated[0].clone(),
  };
  for (const v of rotated.slice(1)) {
    out.min.min(v);
    out.max.max(v);
  }
  return out;
}

export interface AlignedTour {
  align: THREE.Quaternion;
  spawnPosition: THREE.Vector3;
  spawnRotation: THREE.Quaternion;
  spawnNodeId: string;
  nodes: Array<NavigationNode & { alignedPosition: THREE.Vector3; alignedRotation: THREE.Quaternion | null }>;
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
    alignedRotation: n.rotation_xyzw
      ? align.clone().multiply(quatFromXyzw(n.rotation_xyzw))
      : null,
  }));

  const spawnNodeId =
    manifest.spawn.node_id ??
    manifest.rooms[0]?.spawn_node_id ??
    nodes[Math.floor(nodes.length / 2)]?.id ??
    nodes[0]?.id;

  const spawnFromNode = nodes.find((n) => n.id === spawnNodeId);
  const spawnPosition = spawnFromNode
    ? spawnFromNode.alignedPosition.clone()
    : applyAlign(manifest.spawn.position, align);
  const spawnRotation =
    spawnFromNode?.alignedRotation?.clone() ??
    align.clone().multiply(quatFromXyzw(manifest.spawn.rotation_xyzw));

  const bounds = applyAlignToBounds(manifest.bounds.min, manifest.bounds.max, align);

  return {
    align,
    spawnPosition,
    spawnRotation,
    spawnNodeId: spawnNodeId ?? 'spawn',
    nodes,
    lerpSeconds: manifest.viewer_defaults.lerp_seconds ?? 1.2,
    fov: manifest.viewer_defaults.fov_deg ?? 70,
    boundsMin: bounds.min,
    boundsMax: bounds.max,
  };
}

/** Build an undirected adjacency map from the manifest's navigation edges. */
export function buildAdjacency(
  edges: Array<{ from: string; to: string }>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const edge of edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  return adjacency;
}

/**
 * A connected traversal order starting from `startId` (BFS), used to give
 * prev/next/waypoint-index controls a sensible, graph-respecting sequence.
 * Nodes unreachable from `startId` are appended at the end so they remain
 * selectable (a direct hop) without implying they're graph-adjacent.
 */
export function bfsOrder(
  adjacency: Map<string, Set<string>>,
  startId: string,
  allIds: string[],
): string[] {
  const order: string[] = [];
  const seen = new Set<string>([startId]);
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  for (const id of allIds) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}

/** Shortest hop path between two nodes (BFS), inclusive of both endpoints. */
export function shortestPath(
  adjacency: Map<string, Set<string>>,
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [fromId];
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  const cameFrom = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      cameFrom.set(next, current);
      if (next === toId) {
        const path = [toId];
        let node = toId;
        while (cameFrom.has(node)) {
          node = cameFrom.get(node)!;
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  // Unreachable — fall back to a direct (visually snapping) hop.
  return [fromId, toId];
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
