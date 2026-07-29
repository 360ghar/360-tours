import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Splat, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Crosshair, Home, Info } from 'lucide-react';
import { Button } from '@/components/ui';
import type { TourSpatialManifest } from '@/types/tourSpatial';
import {
  alignManifest,
  bfsOrder,
  buildAdjacency,
  quaternionToYawPitch,
  shortestPath,
  type AlignedTour,
} from '@/lib/navigation/spatialMath';
import { cn } from '@/utils';

interface SplatTourViewerProps {
  manifest: TourSpatialManifest;
  className?: string;
  /** Override splat URL (e.g. absolute CDN). Defaults to manifest.splat_url */
  splatUrl?: string;
}

/** Safety net only — real readiness comes from the splat loader via useProgress. */
const LOAD_TIMEOUT_MS = 30000;

/**
 * Phase A constrained GS tour player:
 * - Spawn inside room (standpoint)
 * - Free-look only (no free-flight)
 * - Waypoint graph navigation with lerp
 * - Reset-to-room
 */
export function SplatTourViewer({ manifest, className, splatUrl }: SplatTourViewerProps) {
  const aligned = useMemo(() => alignManifest(manifest), [manifest]);
  const url = splatUrl ?? manifest.splat_url;

  const adjacency = useMemo(() => buildAdjacency(manifest.graph.edges), [manifest.graph.edges]);
  const orderedNodes = useMemo(() => {
    const ids = bfsOrder(
      adjacency,
      aligned.spawnNodeId,
      aligned.nodes.map((n) => n.id),
    );
    const byId = new Map(aligned.nodes.map((n) => [n.id, n]));
    return ids.map((id) => byId.get(id)).filter((n): n is (typeof aligned.nodes)[number] => Boolean(n));
  }, [adjacency, aligned]);

  const [nodeId, setNodeId] = useState(aligned.spawnNodeId);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hint, setHint] = useState('Drag to look · use arrows or waypoints to move');
  const pendingHopsRef = useRef<string[]>([]);

  const { active: splatLoading } = useProgress();
  // Derived during render (not an effect) per React's "adjusting state based
  // on a prop change" pattern — avoids the extra render pass an effect would
  // cause, and avoids reading a ref during render.
  const [prevSplatLoading, setPrevSplatLoading] = useState(splatLoading);
  const [hasStartedLoading, setHasStartedLoading] = useState(splatLoading);
  if (splatLoading !== prevSplatLoading) {
    setPrevSplatLoading(splatLoading);
    if (splatLoading) {
      setHasStartedLoading(true);
    } else if (hasStartedLoading && loadState === 'loading') {
      setLoadState('ready');
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoadState((current) => (current === 'loading' ? 'error' : current));
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  const nodeIndex = Math.max(
    0,
    orderedNodes.findIndex((n) => n.id === nodeId),
  );

  const goToId = useCallback(
    (targetId: string) => {
      if (targetId === nodeId) return;
      const path = shortestPath(adjacency, nodeId, targetId);
      const hops = path.slice(1);
      if (hops.length === 0) return;
      pendingHopsRef.current = hops.slice(1);
      setNodeId(hops[0]);
      const idx = orderedNodes.findIndex((n) => n.id === targetId);
      setHint(idx >= 0 ? `Viewpoint ${idx + 1} / ${orderedNodes.length}` : 'Moving to waypoint');
    },
    [adjacency, nodeId, orderedNodes],
  );

  const handleNodeArrived = useCallback(() => {
    const next = pendingHopsRef.current.shift();
    if (next) setNodeId(next);
  }, []);

  const reset = useCallback(() => {
    pendingHopsRef.current = [];
    setNodeId(aligned.spawnNodeId);
    setHint('Reset to room spawn');
  }, [aligned.spawnNodeId]);

  const goToIndex = (idx: number) => {
    const n = orderedNodes[idx];
    if (n) goToId(n.id);
  };
  const prev = () => goToIndex(Math.max(0, nodeIndex - 1));
  const next = () => goToIndex(Math.min(orderedNodes.length - 1, nodeIndex + 1));

  return (
    <div className={cn('relative w-full h-full min-h-[480px] bg-black rounded-lg overflow-hidden', className)}>
      {loadState !== 'ready' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 text-white text-sm">
          {loadState === 'error' ? 'Could not load the tour — try reloading the page.' : 'Loading tour…'}
        </div>
      )}

      <Canvas
        camera={{ fov: aligned.fov, near: 0.01, far: 200, position: [0, 0, 0] }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#0a0a0c']} />
        <TourScene
          url={url}
          aligned={aligned}
          nodeId={nodeId}
          onNodeArrived={handleNodeArrived}
        />
      </Canvas>

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none z-10">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/55 backdrop-blur px-3 py-1.5 text-xs text-white/90">
          <Info className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span>{hint}</span>
        </div>
        <div className="pointer-events-auto flex gap-1">
          <Button size="sm" variant="secondary" className="h-8 bg-black/55 text-white border-0 hover:bg-black/70" onClick={reset}>
            <Home className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-2 z-10 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/55 backdrop-blur px-2 py-1">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-white hover:bg-white/10" onClick={prev} disabled={nodeIndex <= 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-white/90 min-w-[5rem] text-center tabular-nums">
            {nodeIndex + 1} / {orderedNodes.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-white hover:bg-white/10"
            onClick={next}
            disabled={nodeIndex >= orderedNodes.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="pointer-events-auto max-w-full overflow-x-auto px-4">
          <div className="flex gap-1">
            {orderedNodes.map((n, i) => (
              <button
                key={n.id}
                type="button"
                title={n.source ?? n.id}
                onClick={() => goToIndex(i)}
                className={cn(
                  'h-2 w-2 rounded-full shrink-0 transition-colors',
                  n.id === nodeId ? 'bg-emerald-400' : 'bg-white/30 hover:bg-white/60',
                )}
              />
            ))}
          </div>
        </div>
        <p className="text-[10px] text-white/50 flex items-center gap-1">
          <Crosshair className="h-3 w-3" />
          Free-look only · no free-flight into floaters
        </p>
      </div>
    </div>
  );
}

function TourScene({
  url,
  aligned,
  nodeId,
  onNodeArrived,
}: {
  url: string;
  aligned: AlignedTour;
  nodeId: string;
  onNodeArrived: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(aligned.spawnPosition.clone());
  const currentPos = useRef(aligned.spawnPosition.clone());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const arrivedRef = useRef(false);
  const dragging = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0 });
  const { camera, gl } = useThree();

  // Apply scene align to splat root
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.quaternion.copy(aligned.align);
    }
  }, [aligned.align]);

  // When node changes, set target position AND reset the look direction to
  // the baked orientation for that waypoint (free-look then adjusts from there).
  useEffect(() => {
    const node = aligned.nodes.find((n) => n.id === nodeId);
    const rotation = node?.alignedRotation ?? aligned.spawnRotation;
    const { yaw: baseYaw, pitch: basePitch } = quaternionToYawPitch(rotation);
    yaw.current = baseYaw;
    pitch.current = basePitch;
    arrivedRef.current = false;
    if (node) {
      targetPos.current.copy(node.alignedPosition);
    } else {
      targetPos.current.copy(aligned.spawnPosition);
    }
  }, [nodeId, aligned]);

  // Pointer free-look
  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      lastPtr.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPtr.current.x;
      const dy = e.clientY - lastPtr.current.y;
      lastPtr.current = { x: e.clientX, y: e.clientY };
      const sens = 0.005;
      yaw.current -= dx * sens;
      pitch.current -= dy * sens;
      const lim = Math.PI / 2 - 0.08;
      pitch.current = Math.max(-lim, Math.min(lim, pitch.current));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointermove', onMove);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointermove', onMove);
    };
  }, [gl]);

  useFrame((_, dt) => {
    // Lerp position toward standpoint (no free translate)
    const speed = 1 / Math.max(aligned.lerpSeconds, 0.05);
    currentPos.current.lerp(targetPos.current, 1 - Math.exp(-speed * dt * 3));
    const arrived = currentPos.current.distanceTo(targetPos.current) < 1e-3;
    if (arrived) {
      currentPos.current.copy(targetPos.current);
      if (!arrivedRef.current) {
        arrivedRef.current = true;
        onNodeArrived();
      }
    }

    camera.position.copy(currentPos.current);

    // Y-up free-look (scene already aligned)
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch.current);
    camera.quaternion.copy(qYaw).multiply(qPitch);
  });

  return (
    <group ref={groupRef}>
      <Splat src={url} />
    </group>
  );
}
