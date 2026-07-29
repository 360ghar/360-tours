/** Viewer-space tour navigation manifest (baked post-export; no retrain). */

export interface TourSpatialManifest {
  version: 1;
  splat_url: string;
  dataparser?: {
    transform: number[][];
    scale: number;
  };
  up: [number, number, number];
  align: {
    rotation_xyzw: [number, number, number, number];
  };
  spawn: {
    position: [number, number, number];
    rotation_xyzw: [number, number, number, number];
    eye_height: number;
    node_id?: string;
  };
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
    walkable: WalkableVolume;
  };
  graph: NavigationGraph;
  rooms: RoomDescriptor[];
  hotspots: SplatHotspot[];
  viewer_defaults: {
    mode: 'STANDPOINT' | 'BOUNDED_WALK';
    fov_deg: number;
    move_speed: number;
    lerp_seconds: number;
  };
  meta?: Record<string, unknown>;
}

export type WalkableVolume =
  | { type: 'camera_tube'; path: [number, number, number][]; radius: number }
  | { type: 'aabb'; min: [number, number, number]; max: [number, number, number] }
  | { type: 'mesh'; mesh_url: string };

export interface NavigationGraph {
  nodes: NavigationNode[];
  edges: Array<{ from: string; to: string; weight: number }>;
}

export interface NavigationNode {
  id: string;
  position: [number, number, number];
  rotation_xyzw?: [number, number, number, number];
  room_id?: string;
  source?: string;
}

export interface RoomDescriptor {
  id: string;
  name: string;
  spawn_node_id: string;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export interface SplatHotspot {
  id: string;
  type: 'navigation' | 'info' | 'media';
  position: [number, number, number];
  label: string;
  target_node_id?: string;
  target_room_id?: string;
  payload?: Record<string, unknown>;
}
