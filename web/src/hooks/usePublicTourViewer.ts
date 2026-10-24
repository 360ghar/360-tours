import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toursApi } from '@/api';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { getViewerSceneScope, useViewerStore } from '@/stores';
import { isPlayablePublicTour } from '@/utils/publicTour';
import { resolveTourSettings } from '@/utils/tourSettings';
import { parseBooleanParam } from '@/utils';
import { sortScenes } from '@/utils/scenes';

/**
 * Shared data layer for the public and embed tour viewers: the public tour
 * query, playable scene list, per-route scene selection, and URL-param
 * viewer settings. Each page keeps its own chrome and side effects.
 */
export function usePublicTourViewer(
  route: 'public' | 'embed',
  id: string | undefined,
  searchParams: URLSearchParams
) {
  const sceneScopeId = useMemo(() => (id ? getViewerSceneScope(route, id) : null), [route, id]);
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

  const tourQuery = useQuery({
    queryKey: [QUERY_KEYS.PUBLIC_TOUR, id],
    // The server counts the view when the tour is fetched (once per viewer per 30 minutes).
    queryFn: () => toursApi.getPublicTour(id!),
    enabled: !!id,
  });
  const tour = tourQuery.data;

  // Only published, non-private tours feed the player.
  const playableTour = tour && isPlayablePublicTour(tour) ? tour : undefined;
  const scenes = playableTour?.scenes;
  const sortedScenes = useMemo(() => (scenes ? sortScenes(scenes) : []), [scenes]);

  const currentScene = useMemo(() => {
    if (!sortedScenes.length) return undefined;
    return sortedScenes.find(scene => scene.id === currentSceneId) || sortedScenes[0];
  }, [currentSceneId, sortedScenes]);

  const startSceneId = searchParams.get('scene');
  const autoplay = parseBooleanParam(searchParams.get('autoplay')) ?? true;
  const navbarParam = parseBooleanParam(searchParams.get('navbar'));
  const fullscreenParam = parseBooleanParam(searchParams.get('fullscreen'));
  const vrParam = parseBooleanParam(searchParams.get('vr'));
  const rotateParam = parseBooleanParam(searchParams.get('rotate'));

  const baseSettings = useMemo(() => {
    if (!tour) return undefined;
    const base = resolveTourSettings(tour.settings);
    let autoRotate = rotateParam ?? base.auto_rotate === true;
    if (!autoplay) autoRotate = false;
    return {
      ...base,
      auto_rotate: autoRotate,
      show_navbar: base.show_navbar && (navbarParam ?? true),
      enable_fullscreen: base.enable_fullscreen && (fullscreenParam ?? true),
      enable_vr: base.enable_vr && (vrParam ?? true),
    };
  }, [autoplay, fullscreenParam, navbarParam, rotateParam, tour, vrParam]);

  /**
   * The scene to show first (URL `scene`, then tour initial scene, then the
   * first scene), and whether the current selection must be replaced by it.
   */
  const resolveInitialScene = useCallback(() => {
    const sceneExists = (sceneId: string | null | undefined) =>
      !!sceneId && sortedScenes.some(scene => scene.id === sceneId);
    const requestedScene = sceneExists(startSceneId) ? startSceneId : undefined;
    const configured = playableTour?.settings?.initial_scene_id;
    const configuredInitialScene = sceneExists(configured) ? configured : undefined;
    const initialScene = requestedScene || configuredInitialScene || sortedScenes[0].id;
    const shouldUseInitialScene =
      (!!requestedScene && currentSceneId !== requestedScene) || !sceneExists(currentSceneId);
    return { initialScene, shouldUseInitialScene };
  }, [currentSceneId, playableTour?.settings?.initial_scene_id, sortedScenes, startSceneId]);

  return {
    tourQuery,
    tour,
    playableTour,
    sortedScenes,
    currentScene,
    currentSceneId,
    setCurrentScene,
    baseSettings,
    resolveInitialScene,
  };
}

/** Toggle document fullscreen; failures (denied, unsupported) are ignored. */
export function toggleDocumentFullscreen() {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen().catch(() => undefined);
    return;
  }
  void document.exitFullscreen().catch(() => undefined);
}
