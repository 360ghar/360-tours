import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Keyboard, X, DoorOpen } from 'lucide-react';
import { PageLoader } from '@/components/ui';
import { PanoramaViewer } from '@/components/features/PanoramaViewer';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import { cn } from '@/utils';
import type { Scene, Hotspot, SceneMetadata, HotspotType } from '@/types';

/**
 * Local spatial-tour harness (DEV ONLY).
 *
 * Loads `seed_properties/<propertyId>/tour.json` (served by the dev Vite middleware
 * in vite.config.ts) and renders it with the production PanoramaViewer so we can
 * visually verify that navigation hotspots land on the correct doorways and link
 * to the right rooms — without uploading anything to Cloudinary/DB.
 *
 * Routes:
 *   /local/:propertyId               → view the tour
 *   /local/:propertyId?calibrate=1   → editor mode; click anywhere to read the
 *                                      yaw/pitch under the cursor (pixel→yaw check).
 *
 * The tour.json scene/hotspot shape mirrors the API (Scene/Hotspot) so the same
 * file ports 1:1 to the backend; the only local-specific field is `image_url`,
 * which is a path relative to the property folder and resolved here.
 */

interface RawHotspot {
  id?: string;
  type: HotspotType;
  position: { yaw: number; pitch: number; radius?: number };
  target_scene_id?: string | null;
  title?: string | null;
  description?: string | null;
  icon_color?: string | null;
  icon_size?: number | null;
}

interface RawScene {
  id: string;
  title?: string | null;
  description?: string | null;
  image_url: string; // relative to the property folder
  order_index?: number;
  metadata?: SceneMetadata | null;
  hotspots?: RawHotspot[];
}

interface RawTour {
  title?: string;
  initial_scene_id?: string;
  scenes: RawScene[];
}

const NOW = '1970-01-01T00:00:00Z';

function buildHotspot(raw: RawHotspot, sceneId: string, index: number): Hotspot {
  return {
    id: raw.id ?? `${sceneId}-h${index}`,
    scene_id: sceneId,
    type: raw.type,
    position: { yaw: raw.position.yaw, pitch: raw.position.pitch, radius: raw.position.radius },
    target_scene_id: raw.target_scene_id ?? null,
    title: raw.title ?? null,
    description: raw.description ?? null,
    icon: null,
    icon_name: null,
    icon_color: raw.icon_color ?? (raw.type === 'navigation' ? '#FF5733' : '#10b981'),
    icon_size: raw.icon_size ?? 40,
    content: null,
    custom_data: {},
    order_index: index,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  };
}

function buildScene(raw: RawScene, propertyId: string, index: number): Scene {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
  const isAbsolute = /^https?:\/\//.test(raw.image_url) || raw.image_url.startsWith('/');
  const image_url = isAbsolute
    ? raw.image_url
    : `${base}/seed_properties/${propertyId}/${raw.image_url.replace(/^\/+/, '')}`;
  return {
    id: raw.id,
    tour_id: propertyId,
    title: raw.title ?? null,
    description: raw.description ?? null,
    image_url,
    thumbnail_url: null,
    vr_url: null,
    order_index: raw.order_index ?? index,
    metadata: raw.metadata ?? { initial_view: { yaw: 0, pitch: 0, zoom: 0 } },
    is_processed: true,
    processing_error: null,
    created_at: NOW,
    updated_at: NOW,
    hotspots: (raw.hotspots ?? []).map((h, i) => buildHotspot(h, raw.id, i)),
  };
}

export function LocalTourPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [searchParams] = useSearchParams();
  const calibrate = searchParams.get('calibrate') === '1';

  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [lastClick, setLastClick] = useState<{ yaw: number; pitch: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['local-tour', propertyId],
    queryFn: async (): Promise<RawTour> => {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
      const res = await fetch(`${base}/seed_properties/${propertyId}/tour.json`);
      if (!res.ok) throw new Error(`tour.json not found (${res.status})`);
      return res.json();
    },
    enabled: !!propertyId,
  });

  const scenes = useMemo(() => {
    if (!data || !propertyId) return [];
    return data.scenes
      .map((s, i) => buildScene(s, propertyId, i))
      .sort((a, b) => a.order_index - b.order_index);
  }, [data, propertyId]);

  const currentScene = useMemo(() => {
    if (!scenes.length) return undefined;
    const targetId = currentSceneId ?? data?.initial_scene_id ?? scenes[0].id;
    return scenes.find((s) => s.id === targetId) ?? scenes[0];
  }, [scenes, currentSceneId, data?.initial_scene_id]);

  const currentIndex = useMemo(
    () => (currentScene ? scenes.findIndex((s) => s.id === currentScene.id) : -1),
    [scenes, currentScene]
  );

  const step = useCallback(
    (delta: number) => {
      if (!scenes.length || currentIndex < 0) return;
      const next = (currentIndex + delta + scenes.length) % scenes.length;
      setCurrentSceneId(scenes[next].id);
    },
    [scenes, currentIndex]
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keyboard navigation: ←/→ change room, F fullscreen, ? hints, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      switch (e.key) {
        case 'ArrowRight':
          step(1);
          break;
        case 'ArrowLeft':
          step(-1);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case '?':
          setShowHints((v) => !v);
          break;
        case 'Escape':
          setShowHints(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, toggleFullscreen]);

  const handlePositionClick = useCallback((pos: { yaw: number; pitch: number }) => {
    const rounded = { yaw: Math.round(pos.yaw * 10) / 10, pitch: Math.round(pos.pitch * 10) / 10 };
    setLastClick(rounded);
    console.log('[calibrate] clicked position (deg):', rounded);
  }, []);

  const viewerSettings = useMemo(
    () => ({ ...DEFAULT_TOUR_SETTINGS, auto_rotate: false, enable_vr: false }),
    []
  );

  if (isLoading) return <PageLoader message="Loading tour…" />;

  if (error || !currentScene) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-8 text-center text-white">
        <div className="max-w-lg">
          <h1 className="text-2xl font-bold">Tour not available</h1>
          <p className="mt-2 text-white/70">
            Could not load <code className="text-white">/seed_properties/{propertyId}/tour.json</code>.
            {error instanceof Error ? ` (${error.message})` : ''}
          </p>
          <p className="mt-3 text-sm text-white/50">
            Generate it with{' '}
            <code className="text-white">python backend/tools/build_spatial_tour.py &lt;dir&gt;</code>{' '}
            or author it manually.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-neutral-950">
      <PanoramaViewer
        scene={currentScene}
        hotspots={currentScene.hotspots ?? []}
        isEditor={calibrate}
        tourSettings={viewerSettings}
        onSceneChange={(sceneId) => setCurrentSceneId(sceneId)}
        onPositionClick={calibrate ? handlePositionClick : undefined}
      />

      {/* Top bar: tour title + current room */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 bg-gradient-to-b from-black/70 via-black/30 to-transparent p-4 sm:p-5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-white/55">
            {data?.title ?? propertyId}
          </p>
          {currentScene.title && (
            <h1 className="mt-0.5 flex items-center gap-2 text-xl font-semibold text-white drop-shadow sm:text-2xl">
              <DoorOpen className="h-5 w-5 shrink-0 text-[var(--color-primary-400)]" />
              <span className="truncate">{currentScene.title}</span>
            </h1>
          )}
          <p className="mt-0.5 text-xs text-white/55">
            Room {currentIndex + 1} of {scenes.length}
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          {calibrate && (
            <div className="mr-1 rounded-lg bg-black/70 px-3 py-1.5 font-mono text-xs text-emerald-300">
              calibrate{lastClick ? `: ${lastClick.yaw}°, ${lastClick.pitch}°` : ''}
            </div>
          )}
          <button
            onClick={() => setShowHints((v) => !v)}
            aria-label="Keyboard shortcuts"
            className="rounded-full bg-white/10 p-2 text-white/90 transition-colors hover:bg-white/20"
          >
            <Keyboard className="h-5 w-5" />
          </button>
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="rounded-full bg-white/10 p-2 text-white/90 transition-colors hover:bg-white/20"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* On-screen prev/next room steppers */}
      {scenes.length > 1 && (
        <>
          <button
            onClick={() => step(-1)}
            aria-label="Previous room"
            className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/90 backdrop-blur-sm transition hover:bg-black/65 hover:scale-105 sm:left-4"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={() => step(1)}
            aria-label="Next room"
            className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/90 backdrop-blur-sm transition hover:bg-black/65 hover:scale-105 sm:right-4"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Bottom scene navigator. pointer-events-none on the wrapper so floor pucks
          rendered low stay clickable; only the rail itself captures clicks. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pb-3 pt-10 sm:px-4 sm:pb-4">
        <div className="pointer-events-auto mx-auto flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {scenes.map((s) => {
            const active = currentScene.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentSceneId(s.id)}
                aria-current={active}
                className={cn(
                  'group relative shrink-0 overflow-hidden rounded-xl border transition-all duration-200',
                  active
                    ? 'border-[var(--color-primary-500)] ring-2 ring-[var(--color-primary-500)]/40'
                    : 'border-white/15 opacity-75 hover:opacity-100 hover:border-white/40'
                )}
              >
                <img
                  src={s.image_url}
                  alt={s.title ?? 'Scene'}
                  loading="lazy"
                  className="h-14 w-24 object-cover sm:h-16 sm:w-28"
                />
                <span
                  className={cn(
                    'absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-3 text-left text-[11px] font-medium',
                    active ? 'text-white' : 'text-white/80'
                  )}
                >
                  {s.title ?? s.id}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Keyboard hints */}
      {showHints && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setShowHints(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-neutral-900 p-5 text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Shortcuts</h2>
              <button onClick={() => setShowHints(false)} aria-label="Close" className="text-white/60 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ['Previous / next room', '← / →'],
                ['Fullscreen', 'F'],
                ['Toggle this help', '?'],
                ['Walk to a room', 'Click a floor marker'],
              ].map(([label, key]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-white/70">{label}</dt>
                  <dd className="font-mono text-xs text-white/90">{key}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
