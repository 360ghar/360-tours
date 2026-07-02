import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Expand, Minimize } from 'lucide-react';
import { PageLoader, Button } from '@/components/ui';
import { toursApi } from '@/api';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import { PanoramaViewer } from '@/components/features/PanoramaViewer';
import { FloorPlanOverlay } from '@/components/features/FloorPlanOverlay';
import { HotspotContentModal } from '@/components/features/HotspotContentModal';
import { getViewerSceneScope, useViewerStore } from '@/stores';
import { usePublicTourTracking } from '@/hooks/usePublicTourTracking';
import { cn, parseBooleanParam } from '@/utils';
import { parseEmbedInboundCommand } from '@/types/embedMessages';
import { parseLinkHotspotContent } from '@/types/hotspotContent';
import type { BrandingSettings, Hotspot } from '@/types';
import type { EmbedOutboundMessage } from '@/types/embedMessages';

function getWatermarkPositionClass(position?: string): string {
  switch (position) {
    case 'bottom-left':
      return 'bottom-2 left-2';
    case 'top-left':
      return 'top-3 left-3';
    case 'top-right':
      return 'top-3 right-12';
    case 'bottom-right':
    default:
      return 'bottom-2 right-2';
  }
}

function openHotspotLink(url: string, target: '_blank' | '_self'): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return false;
    }

    const features = target === '_blank' ? 'noopener,noreferrer' : undefined;
    const openedWindow = window.open(parsed.href, target, features);
    if (target === '_blank' && openedWindow) {
      openedWindow.opener = null;
    }
    return true;
  } catch {
    return false;
  }
}

export function EmbedTourPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const sceneScopeId = useMemo(() => (id ? getViewerSceneScope('embed', id) : null), [id]);
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);
  const [showHotspotModal, setShowHotspotModal] = useState(false);
  const hasPostedReadyRef = useRef(false);

  useEffect(() => {
    return () => {
      if (sceneScopeId) clearCurrentSceneScope(sceneScopeId);
    };
  }, [sceneScopeId, clearCurrentSceneScope]);

  // URL parameter configuration
  const startSceneId = searchParams.get('scene');
  const autoplay = parseBooleanParam(searchParams.get('autoplay')) ?? true;
  const navbarParam = parseBooleanParam(searchParams.get('navbar'));
  const brandingParam = parseBooleanParam(searchParams.get('branding'));
  const minimalChrome = parseBooleanParam(searchParams.get('minimal')) ?? false;
  const autoHideControls = parseBooleanParam(searchParams.get('autohide')) ?? false;
  const fullscreenParam = parseBooleanParam(searchParams.get('fullscreen'));
  const vrParam = parseBooleanParam(searchParams.get('vr'));
  const rotateParam = parseBooleanParam(searchParams.get('rotate'));

  // Use public API endpoints (no authentication required for embeds)
  const {
    data: tour,
    isLoading: isLoadingTour,
    error: tourError,
  } = useQuery({
    queryKey: ['public-tour', id],
    queryFn: () => toursApi.getPublicTour(id!, { track: false }),
    enabled: !!id,
  });

  // Scenes are included in tour response from public API
  const scenes = tour?.scenes;
  const sortedScenes = useMemo(() => {
    if (!scenes) return [];
    return [...scenes].sort((a, b) => a.order_index - b.order_index);
  }, [scenes]);

  // Floor plans: prefer embedded settings, then fall back to the public endpoint.
  const embeddedFloorPlans = tour?.settings?.floor_plans;
  const { data: fetchedFloorPlans } = useQuery({
    queryKey: ['public-tour-floor-plans', id],
    queryFn: () => toursApi.getPublicFloorPlans(id!),
    enabled: !!id && (!embeddedFloorPlans || embeddedFloorPlans.length === 0),
    retry: false,
  });
  const floorPlans = embeddedFloorPlans?.length ? embeddedFloorPlans : (fetchedFloorPlans ?? []);

  const viewerSettings = useMemo(() => {
    if (!tour) return undefined;

    const base = tour.settings ?? DEFAULT_TOUR_SETTINGS;
    const showNavbar = navbarParam ?? true;
    const showBranding = brandingParam ?? true;
    const enableFullscreen = fullscreenParam ?? true;
    const enableVR = vrParam ?? true;
    const baseBranding = {
      ...DEFAULT_TOUR_SETTINGS.branding,
      ...(base.branding ?? {}),
    } as BrandingSettings;

    let autoRotate = base.auto_rotate === true;
    if (rotateParam !== undefined) {
      autoRotate = rotateParam;
    }
    if (!autoplay) {
      autoRotate = false;
    }

    return {
      ...base,
      auto_rotate: autoRotate,
      show_navbar: (base.show_navbar ?? true) && showNavbar,
      enable_fullscreen: (base.enable_fullscreen ?? true) && enableFullscreen,
      enable_vr: (base.enable_vr ?? true) && enableVR,
      branding: {
        ...baseBranding,
        show_watermark: (baseBranding.show_watermark ?? true) && showBranding,
      },
    };
  }, [autoplay, brandingParam, fullscreenParam, navbarParam, rotateParam, tour, vrParam]);

  const showNavbar = viewerSettings?.show_navbar !== false;
  const showBrandingAssets = brandingParam !== false;
  const showWatermark = viewerSettings?.branding?.show_watermark !== false;
  const fullscreenEnabled = viewerSettings?.enable_fullscreen !== false;
  const currentScene = useMemo(() => {
    if (!sortedScenes.length) return undefined;
    return sortedScenes.find(scene => scene.id === currentSceneId) || sortedScenes[0];
  }, [currentSceneId, sortedScenes]);
  const currentIndex = useMemo(() => {
    if (!currentScene) return -1;
    return sortedScenes.findIndex(scene => scene.id === currentScene.id);
  }, [currentScene, sortedScenes]);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenEnabled) return;

    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
      return;
    }

    void document.exitFullscreen().catch(() => undefined);
  }, [fullscreenEnabled]);

  // Send message to parent window
  // Use window.parent.origin instead of a URL parameter to prevent origin spoofing.
  // Falls back to '*' only when the parent origin is inaccessible (e.g., cross-origin iframe).
  const postMessage = useCallback((message: EmbedOutboundMessage) => {
    if (window.parent !== window) {
      try {
        window.parent.postMessage(message, window.parent.origin);
      } catch {
        // Cross-origin: fall back to wildcard (parent can still filter by origin)
        window.parent.postMessage(message, '*');
      }
    }
  }, []);

  // Analytics tracking (tour_view, session_start/duration, scene_view)
  const { trackEvent } = usePublicTourTracking({
    tourId: id,
    tourLoaded: !!tour,
    currentSceneId: currentScene?.id,
  });

  // Handle hotspot clicks for non-navigation types
  const handleHotspotClick = useCallback(
    (hotspot: Hotspot) => {
      // Track hotspot click
      trackEvent('hotspot_click', currentScene?.id, hotspot.id);

      // Navigation is handled inside PanoramaViewer
      if (hotspot.type === 'navigation') return;

      // Notify parent of hotspot click
      postMessage({
        type: 'hotspotClick',
        tourId: id!,
        data: {
          hotspotId: hotspot.id,
          hotspotType: hotspot.type,
          hotspotTitle: hotspot.title,
        },
      });

      // For link hotspots, open directly without modal if URL exists
      if (hotspot.type === 'link') {
        const content = parseLinkHotspotContent(hotspot.content);
        const url = content?.url || content?.link_url;
        const target = content?.target ?? (content?.link_new_tab === false ? '_self' : '_blank');
        if (url && openHotspotLink(url, target)) {
          return;
        }
      }

      // For all other types, show the modal
      setActiveHotspot(hotspot);
      setShowHotspotModal(true);
    },
    [id, postMessage, trackEvent, currentScene?.id]
  );

  useEffect(() => {
    hasPostedReadyRef.current = false;
  }, [id]);

  // Set initial scene and notify parent
  useEffect(() => {
    if (tour && sortedScenes.length) {
      const sceneExists = (sceneId: string | null | undefined) =>
        !!sceneId && sortedScenes.some(scene => scene.id === sceneId);
      const requestedScene = sceneExists(startSceneId) ? startSceneId : undefined;
      const configuredInitialScene = sceneExists(tour.settings?.initial_scene_id)
        ? tour.settings?.initial_scene_id
        : undefined;
      const initialScene = requestedScene || configuredInitialScene || sortedScenes[0].id;
      const shouldUseInitialScene =
        (requestedScene && currentSceneId !== requestedScene) || !sceneExists(currentSceneId);

      if (shouldUseInitialScene) {
        setCurrentScene(initialScene);
      }

      // Notify parent that embed is ready
      if (!hasPostedReadyRef.current) {
        hasPostedReadyRef.current = true;
        postMessage({
          type: 'ready',
          tourId: id!,
          tour_id: id!,
          data: {
            title: tour.title,
            sceneCount: sortedScenes.length,
            scene_count: sortedScenes.length,
            currentSceneId: initialScene,
            current_scene_id: initialScene,
          },
        });
      }
    }
  }, [tour, sortedScenes, startSceneId, setCurrentScene, currentSceneId, id, postMessage]);

  // Notify parent on scene change (scene_view analytics handled by usePublicTourTracking)
  useEffect(() => {
    if (currentScene?.id) {
      postMessage({
        type: 'sceneChange',
        tourId: id!,
        tour_id: id!,
        data: {
          sceneId: currentScene.id,
          scene_id: currentScene.id,
          sceneTitle: currentScene.title,
          scene_title: currentScene.title,
          sceneIndex: currentIndex,
          scene_index: currentIndex,
        },
      });
    }
  }, [currentIndex, currentScene, id, postMessage]);

  // Listen for messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our parent window. This prevents arbitrary
      // third-party sites/iframes from driving scene navigation or fullscreen.
      // event.source is the originating window; for a top-level embed it equals
      // window.parent, and for same-origin it equals window.
      if (event.source !== window.parent && event.source !== window) return;
      const command = parseEmbedInboundCommand(event.data);
      if (!command) return;

      switch (command.type) {
        case 'goToScene':
          if (sortedScenes.some(scene => scene.id === command.sceneId)) {
            setCurrentScene(command.sceneId);
          }
          break;
        case 'nextScene':
          if (currentScene?.id) {
            if (currentIndex < sortedScenes.length - 1) {
              setCurrentScene(sortedScenes[currentIndex + 1].id);
            }
          }
          break;
        case 'previousScene':
          if (currentScene?.id) {
            if (currentIndex > 0) {
              setCurrentScene(sortedScenes[currentIndex - 1].id);
            }
          }
          break;
        case 'toggleFullscreen':
          if (fullscreenEnabled) {
            toggleFullscreen();
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [
    currentIndex,
    currentScene,
    fullscreenEnabled,
    setCurrentScene,
    sortedScenes,
    toggleFullscreen,
  ]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = !!document.fullscreenElement;
      setIsFullscreen(fullscreen);
      if (fullscreenEnabled) {
        trackEvent(fullscreen ? 'fullscreen_enter' : 'fullscreen_exit', undefined, undefined, {
          is_fullscreen: fullscreen,
        });
      }
      postMessage({
        type: 'fullscreenChange',
        tourId: id!,
        tour_id: id!,
        data: { isFullscreen: fullscreen, is_fullscreen: fullscreen },
      });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fullscreenEnabled, id, postMessage, trackEvent]);

  // Auto-hide controls on inactivity
  useEffect(() => {
    if (!autoHideControls) return;

    let timeout: ReturnType<typeof setTimeout>;

    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    const handleMouseLeave = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 1000);
    };

    // Reuse the same show+reset logic for touch devices so a tap anywhere
    // brings the controls back (and re-arms the auto-hide timer).
    const handleTouchStart = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('touchstart', handleTouchStart);

    // Initial hide after 3 seconds
    timeout = setTimeout(() => setShowControls(false), 3000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('touchstart', handleTouchStart);
      clearTimeout(timeout);
    };
  }, [autoHideControls]);

  // Handle errors
  useEffect(() => {
    if (tourError) {
      postMessage({
        type: 'error',
        tourId: id!,
        data: { message: (tourError as Error).message || 'Failed to load tour' },
      });
    }
  }, [tourError, id, postMessage]);

  if (isLoadingTour) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <PageLoader message="Loading tour..." />
      </div>
    );
  }

  if (tourError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-black">
        <p className="text-white">Failed to load tour</p>
        <p className="mt-1 text-sm text-white/50">Please check the link or try again later.</p>
      </div>
    );
  }

  if (!tour || !scenes || scenes.length === 0 || !currentScene) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <p className="text-white">Tour not available</p>
      </div>
    );
  }

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < sortedScenes.length - 1;

  // Get branding from tour settings
  const branding = viewerSettings?.branding;
  const primaryColor = branding?.primary_color || '#FF5733';

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black"
      style={{ fontFamily: viewerSettings?.branding?.font_family }}
    >
      {/* Viewer */}
      <PanoramaViewer
        scene={currentScene}
        hotspots={currentScene.hotspots || []}
        tourSettings={viewerSettings}
        onSceneChange={sceneId => setCurrentScene(sceneId)}
        onHotspotClick={handleHotspotClick}
        onVrModeChange={enabled =>
          trackEvent(enabled ? 'vr_enter' : 'vr_exit', undefined, undefined, { mode: 'stereo' })
        }
        onGyroscopeChange={enabled =>
          trackEvent(enabled ? 'vr_enter' : 'vr_exit', undefined, undefined, { mode: 'gyroscope' })
        }
      />

      {/* Tour logo */}
      {!minimalChrome && showBrandingAssets && branding?.logo_url && (
        <img
          src={branding.logo_url}
          alt={`${tour.title} logo`}
          className={cn(
            'absolute left-3 top-3 z-10 h-8 max-w-[120px] object-contain transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}

      {/* Floor Plan Overlay */}
      {!minimalChrome && floorPlans.length > 0 && (
        <FloorPlanOverlay
          floorPlans={floorPlans}
          currentSceneId={currentScene.id}
          scenes={sortedScenes}
          onSceneChange={sceneId => setCurrentScene(sceneId)}
          position="bottom-left"
          className={cn(
            'transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}

      {/* Navigation Controls (if not minimal chrome and navbar enabled) */}
      {!minimalChrome && showNavbar && sortedScenes.length > 1 && (
        <div
          className={cn(
            'absolute left-0 right-0 bottom-0 z-10 transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          {/* Scene thumbnails */}
          <div className="bg-gradient-to-t from-black/80 to-transparent p-3">
            <div className="flex items-center justify-center gap-2">
              {/* Previous button */}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-white hover:bg-white/20 disabled:opacity-30"
                onClick={() => hasPrevious && setCurrentScene(sortedScenes[currentIndex - 1].id)}
                disabled={!hasPrevious}
                aria-label="Previous scene"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              {/* Thumbnail strip */}
              <div className="flex gap-1.5 overflow-x-auto max-w-[70vw] py-1">
                {sortedScenes.map((scene, index) => (
                  <button
                    key={scene.id}
                    onClick={() => setCurrentScene(scene.id)}
                    aria-label={`Open ${scene.title || `scene ${index + 1}`}`}
                    aria-current={currentScene?.id === scene.id}
                    className={cn(
                      'shrink-0 overflow-hidden rounded transition-all',
                      currentScene?.id === scene.id
                        ? 'ring-2 ring-offset-1 ring-offset-black'
                        : 'opacity-60 hover:opacity-100'
                    )}
                    style={{
                      ['--tw-ring-color' as string]:
                        currentScene?.id === scene.id ? primaryColor : undefined,
                    }}
                    title={scene.title || `Scene ${index + 1}`}
                  >
                    <img
                      src={scene.thumbnail_url || scene.image_url}
                      alt={scene.title || `Scene ${index + 1}`}
                      loading="lazy"
                      className="h-10 w-16 object-cover"
                    />
                  </button>
                ))}
              </div>

              {/* Next button */}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-white hover:bg-white/20 disabled:opacity-30"
                onClick={() => hasNext && setCurrentScene(sortedScenes[currentIndex + 1].id)}
                disabled={!hasNext}
                aria-label="Next scene"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Scene counter */}
            <div className="mt-1.5 text-center text-xs text-white/70">
              {currentIndex + 1} / {sortedScenes.length}
            </div>
          </div>
        </div>
      )}

      {/* Minimal navigation arrows (for minimal chrome mode) */}
      {minimalChrome && sortedScenes.length > 1 && (
        <>
          {hasPrevious && (
            <button
              onClick={() => setCurrentScene(sortedScenes[currentIndex - 1].id)}
              aria-label="Previous scene"
              className={cn(
                'absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-opacity duration-300',
                showControls ? 'opacity-100' : 'opacity-0'
              )}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => setCurrentScene(sortedScenes[currentIndex + 1].id)}
              aria-label="Next scene"
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-opacity duration-300',
                showControls ? 'opacity-100' : 'opacity-0'
              )}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </>
      )}

      {/* Compact scene counter for minimal mode */}
      {minimalChrome && sortedScenes.length > 1 && (
        <div
          className={cn(
            'absolute bottom-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80 transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          {currentIndex + 1} / {sortedScenes.length}
        </div>
      )}

      {/* Fullscreen button */}
      {!minimalChrome && fullscreenEnabled && (
        <button
          onClick={toggleFullscreen}
          className={cn(
            'absolute top-3 right-3 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      )}

      {/* Branding/Watermark */}
      {showWatermark && (
        <div
          className={cn(
            'absolute z-10 transition-opacity duration-300',
            getWatermarkPositionClass(branding?.watermark_position),
            showControls ? 'opacity-100' : 'opacity-50'
          )}
        >
          <span className="text-xs text-white/50">Powered by 360 Viewer</span>
        </div>
      )}

      {/* Hotspot Content Modal */}
      <HotspotContentModal
        hotspot={activeHotspot}
        open={showHotspotModal}
        onOpenChange={setShowHotspotModal}
      />
    </div>
  );
}
