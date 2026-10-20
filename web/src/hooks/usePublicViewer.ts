import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toursApi } from '@/api';
import { QUERY_KEYS } from '@/constants';
import { getViewerSceneScope, useViewerStore } from '@/stores';
import { usePublicTourTracking } from '@/hooks/usePublicTourTracking';
import { parseBooleanParam } from '@/utils';
import { openHotspotLink, sceneViewDirection } from '@/utils/publicViewer';
import { resolveTourSettings } from '@/utils/tourSettings';
import { isPlayablePublicTour } from '@/utils/publicTour';
import { parseLinkHotspotContent } from '@/types/hotspotContent';
import type { Hotspot, PublicScene, ResolvedTourSettings } from '@/types';

type ViewerScope = 'public' | 'embed';

interface UsePublicViewerOptions {
  /** Keys the scene-selection scope: public and embed viewers stay isolated. */
  scope: ViewerScope;
  /**
   * Embed only: fold the `branding` query param into
   * `settings.branding.show_watermark`.
   */
  mergeBranding?: boolean;
  /** Runs on every fullscreen transition (analytics, parent postMessage). */
  onFullscreenChange?: (isFullscreen: boolean) => void;
  /** Extra work when a hotspot is clicked, before the link/modal handling. */
  onHotspotClick?: (hotspot: Hotspot) => void;
}

/**
 * Everything `/view/:id` and `/embed/:id` need to render a public tour: the
 * anonymous queries, scene scoping and selection, URL-param overrides, viewer
 * settings, fullscreen, analytics and hotspot dispatch.
 *
 * The two pages diverge only in chrome (the public page has a header, thumbnail
 * rail, info panel and share modal; the embed is chromeless and talks to its
 * parent over postMessage), so everything above that line lives here once.
 */
export function usePublicViewer({
  scope,
  mergeBranding = false,
  onFullscreenChange,
  onHotspotClick,
}: UsePublicViewerOptions) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  // ─── Scene scope ────────────────────────────────────────────────────
  const sceneScopeId = useMemo(() => (id ? getViewerSceneScope(scope, id) : null), [scope, id]);
  const currentSceneId = useViewerStore(state =>
    sceneScopeId ? (state.currentSceneIdsByScope[sceneScopeId] ?? null) : null
  );
  const setCurrentSceneForScope = useViewerStore(state => state.setCurrentSceneForScope);
  const clearCurrentSceneScope = useViewerStore(state => state.clearCurrentSceneScope);
  const setCurrentScene = useCallback(
    (sceneId: string | null) => {
      if (sceneScopeId) setCurrentSceneForScope(sceneScopeId, sceneId);
    },
    [sceneScopeId, setCurrentSceneForScope]
  );

  useEffect(() => {
    return () => {
      if (sceneScopeId) clearCurrentSceneScope(sceneScopeId);
    };
  }, [sceneScopeId, clearCurrentSceneScope]);

  // ─── URL parameters ─────────────────────────────────────────────────
  const startSceneId = searchParams.get('scene');
  const autoplay = parseBooleanParam(searchParams.get('autoplay')) ?? true;
  const navbarParam = parseBooleanParam(searchParams.get('navbar'));
  const brandingParam = parseBooleanParam(searchParams.get('branding'));
  const fullscreenParam = parseBooleanParam(searchParams.get('fullscreen'));
  const vrParam = parseBooleanParam(searchParams.get('vr'));
  const rotateParam = parseBooleanParam(searchParams.get('rotate'));

  // ─── Data (anonymous endpoints) ─────────────────────────────────────
  const {
    data: tour,
    isLoading: isLoadingTour,
    error: tourError,
    refetch: refetchTour,
  } = useQuery({
    queryKey: [QUERY_KEYS.PUBLIC_TOUR, id],
    // The server counts the view when the tour is fetched (once per viewer per 30 minutes).
    queryFn: () => toursApi.getPublicTour(id!),
    enabled: !!id,
  });

  const playableTour = tour && isPlayablePublicTour(tour) ? tour : undefined;
  const scenes = playableTour?.scenes;

  // Floor plans come from the top-level tour.floor_plans (floor_plans table).
  const floorPlans = tour?.floor_plans ?? [];

  const sortedScenes = useMemo(() => {
    if (!scenes) return [];
    return [...scenes].sort((a, b) => a.order_index - b.order_index);
  }, [scenes]);

  const currentScene: PublicScene | undefined = useMemo(() => {
    if (!sortedScenes.length) return undefined;
    return sortedScenes.find(s => s.id === currentSceneId) || sortedScenes[0];
  }, [currentSceneId, sortedScenes]);

  const currentIndex = useMemo(() => {
    if (!currentScene) return -1;
    return sortedScenes.findIndex(s => s.id === currentScene.id);
  }, [currentScene, sortedScenes]);

  // ─── Viewer settings (tour settings + URL overrides) ────────────────
  const viewerSettings: ResolvedTourSettings | undefined = useMemo(() => {
    if (!tour) return undefined;

    const base = resolveTourSettings(tour.settings);
    const showNavbarParam = navbarParam ?? true;
    const enableFullscreen = fullscreenParam ?? true;
    const enableVR = vrParam ?? true;

    let autoRotate = base.auto_rotate === true;
    if (rotateParam !== undefined) {
      autoRotate = rotateParam;
    }
    if (!autoplay) {
      autoRotate = false;
    }

    const merged: ResolvedTourSettings = {
      ...base,
      auto_rotate: autoRotate,
      show_navbar: base.show_navbar && showNavbarParam,
      enable_fullscreen: base.enable_fullscreen && enableFullscreen,
      enable_vr: base.enable_vr && enableVR,
    };

    if (!mergeBranding) return merged;

    return {
      ...merged,
      branding: {
        ...base.branding,
        show_watermark: base.branding.show_watermark && (brandingParam ?? true),
      },
    };
  }, [
    autoplay,
    brandingParam,
    fullscreenParam,
    mergeBranding,
    navbarParam,
    rotateParam,
    tour,
    vrParam,
  ]);

  const showNavbar = viewerSettings?.show_navbar !== false;
  const fullscreenEnabled = viewerSettings?.enable_fullscreen !== false;

  // ─── Initial scene ──────────────────────────────────────────────────
  /**
   * The scene the viewer should open on: `?scene=`, then the tour's configured
   * initial scene, then the first scene. Exposed because the embed reports it
   * in its `ready` message before the selection effect has settled.
   */
  const initialSceneId = useMemo(() => {
    if (!sortedScenes.length) return null;
    const exists = (sceneId: string | null | undefined) =>
      !!sceneId && sortedScenes.some(s => s.id === sceneId);
    const requested = exists(startSceneId) ? startSceneId : undefined;
    const configured = exists(tour?.settings?.initial_scene_id)
      ? tour?.settings?.initial_scene_id
      : undefined;
    return requested || configured || sortedScenes[0].id;
  }, [sortedScenes, startSceneId, tour?.settings?.initial_scene_id]);

  useEffect(() => {
    if (!sortedScenes.length) {
      if (currentSceneId !== null) setCurrentScene(null);
      return;
    }
    const exists = (sceneId: string | null | undefined) =>
      !!sceneId && sortedScenes.some(s => s.id === sceneId);
    const requested = exists(startSceneId) ? startSceneId : undefined;
    const shouldUseInitialScene =
      (requested && currentSceneId !== requested) || !exists(currentSceneId);

    if (shouldUseInitialScene && initialSceneId) {
      setCurrentScene(initialSceneId);
    }
  }, [currentSceneId, initialSceneId, setCurrentScene, sortedScenes, startSceneId]);

  // ─── Analytics ──────────────────────────────────────────────────────
  const { trackEvent, sessionId } = usePublicTourTracking({
    tourId: id,
    tourLoaded: !!playableTour,
    currentSceneId: currentScene?.id,
    currentSceneView: sceneViewDirection(currentScene, tour?.settings),
  });

  // ─── Fullscreen ─────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenEnabled) return;
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
      return;
    }
    void document.exitFullscreen().catch(() => undefined);
  }, [fullscreenEnabled]);

  // Consumer callbacks are read through refs so a fresh inline arrow does not
  // re-register the document listener (or rebuild the hotspot handler) on every
  // render.
  const onFullscreenChangeRef = useRef(onFullscreenChange);
  const onHotspotClickRef = useRef(onHotspotClick);
  useEffect(() => {
    onFullscreenChangeRef.current = onFullscreenChange;
    onHotspotClickRef.current = onHotspotClick;
  });

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = !!document.fullscreenElement;
      setIsFullscreen(fullscreen);
      onFullscreenChangeRef.current?.(fullscreen);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // ─── Hotspots ───────────────────────────────────────────────────────
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);
  const [showHotspotModal, setShowHotspotModal] = useState(false);

  const handleHotspotClick = useCallback(
    (hotspot: Hotspot) => {
      trackEvent('hotspot_click', currentScene?.id, hotspot.id);
      onHotspotClickRef.current?.(hotspot);

      // Navigation is handled inside PanoramaViewer.
      if (hotspot.type === 'navigation') return;

      // Link hotspots open directly when the URL is usable; otherwise they fall
      // through to the modal like every other type.
      if (hotspot.type === 'link') {
        const content = parseLinkHotspotContent(hotspot.content);
        const url = content?.url;
        const target = content?.target ?? '_blank';
        if (url && openHotspotLink(url, target)) return;
      }

      setActiveHotspot(hotspot);
      setShowHotspotModal(true);
    },
    [currentScene?.id, trackEvent]
  );

  const closeHotspotModal = useCallback(() => setShowHotspotModal(false), []);

  return {
    id,
    searchParams,

    // data
    tour: playableTour,
    isLoadingTour,
    tourError,
    refetchTour,
    scenes,
    sortedScenes,
    floorPlans,

    // scene selection
    currentSceneId,
    currentScene,
    currentIndex,
    initialSceneId,
    setCurrentScene,

    // settings
    viewerSettings,
    showNavbar,
    fullscreenEnabled,
    // Only the params a page still needs on its own: the embed folds `branding`
    // into its own chrome decisions. The rest are already applied to
    // viewerSettings / the initial scene here.
    brandingParam,

    // fullscreen
    isFullscreen,
    toggleFullscreen,

    // analytics
    trackEvent,
    sessionId,

    // hotspots
    activeHotspot,
    showHotspotModal,
    handleHotspotClick,
    closeHotspotModal,
  };
}

