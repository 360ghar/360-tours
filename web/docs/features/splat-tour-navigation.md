# Splat Tour Navigation Architecture (360 Ghar)

**Status:** Design only — reconstruction pipeline frozen  
**Date:** 2026-07-21  
**Product goal:** Make imperfect Gaussian reconstructions usable as real-estate tours

---

## 0. Product conclusion

| Not the problem | The problem |
|-----------------|-------------|
| Empty / failed SfM (kitchen GS is complete) | Unrestricted free-flight into floaters |
| Perfect clean splats (pros also have artifacts) | Spawn outside hollow shell → “blob” UX |
| Retrain / re-COLMAP | No tour constraints, no waypoints, no room bounds |

**Principle:** Treat the splat as a *render substrate*. Product quality comes from **where the camera is allowed to go**, not from erasing every floater.

Professional analogues:

| Product | Navigation model | Lesson for 360 Ghar |
|---------|------------------|---------------------|
| **Matterport** | Discrete standpoints + pan; dollhouse overview; almost no free-flight | Prefer **pose graph** over FPS |
| **Polycam** | Orbit / constrained walk; space bounds | Auto-frame + floor up |
| **Luma** | Orbit + path; often clamps near capture path | Stay near **captured cameras** |
| **SuperSplat (editor)** | Full free-flight for *authors* | Wrong default for *buyers* |

---

## 1. Proposed architecture

### 1.1 Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Tour UI (hotspots, minimap, reset, room list, share/embed) │
├─────────────────────────────────────────────────────────────┤
│  Navigation Controller                                       │
│   modes: STANDPOINT | BOUNDED_WALK | WAYPOINT_LERP | DOLLHOUSE│
├─────────────────────────────────────────────────────────────┤
│  Spatial Runtime (R3F / PlayCanvas / Spark)                  │
│   splat mesh + camera + collision proxy (not full free-fly)  │
├─────────────────────────────────────────────────────────────┤
│  Tour Spatial Manifest (JSON)                                │
│   spawn, up, bounds, graph, rooms, hotspots                  │
├─────────────────────────────────────────────────────────────┤
│  Offline Spatial Bake (backend, post-export, no retrain)     │
│   poses → graph; gaussians → bounds; floor PCA → up          │
├─────────────────────────────────────────────────────────────┤
│  Assets (immutable for now)                                  │
│   *.splat  +  transforms.json  +  optional sparse PLY        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Default experience (buyer)

1. Load splat (hidden until ready).  
2. Apply **spawn pose** (inside main volume, eye height).  
3. **Free-look** (yaw/pitch) only; translation is **constrained**.  
4. Tap floor / minimap / hotspot → **smooth lerp** to next standpoint.  
5. **Reset** returns to spawn.  
6. Optional **dollhouse** mode: orbit outside with **clipped far plane** or **opacity shell** — not FPS entry into floaters.

### 1.3 Modes

| Mode | Translate | Rotate | Use |
|------|-----------|--------|-----|
| `STANDPOINT` | Snap / lerp between graph nodes only | Free look | Default public tour (Matterport-like) |
| `BOUNDED_WALK` | Continuous inside walkable volume | Free look | Power users / agent preview |
| `WAYPOINT_LERP` | Animated only | Slerp look-at | Guided path / “Walk through” |
| `DOLLHOUSE` | Orbit pivot at room center | Orbit | Overview; no enter-noise |

---

## 2. Algorithms

### 2.1 Automatic spawn position

**Inputs:** training camera centers \(C_i\) from `transforms.json` (and/or dataparser space), gaussian means sample \(G_j\).

1. Map cameras into **viewer space** (same frame as exported splat = training/dataparser coords).  
2. Compute robust camera AABB: percentiles **p5–p95** of \(C_i\).  
3. Density peak: voxelize \(G_j\) (e.g. 32³); pick densest voxel whose center lies inside camera AABB inflated by 10%.  
4. Spawn \(s = \) mean of cameras in densest half of path **or** densest voxel center.  
5. Lift to eye height **along the normalized up vector \(u\) from §2.2, before applying \(R_{\text{align}}\)**: \(s \leftarrow s + h_{\text{eye}} \cdot u\) (default \(h_{\text{eye}} = 1.6\) in **metric-ish** scaled space; if unit-normalized scene, use \(0.15 \times\) room height). Lifting along raw \(s_y\) is only correct once the scene is already Y-up — if \(u\) isn't yet \((0,1,0)\), that offsets along the wrong axis and can place the spawn off the floor or outside the room.  
6. Look-at: horizontal toward room centroid projected on floor plane.

**Never** use world origin alone (often outside or in the shell center void incorrectly framed).

### 2.2 Automatic scene orientation (floor / gravity)

**Inputs:** camera up vectors from \(R_i\) of poses; optional gaussian vertical variance.

1. Collect camera **world-up** columns (or third row of c2w depending on convention).  
2. Average and normalize → \(u\).  
3. If `dataparser` used `orientation_method: up`, \(u \approx (0,1,0)\) or \((0,0,1)\) already — detect dominant axis by max \(|u|\).  
4. Build rotation \(R_{\text{align}}\) mapping \(u \to (0,1,0)\) (Y-up viewer).  
5. Apply \(R_{\text{align}}\) to splat root, graph nodes, bounds, hotspots consistently.  
6. Floor plane: RANSAC on low-percentile Y gaussians **or** plane fit to camera positions with normal \(u\).

### 2.3 Navigation constraints (keep users out of artifact clusters)

**Walkable volume** \(W\):

1. Sample up to \(N\) gaussian centers (e.g. 50k) with opacity above threshold.  
2. Statistical outlier removal: keep points within **Mahalanobis** distance or iterative σ-clip (2.5σ).  
3. Camera path “tube”: union of spheres of radius \(r_{\text{tube}}\) along polyline of ordered cameras (order by frame index or nearest-neighbor path).  
4. \(W = \text{convex hull of inlier cams} \oplus \text{margin}\) **∩** density isosurface **∪** tube.  
   Practical MVP: **capsule along camera path + inflated camera AABB**, not full mesh collision.  
5. On each move: project proposed position \(p'\) into \(W\) (closest point).  
6. **Forbidden zones:** low-density voxels + high floater score (isolated gaussians far from path).

**Look constraints (optional):** soft clamp pitch \(\in [-80°, +80°]\); prevent roll.

### 2.4 Camera path / navigation graph

**Nodes \(V\):**

- Subsample training cameras (stride or farthest-point) → standpoints.  
- Optionally merge nodes within ε distance.

**Edges \(E\):**

- Connect \(i \to j\) if \(\|c_i - c_j\| < d_{\max}\) and segment stays inside \(W\).  
- Or chain sequential frames + k-NN (k=3).

**Traversal:**

- Dijkstra / A* on graph for “go to room X”.  
- Smooth path: Catmull-Rom on node positions; slerp quaternions for look direction.  
- Duration: distance / speed (adaptive).

### 2.5 Room boundary estimation

MVP (single room, e.g. kitchen):

1. Inlier gaussian AABB (p2–p98) → `room_aabb`.  
2. Floor = bottom face + thickness; ceiling = top.  
3. Ignore voxels with count < τ.

Multi-room later:

1. Cluster camera path by spatial gaps or time gaps.  
2. One bounds + subgraph per cluster.  
3. Door edges = nearest nodes between clusters.

### 2.6 Interaction model

| Input | Behavior |
|-------|----------|
| Drag / gyro | Free-look at current node or walk pose |
| Click floor / minimap | Pathfind + lerp to nearest node |
| Hotspot | Lerp to target node / room spawn |
| Scroll / pinch | Zoom FOV only (not dolly into floaters) in STANDPOINT mode |
| WASD (BOUNDED_WALK) | Move in floor plane, project into \(W\) |
| Reset | Teleport/lerp to spawn |
| Dollhouse toggle | Switch mode; disable walk |

### 2.7 Viewer polish

- **Speed:** \(v = v_0 \cdot \text{diameter}(W) / d_{\text{ref}}\) so kitchen and villa feel similar.  
- **Auto-focus:** on mode enter, brief ease to spawn look-at.  
- **Reset-to-room:** always visible control.  
- **Minimap:** top-down orthographic of floor AABB + node dots + camera frustum.  
- **Loading:** don’t show splat until spawn applied (avoids blob flash).

---

## 3. Required data structures

### 3.1 `TourSpatialManifest` (versioned JSON, stored next to splat)

```ts
/** Viewer-space: Y-up, units = splat export frame (dataparser-normalized). */
export interface TourSpatialManifest {
  version: 1;
  splat_url: string;
  /** From dataparser_transforms.json — for debugging / re-bake */
  dataparser?: {
    transform: number[][]; // 3x4
    scale: number;
  };
  up: [number, number, number];       // gravity in splat space before align
  align: {
    /** Root rotation applied in viewer so up → +Y */
    rotation_xyzw: [number, number, number, number];
  };
  spawn: {
    position: [number, number, number];
    rotation_xyzw: [number, number, number, number]; // camera orientation
    eye_height: number;
    /** Preferred graph node to spawn at, when the graph already covers this position */
    node_id?: string;
  };
  bounds: {
    /** Robust AABB of usable volume */
    min: [number, number, number];
    max: [number, number, number];
    /** Optional: list of AABBs or capsule path for walkable W */
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
}

export interface WalkableVolume {
  type: 'camera_tube' | 'aabb' | 'mesh';
  /** camera_tube */
  path?: [number, number, number][];
  radius?: number;
  /** aabb */
  min?: [number, number, number];
  max?: [number, number, number];
  /** mesh: url to glb collision proxy */
  mesh_url?: string;
}

export interface NavigationGraph {
  nodes: Array<{
    id: string;
    position: [number, number, number];
    /** Optional preferred look quaternion */
    rotation_xyzw?: [number, number, number, number];
    room_id?: string;
    /** Source: train frame index or "spawn" */
    source?: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    weight: number;
  }>;
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
  position: [number, number, number]; // world
  label: string;
  target_node_id?: string;
  target_room_id?: string;
  payload?: Record<string, unknown>;
}
```

### 3.2 Runtime state (viewer store extension)

```ts
interface SplatTourViewerState {
  mode: 'STANDPOINT' | 'BOUNDED_WALK' | 'WAYPOINT_LERP' | 'DOLLHOUSE';
  currentNodeId: string | null;
  cameraPosition: [number, number, number];
  cameraRotation: [number, number, number, number];
  isTransitioning: boolean;
  activeRoomId: string | null;
}
```

### 3.3 Bake job artifact (backend)

Post-export, no retrain:

```
job_id/
  splat.splat
  transforms.json          # already have for image datasets
  dataparser_transforms.json
  tour_spatial_manifest.json   # NEW
  walkable_debug.ply           # optional authoring debug
```

---

## 4. What to reuse (existing repos)

### 360-tours (frontend)

| Component | Reuse how |
|-----------|-----------|
| `SplatViewer.tsx` | Replace SuperSplat **iframe** with in-app constrained viewer (keep iframe only as “Advanced / Edit” escape hatch) |
| `DollhouseEditor.tsx` | Multi-room layout + R3F `Splat` + `OrbitControls` → basis for **DOLLHOUSE** mode |
| `PanoramaViewer.tsx` | Interaction patterns: hotspots, scene change queue, VR/gyro UX patterns |
| Hotspot system (`Hotspot*`, `HotspotPanel`, types) | Same product model: nav / info / media; 3D positions instead of yaw/pitch |
| `FloorPlanOverlay.tsx` / `FloorPlanEditor.tsx` | Minimap + click-to-navigate projection |
| `viewerStore.ts` | Extend with splat tour node/room state |
| `useSplatPipeline.ts` + lab API | Load `splat_url` + future `manifest_url` |
| `PublicTourPage` / `EmbedTourPage` / embed | Ship constrained player, not free SuperSplat |
| Tour types / editor store | Room list + hotspot CRUD patterns |

### 360ghar-backend

| Component | Reuse how |
|-----------|-----------|
| `modal_worker.export_ply_to_splat` / `train_splat_images` | Pipeline complete; **add bake step after export** only |
| Volume job layout (`/data/{job_id}/…`) | Write `tour_spatial_manifest.json` beside splat |
| `dataparser_transforms.json` on jobs | Feed bake (scale/center) |
| Dataset `transforms.json` (image path) | Camera graph source of truth |
| `SplatJob` fields (`splat_url`, future `collision_url`) | Add `manifest_url` / `navigation_url` |
| Lab API status machine | Optional stage `navigation` / `baking_spatial` after `ready` |

### Already learned (kitchen audit)

| Finding | Navigation implication |
|---------|------------------------|
| Scene diameter ~O(10), mean near 0 | Spawn at camera centroid, not “fit whole AABB from outside” |
| Hollow interior shell | Default **inside**; dollhouse is separate mode |
| `dataparser.scale ≈ 0.45`, identity R + translate | Bake must use **same space as .splat** |
| raw_only export (no cuboid recenter) | Bounds from gaussians + cameras, not cleanup mesh |

---

## 5. What to add

### 5.1 Backend (bake only — no COLMAP/train)

| New | Purpose |
|-----|---------|
| `app/services/spatial_bake.py` | Poses → graph; gaussians → bounds/spawn/up |
| Modal step or local CLI `scripts/bake_tour_spatial.py` | Produce manifest from existing job artifacts |
| API: `GET /splat-jobs/{id}/navigation` | Serve manifest |
| Schema: `manifest_url` on splat jobs | Persistence |
| Optional: downsample PLY sample for density (from existing export, not retrain) | Better bounds |

### 5.2 Frontend (core product)

| New | Purpose |
|-----|---------|
| `SplatTourViewer.tsx` | First-class player (R3F + `@react-three/drei` `Splat` or Spark/PlayCanvas engine) |
| `navigation/constrain.ts` | Project moves into walkable volume |
| `navigation/graph.ts` | Pathfind + lerp |
| `navigation/spawn.ts` | Apply spawn/up on load |
| `SplatMinimap.tsx` | Top-down nav |
| `SplatTourControls.tsx` | Reset, mode toggle, speed |
| Manifest fetch + cache | Alongside splat URL |
| Editor: “place hotspot in splat” | Raycast to floor / node |

### 5.3 Explicit non-goals (now)

- Retrain / hyperparameter search  
- COLMAP rematch  
- Floater deletion as product requirement  
- Full physical collision mesh from NeRF  
- Unrestricted SuperSplat as default buyer UX  

---

## 6. Implementation phases

### Phase A — Usable single room (kitchen proof) ✅ implemented

1. Bake manifest offline from `kitchen_ready/transforms.json` + sample of `kitchen.splat` positions.  
2. `SplatTourViewer`: load splat, apply spawn, free-look, **no free translate**.  
3. Graph = subsampled cameras; click node list or “next”.  
4. Reset button.  
5. SuperSplat demoted to **Advanced free-fly** only on kitchen tour page.

**How to open:** Lab → “Kitchen tour (constrained)” or `/lab/kitchen-tour`  
**Assets:** `public/splats/kitchen.splat` + `kitchen_manifest.json`  
**Bake CLI:** `360ghar-backend/scripts/bake_tour_spatial.py`

### Phase B — Bounded walk + minimap

1. Camera-tube walkable volume.  
2. WASD clamped.  
3. Minimap + reset.  
4. Speed scaling from bounds diameter.

### Phase C — Product tour parity

1. Hotspots (nav + info) in 3D.  
2. Multi-room graph + door edges.  
3. Dollhouse mode from `DollhouseEditor`.  
4. Embed player uses same controller.  
5. Bake on Modal after every successful export.

---

## 7. Success criteria (UX, not PSNR)

| Metric | Target |
|--------|--------|
| Time to “understand this is a room” | &lt; 2s after load (spawn inside) |
| User reaches floater cluster in STANDPOINT mode | ~0 without explicit “Advanced free-fly” |
| Reset recovers orientation | 1 click |
| Kitchen tour completable without keyboard | Yes (look + tap waypoints) |

---

## 8. Summary

**Stop optimizing the cloud of points. Start optimizing the allowed camera trajectory.**

360 Ghar should present GS like Matterport presents mesh:  
**capture poses define truth; the viewer lies slightly (constraints) so the buyer never experiences the mess outside the walkable volume.**
