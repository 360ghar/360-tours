import { useEffect, useRef, useState, useCallback } from 'react';
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin, events as MarkersEvents, type MarkerConfig } from '@photo-sphere-viewer/markers-plugin';
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin';
import { StereoPlugin } from '@photo-sphere-viewer/stereo-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import type { Scene, Hotspot, TourSettings } from '@/types';
import { VIEWER_DEFAULTS } from '@/constants';
import { cn, viewerPositionToDegrees, degreesToViewerPosition } from '@/utils';
import { Smartphone, Glasses, X } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';
import { useLocalStorage } from '@/hooks';

interface PanoramaViewerProps {
  scene: Scene;
  hotspots: Hotspot[];
  isEditor?: boolean;
  tourSettings?: TourSettings;
  onHotspotClick?: (hotspot: Hotspot) => void;
  onHotspotSelect?: (hotspotId: string) => void;
  onPositionClick?: (position: { yaw: number; pitch: number }) => void;
  onHotspotDrag?: (hotspotId: string, position: { yaw: number; pitch: number }) => void;
  onSceneChange?: (sceneId: string) => void;
  onVrModeChange?: (enabled: boolean) => void;
  onGyroscopeChange?: (enabled: boolean) => void;
  showControls?: boolean;
  className?: string;
}

interface VRSupport {
  gyroscope: boolean;
  stereo: boolean;
  webxr: boolean;
}

export function PanoramaViewer({
  scene,
  hotspots,
  isEditor = false,
  tourSettings,
  onHotspotClick,
  onHotspotSelect,
  onPositionClick,
  onHotspotDrag,
  onSceneChange,
  onVrModeChange,
  onGyroscopeChange,
  showControls = true,
  className,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  // Tracks the panorama URL currently loaded into the viewer. The Viewer
  // constructor already loads the initial panorama, so the scene-change effect
  // must NOT re-issue setPanorama for that same URL on mount — doing so races the
  // constructor's load and leaves Photo Sphere Viewer stuck on its loader.
  const loadedPanoramaUrlRef = useRef<string | null>(null);
  // Serialized panorama loading (see processSceneQueue): the latest desired scene,
  // whether a load is currently running, and a stable self-ref for re-invocation.
  const latestSceneRef = useRef(scene);
  const inFlightRef = useRef(false);
  const processQueueRef = useRef<(force?: boolean) => void>(() => {});
  const markersPluginRef = useRef<MarkersPlugin | null>(null);
  const gyroscopePluginRef = useRef<GyroscopePlugin | null>(null);
  const stereoPluginRef = useRef<StereoPlugin | null>(null);

  const [vrSupport, setVrSupport] = useState<VRSupport>({
    gyroscope: false,
    stereo: false,
    webxr: false,
  });
  const [gyroscopeEnabled, setGyroscopeEnabled] = useState(false);
  const [stereoEnabled, setStereoEnabled] = useState(false);
  const [vrError, setVrError] = useState<string | null>(null);
  const [isPanoramaLoading, setIsPanoramaLoading] = useState(true);
  // Photo Sphere Viewer discards markers added before the panorama texture has
  // loaded. We therefore only (re)apply markers once the viewer is ready, and
  // flip this back to false whenever a new panorama starts loading so markers are
  // re-applied for the new scene. Without this, markers vanish on load unless the
  // parent happens to re-render (which re-runs the markers effect) by luck.
  const [isViewerReady, setIsViewerReady] = useState(false);
  // Set when a panorama fails to load so we can show a friendly retry UI instead
  // of leaving the raw Photo Sphere Viewer "cannot be loaded" message.
  const [panoramaError, setPanoramaError] = useState(false);

  // Persisted VR intent flags (separate from the live enabled state) so that
  // user preferences survive scene/tour reloads. iOS still requires a gesture
  // for gyroscope, so persistence only auto-starts where the permission gate
  // is not required.
  const [persistedGyro, setPersistedGyro] = useLocalStorage<boolean>('360g:vr:gyroscope', false);
  const [, setPersistedStereo] = useLocalStorage<boolean>('360g:vr:stereo', false);



  // Keep the latest onPositionClick in a ref so changing the callback prop
  // doesn't force a full viewer destroy/rebuild (black flash, lost camera position).
  const onPositionClickRef = useRef(onPositionClick);
  useEffect(() => {
    onPositionClickRef.current = onPositionClick;
  });

  // Track the latest scene so the serialized loader always resolves to the most
  // recently requested room when an in-flight load settles.
  useEffect(() => {
    latestSceneRef.current = scene;
  });

  const autoRotateFrameRef = useRef<number | null>(null);
  const autoRotateLastTimeRef = useRef<number | null>(null);
  const autoRotateIdleTimeoutRef = useRef<number | null>(null);

  const stopAutoRotate = useCallback(() => {
    if (autoRotateIdleTimeoutRef.current != null) {
      window.clearTimeout(autoRotateIdleTimeoutRef.current);
      autoRotateIdleTimeoutRef.current = null;
    }

    if (autoRotateFrameRef.current != null) {
      cancelAnimationFrame(autoRotateFrameRef.current);
      autoRotateFrameRef.current = null;
    }

    autoRotateLastTimeRef.current = null;
  }, []);

  const startAutoRotate = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (autoRotateFrameRef.current != null) return;

    const speedMultiplier = tourSettings?.auto_rotate_speed ?? 1;
    const baseRadPerSecond = 0.02;
    const speedRadPerSecond = baseRadPerSecond * speedMultiplier;

    const step = (timestamp: number) => {
      const currentViewer = viewerRef.current;
      if (!currentViewer) return;

      if (autoRotateLastTimeRef.current == null) {
        autoRotateLastTimeRef.current = timestamp;
      }

      const dtSeconds = (timestamp - autoRotateLastTimeRef.current) / 1000;
      autoRotateLastTimeRef.current = timestamp;

      const position = currentViewer.getPosition();
      currentViewer.rotate({ yaw: position.yaw + speedRadPerSecond * dtSeconds, pitch: position.pitch });

      autoRotateFrameRef.current = requestAnimationFrame(step);
    };

    autoRotateFrameRef.current = requestAnimationFrame(step);
  }, [tourSettings?.auto_rotate_speed]);

  const scheduleAutoRotate = useCallback(() => {
    if (isEditor) return;
    if (tourSettings?.auto_rotate !== true) return;
    if (gyroscopeEnabled || stereoEnabled) return;

    stopAutoRotate();
    autoRotateIdleTimeoutRef.current = window.setTimeout(() => {
      startAutoRotate();
    }, VIEWER_DEFAULTS.autorotateDelay);
  }, [gyroscopeEnabled, isEditor, startAutoRotate, stereoEnabled, stopAutoRotate, tourSettings?.auto_rotate]);

  // Check VR capabilities
  useEffect(() => {
    const checkVrSupport = async () => {
      const support: VRSupport = {
        gyroscope: false,
        stereo: false,
        webxr: false,
      };

      // Check for device orientation (gyroscope)
      if (window.DeviceOrientationEvent) {
        // On iOS 13+, we need to request permission
        if (
          typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
            .requestPermission === 'function'
        ) {
          // Permission will be requested when user clicks the button
          support.gyroscope = true;
        } else {
          // Non-iOS or older iOS
          support.gyroscope = true;
        }
      }

      // Check for WebXR support
      if ('xr' in navigator) {
        try {
          support.webxr = await (navigator as Navigator & { xr: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr.isSessionSupported('immersive-vr');
        } catch {
          support.webxr = false;
        }
      }

      // Stereo mode is available on all devices (cardboard-style)
      support.stereo = true;

      setVrSupport(support);
    };

    checkVrSupport();
  }, []);

  // Initialize viewer
  useEffect(() => {
    if (!containerRef.current) return;

    // Build navbar items based on settings
    const navbarItems: string[] = [];
    if (!isEditor) {
      if (tourSettings?.show_navbar !== false) {
        navbarItems.push('zoom');
        if (tourSettings?.enable_fullscreen !== false) {
          navbarItems.push('fullscreen');
        }
      }
    }

    // Build plugins array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins: any[] = [
      [MarkersPlugin, { markers: [] }],
    ];

    // Add gyroscope plugin if VR is enabled
    if (tourSettings?.enable_vr !== false && tourSettings?.enable_gyroscope !== false) {
      plugins.push([GyroscopePlugin, {
        touchmove: true,
        absolutePosition: false,
        moveMode: 'smooth',
      }]);
    }

    // Add stereo plugin if VR is enabled
    if (tourSettings?.enable_vr !== false) {
      plugins.push([StereoPlugin, {}]);
    }

    const initialView = scene.metadata?.initial_view ?? tourSettings?.initial_view;

    const viewer = new Viewer({
      container: containerRef.current,
      panorama: scene.image_url,
      defaultPitch: initialView?.pitch ?? VIEWER_DEFAULTS.defaultPitch,
      defaultYaw: initialView?.yaw ?? VIEWER_DEFAULTS.defaultYaw,
      defaultZoomLvl:
        typeof initialView === 'object' && 'zoom' in initialView && typeof initialView.zoom === 'number'
          ? initialView.zoom
          : VIEWER_DEFAULTS.defaultZoom,
      minFov: scene.metadata?.camera?.min_fov ?? VIEWER_DEFAULTS.minFov,
      maxFov: scene.metadata?.camera?.max_fov ?? VIEWER_DEFAULTS.maxFov,
      navbar: isEditor ? false : navbarItems.length > 0 ? navbarItems : false,
      plugins,
    });

    viewerRef.current = viewer;
    // The constructor loads this panorama; record it so the scene-change effect
    // skips a redundant (and race-inducing) setPanorama for the same URL, and mark
    // the load in-flight so early scene switches are queued (not aborted) until
    // 'ready' fires.
    loadedPanoramaUrlRef.current = scene.image_url;
    inFlightRef.current = true;
    // The Viewer constructor types every plugin as `AbstractPlugin<any>`, so the
    // specific plugin references need narrowing back to their concrete types.
    markersPluginRef.current = viewer.getPlugin(MarkersPlugin) as MarkersPlugin;

    // Hide the loading spinner once the viewer finishes its first render, and
    // mark the viewer ready so markers can be applied (PSV drops markers added
    // before this point).
    viewer.addEventListener('ready', () => {
      inFlightRef.current = false;
      setIsPanoramaLoading(false);
      setIsViewerReady(true);
      // If the user navigated away from the initial scene while it was loading,
      // load the latest one now.
      if (latestSceneRef.current?.image_url !== loadedPanoramaUrlRef.current) {
        processQueueRef.current(false);
      }
    });

    // Get VR plugins if available
    if (tourSettings?.enable_vr !== false) {
      try {
        gyroscopePluginRef.current = viewer.getPlugin(GyroscopePlugin) as GyroscopePlugin;
        stereoPluginRef.current = viewer.getPlugin(StereoPlugin) as StereoPlugin;
      } catch {
        // Plugins not available
      }
    }

    if (
      !isEditor &&
      tourSettings?.enable_vr !== false &&
      tourSettings?.enable_gyroscope !== false &&
      (tourSettings?.gyroscope_auto_start === true || persistedGyro) &&
      gyroscopePluginRef.current &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission !== 'function'
    ) {
      gyroscopePluginRef.current.start().then(
        () => setGyroscopeEnabled(true),
        () => undefined
      );
    }

    // Handle click for adding hotspots in editor mode
    if (isEditor) {
      viewer.addEventListener('click', (e) => {
        const data = e.data as { yaw?: number; pitch?: number };
        // Accept both right-click and regular click for hotspot placement
        if (data?.yaw !== undefined && data?.pitch !== undefined) {
          // Convert from radians (viewer) to degrees (API)
          const position = viewerPositionToDegrees({
            yaw: data.yaw,
            pitch: data.pitch,
          });
          onPositionClickRef.current?.(position);
        }
      });
    }

    return () => {
      stopAutoRotate();
      // Cleanup VR states
      setGyroscopeEnabled(false);
      setStereoEnabled(false);
      viewer.destroy();
      viewerRef.current = null;
      loadedPanoramaUrlRef.current = null;
      markersPluginRef.current = null;
      gyroscopePluginRef.current = null;
      stereoPluginRef.current = null;
    };
    // IMPORTANT: scene-specific values (scene.id / image_url / metadata) are
    // intentionally NOT dependencies. The viewer is created ONCE and persists for
    // the component's lifetime; scene changes are handled by the scene-change
    // effect below via viewer.setPanorama() (PSV's cache-safe transition). Rebuilding
    // the viewer on every scene change destroys it mid-load, which aborts the
    // in-flight texture fetch and poisons three.js's cache for that URL — the cause
    // of intermittent "The panorama cannot be loaded" errors. We only rebuild for
    // structural changes (editor mode, tour settings, gyro preference).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditor, stopAutoRotate, tourSettings, persistedGyro]);

  // Swap to the latest desired scene via setPanorama — SERIALIZED. Only one
  // setPanorama runs at a time; new requests during a load are coalesced (latest
  // wins) and applied when the current load settles. This is deliberate: calling
  // setPanorama while another is in flight makes PSV abort the in-flight image
  // fetch, which surfaces as an unhandled "Failed to fetch" rejection (→ a global
  // error toast). Serializing avoids aborts entirely. `force` cache-busts the URL
  // for the Retry button.
  const processSceneQueue = useCallback(
    (force = false) => {
      const viewer = viewerRef.current;
      if (!viewer || inFlightRef.current) return; // re-checked when the current load settles
      const target = latestSceneRef.current;
      if (!target?.image_url) return;
      if (!force && loadedPanoramaUrlRef.current === target.image_url) return;

      const targetUrl = target.image_url;
      inFlightRef.current = true;
      setIsPanoramaLoading(true);
      // Markers are dropped during a swap; mark not-ready so they re-apply on resolve.
      setIsViewerReady(false);
      setPanoramaError(false);
      scheduleAutoRotate();

      // Apply per-scene field-of-view constraints (the viewer persists across scenes).
      const camera = target.metadata?.camera;
      if (typeof camera?.min_fov === 'number') viewer.setOption('minFov', camera.min_fov);
      if (typeof camera?.max_fov === 'number') viewer.setOption('maxFov', camera.max_fov);

      const initialView = target.metadata?.initial_view ?? tourSettings?.initial_view;
      const url = force
        ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}reload=${Date.now()}`
        : targetUrl;

      const settle = (ok: boolean) => {
        inFlightRef.current = false;
        setIsPanoramaLoading(false);
        if (ok) {
          loadedPanoramaUrlRef.current = targetUrl;
          setIsViewerReady(true);
          setPanoramaError(false);
          // A newer scene was requested mid-load — load it now.
          if (latestSceneRef.current?.image_url !== targetUrl) processQueueRef.current(false);
        } else {
          setPanoramaError(true);
        }
      };

      viewer
        .setPanorama(url, {
          transition: true,
          // The app renders its own branded loading overlay; suppress PSV's.
          showLoader: false,
          position: { pitch: initialView?.pitch ?? 0, yaw: initialView?.yaw ?? 0 },
          zoom:
            typeof initialView === 'object' && 'zoom' in initialView && typeof initialView.zoom === 'number'
              ? initialView.zoom
              : VIEWER_DEFAULTS.defaultZoom,
        })
        .then(() => settle(true))
        .catch(() => settle(false));
    },
    [scheduleAutoRotate, tourSettings?.initial_view]
  );

  // Keep a stable ref to the latest processSceneQueue so the settle() callback can
  // re-invoke it without stale closures.
  useEffect(() => {
    processQueueRef.current = processSceneQueue;
  }, [processSceneQueue]);

  // Swap panorama when the scene changes (no-op while a load is in flight; the
  // in-flight load picks up the latest scene when it settles).
  useEffect(() => {
    if (viewerRef.current && scene.image_url) {
      processSceneQueue();
    }
  }, [scene.image_url, processSceneQueue]);

  // Update markers when hotspots change. Gated on isViewerReady because PSV
  // discards markers added before the panorama has loaded.
  useEffect(() => {
    if (!markersPluginRef.current || !isViewerReady) return;

    // Clear existing markers
    markersPluginRef.current.clearMarkers();

    // Add new markers
    hotspots.forEach((hotspot) => {
      if (!hotspot.is_active) return;

      const markerConfig: MarkerConfig & { draggable?: boolean } = {
        id: hotspot.id,
        // Convert from degrees (API) to radians (viewer)
        position: degreesToViewerPosition({
          yaw: hotspot.position.yaw,
          pitch: hotspot.position.pitch,
        }),
        // Navigation pucks carry their own room-name label, so suppress the PSV
        // tooltip for them to avoid a duplicate; keep it for info/media markers.
        tooltip: hotspot.type === 'navigation' ? undefined : hotspot.title || undefined,
        data: hotspot,
        // Enable dragging in editor mode
        draggable: isEditor,
      };

      // Set marker appearance based on type
      switch (hotspot.type) {
        case 'navigation': {
          const label = (hotspot.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
          markerConfig.html = `
            <div class="psv-nav-marker" role="button" tabindex="0" aria-label="${label || 'Go to room'}" data-marker-id="${hotspot.id}">
              <span class="psv-nav-pulse" aria-hidden="true"></span>
              <span class="psv-nav-core" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </span>
              ${label ? `<span class="psv-nav-label">${label}</span>` : ''}
            </div>
          `;
          break;
        }
        case 'info':
          markerConfig.html = `
            <div class="psv-marker-info" role="button" tabindex="0" aria-label="${hotspot.title || 'Hotspot'}" data-marker-id="${hotspot.id}" style="
              width: ${hotspot.icon_size || 32}px;
              height: ${hotspot.icon_size || 32}px;
              background-color: ${hotspot.icon_color || '#10b981'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              transition: transform 0.2s;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
            </div>
          `;
          break;
        case 'audio':
          markerConfig.html = `
            <div class="psv-marker-audio" role="button" tabindex="0" aria-label="${hotspot.title || 'Hotspot'}" data-marker-id="${hotspot.id}" style="
              width: ${hotspot.icon_size || 32}px;
              height: ${hotspot.icon_size || 32}px;
              background-color: ${hotspot.icon_color || '#FF5733'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              transition: transform 0.2s;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </div>
          `;
          break;
        case 'video':
          markerConfig.html = `
            <div class="psv-marker-video" role="button" tabindex="0" aria-label="${hotspot.title || 'Hotspot'}" data-marker-id="${hotspot.id}" style="
              width: ${hotspot.icon_size || 32}px;
              height: ${hotspot.icon_size || 32}px;
              background-color: ${hotspot.icon_color || '#ef4444'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              transition: transform 0.2s;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          `;
          break;
        case 'link':
          markerConfig.html = `
            <div class="psv-marker-link" role="button" tabindex="0" aria-label="${hotspot.title || 'Hotspot'}" data-marker-id="${hotspot.id}" style="
              width: ${hotspot.icon_size || 32}px;
              height: ${hotspot.icon_size || 32}px;
              background-color: ${hotspot.icon_color || '#FF5733'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              transition: transform 0.2s;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
          `;
          break;
        default:
          markerConfig.html = `
            <div class="psv-marker-default" role="button" tabindex="0" aria-label="${hotspot.title || 'Hotspot'}" data-marker-id="${hotspot.id}" style="
              width: ${hotspot.icon_size || 32}px;
              height: ${hotspot.icon_size || 32}px;
              background-color: ${hotspot.icon_color || '#f59e0b'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              transition: transform 0.2s;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
          `;
      }

      markersPluginRef.current?.addMarker(markerConfig);
    });

    // Handle marker clicks
    const handleMarkerSelect = (e: { type: string; marker?: { data?: unknown } }) => {
      const hotspot = e.marker?.data as Hotspot;
      if (!hotspot) return;

      if (isEditor) {
        onHotspotSelect?.(hotspot.id);
      } else if (hotspot.type === 'navigation' && hotspot.target_scene_id) {
        onSceneChange?.(hotspot.target_scene_id);
      }

      onHotspotClick?.(hotspot);
    };

    // Handle marker drag (editor mode only)
    const handleMarkerDropped = (e: { type: string; marker?: { data?: unknown; position?: { yaw: number; pitch: number } } }) => {
      const hotspot = e.marker?.data as Hotspot;
      if (!hotspot || !onHotspotDrag) return;
      if (!e.marker?.position) return;

      // Convert from radians (viewer) to degrees (API)
      const newPosition = viewerPositionToDegrees({
        yaw: e.marker.position.yaw,
        pitch: e.marker.position.pitch,
      });

      onHotspotDrag(hotspot.id, newPosition);
    };

    markersPluginRef.current.addEventListener('select-marker', handleMarkerSelect);

    // Add drag listener in editor mode
    if (isEditor && onHotspotDrag) {
      // 'marker-dropped' is not part of the v5 markers-plugin event union, but
      // the plugin still emits it for draggable markers; cast to the event type.
      markersPluginRef.current.addEventListener(
        'marker-dropped' as MarkersEvents.MarkersPluginEvents['type'],
        handleMarkerDropped,
      );
    }

    // Delegated keyboard handler so accessible markers (role="button",
    // tabindex="0") can be activated with Enter/Space.
    const container = containerRef.current;
    const onMarkerKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target as HTMLElement | null;
      const markerEl = target?.closest('[data-marker-id]') as HTMLElement | null;
      if (!markerEl) return;
      e.preventDefault();
      const markerId = markerEl.getAttribute('data-marker-id');
      const hotspot = hotspots.find((h) => h.id === markerId);
      if (!hotspot) return;
      if (isEditor) onHotspotSelect?.(hotspot.id);
      else if (hotspot.type === 'navigation' && hotspot.target_scene_id) onSceneChange?.(hotspot.target_scene_id);
      onHotspotClick?.(hotspot);
    };
    container?.addEventListener('keydown', onMarkerKey);

    return () => {
      markersPluginRef.current?.removeEventListener('select-marker', handleMarkerSelect);
      if (isEditor && onHotspotDrag) {
        markersPluginRef.current?.removeEventListener(
          'marker-dropped' as MarkersEvents.MarkersPluginEvents['type'],
          handleMarkerDropped,
        );
      }
      container?.removeEventListener('keydown', onMarkerKey);
    };
  }, [hotspots, isViewerReady, isEditor, onHotspotSelect, onHotspotClick, onSceneChange, onHotspotDrag]);

  useEffect(() => {
    if (!containerRef.current) return;

    const element = containerRef.current;

    const handleUserInteraction = () => {
      scheduleAutoRotate();
    };

    element.addEventListener('pointerdown', handleUserInteraction);
    element.addEventListener('wheel', handleUserInteraction, { passive: true });
    element.addEventListener('touchstart', handleUserInteraction, { passive: true });

    return () => {
      element.removeEventListener('pointerdown', handleUserInteraction);
      element.removeEventListener('wheel', handleUserInteraction);
      element.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [scheduleAutoRotate]);

  useEffect(() => {
    if (isEditor) return;

    if (tourSettings?.auto_rotate === true && !gyroscopeEnabled && !stereoEnabled) {
      scheduleAutoRotate();
      return;
    }

    stopAutoRotate();
  }, [gyroscopeEnabled, isEditor, scheduleAutoRotate, stereoEnabled, stopAutoRotate, tourSettings?.auto_rotate]);

  // Toggle gyroscope
  const toggleGyroscope = useCallback(async () => {
    if (!gyroscopePluginRef.current) {
      setVrError('Gyroscope not available');
      return;
    }

    try {
      if (gyroscopeEnabled) {
        gyroscopePluginRef.current.stop();
        setGyroscopeEnabled(false);
        setPersistedGyro(false);
        onGyroscopeChange?.(false);
      } else {
        stopAutoRotate();
        // Request permission on iOS 13+
        if (
          typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
            .requestPermission === 'function'
        ) {
          const permission = await (
            DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
          ).requestPermission();
          if (permission !== 'granted') {
            setVrError('Gyroscope permission denied');
            return;
          }
        }

        await gyroscopePluginRef.current.start();
        setGyroscopeEnabled(true);
        setPersistedGyro(true);
        onGyroscopeChange?.(true);
        setVrError(null);
      }
    } catch (error) {
      console.error('Gyroscope error:', error);
      setVrError('Failed to enable gyroscope');
    }
  }, [gyroscopeEnabled, onGyroscopeChange, setPersistedGyro, stopAutoRotate]);

  // Toggle stereo (VR) mode
  const toggleStereo = useCallback(async () => {
    if (!stereoPluginRef.current) {
      setVrError('VR mode not available');
      return;
    }

    try {
      if (stereoEnabled) {
        stereoPluginRef.current.stop();
        setStereoEnabled(false);
        setPersistedStereo(false);
        onVrModeChange?.(false);
      } else {
        stopAutoRotate();
        // Enter fullscreen for better VR experience
        if (containerRef.current && !document.fullscreenElement) {
          await containerRef.current.requestFullscreen?.();
        }

        stereoPluginRef.current.start();
        setStereoEnabled(true);
        setPersistedStereo(true);
        onVrModeChange?.(true);
        setVrError(null);

        // Also enable gyroscope if available
        if (gyroscopePluginRef.current && !gyroscopeEnabled && vrSupport.gyroscope) {
          try {
            await gyroscopePluginRef.current.start();
            setGyroscopeEnabled(true);
            setPersistedGyro(true);
          } catch {
            // Gyroscope optional for stereo mode
          }
        }
      }
    } catch (error) {
      console.error('Stereo mode error:', error);
      setVrError('Failed to enable VR mode');
    }
  }, [gyroscopeEnabled, onVrModeChange, setPersistedGyro, setPersistedStereo, stereoEnabled, stopAutoRotate, vrSupport.gyroscope]);

  // Exit stereo mode on fullscreen exit
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && stereoEnabled) {
        stereoPluginRef.current?.stop();
        setStereoEnabled(false);
        onVrModeChange?.(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [onVrModeChange, stereoEnabled]);

  // Check if VR controls should be shown
  const showVrControls = showControls &&
    !isEditor &&
    tourSettings?.enable_vr !== false &&
    (vrSupport.gyroscope || vrSupport.stereo);

  return (
    <div className={cn('relative h-full w-full', className)}>
      {isPanoramaLoading && !panoramaError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50">
          <Spinner size="lg" />
          <span className="text-sm font-medium text-white/80">Loading room…</span>
        </div>
      )}
      {panoramaError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6 text-center">
          <div className="max-w-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-500)]/15 text-[var(--color-primary-400)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">This room couldn’t load</h2>
            <p className="mt-1 text-sm text-white/60">The panorama failed to load. Check your connection and try again.</p>
            <Button className="mt-4" onClick={() => processSceneQueue(true)}>
              Retry
            </Button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="viewer-container h-full w-full"
        style={{ minHeight: '400px' }}
      />

      {/* VR Controls */}
      {showVrControls && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
          <TooltipProvider>
            {/* Gyroscope toggle */}
            {vrSupport.gyroscope && tourSettings?.enable_gyroscope !== false && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={gyroscopeEnabled ? 'default' : 'secondary'}
                    size="icon"
                    onClick={toggleGyroscope}
                    className={cn(
                      'rounded-full shadow-lg',
                      gyroscopeEnabled && 'bg-[var(--color-primary-500)]'
                    )}
                  >
                    <Smartphone className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {gyroscopeEnabled ? 'Disable gyroscope' : 'Enable gyroscope control'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* VR/Stereo mode toggle */}
            {vrSupport.stereo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={stereoEnabled ? 'default' : 'secondary'}
                    size="icon"
                    onClick={toggleStereo}
                    className={cn(
                      'rounded-full shadow-lg',
                      stereoEnabled && 'bg-[var(--color-primary-500)]'
                    )}
                  >
                    <Glasses className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {stereoEnabled ? 'Exit VR mode' : 'Enter VR mode (cardboard)'}
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      )}

      {/* VR Error message */}
      {vrError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--color-error-500)] px-4 py-2 text-white shadow-lg">
            <span className="text-sm">{vrError}</span>
            <button
              onClick={() => setVrError(null)}
              className="hover:opacity-80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stereo mode overlay instructions */}
      {stereoEnabled && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="rounded-lg bg-black/70 px-4 py-2 text-white text-sm">
            Place phone in VR headset. Tap screen to exit.
          </div>
        </div>
      )}
    </div>
  );
}
