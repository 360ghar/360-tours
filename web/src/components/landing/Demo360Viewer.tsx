import { useEffect, useRef, useState } from 'react';
import '@photo-sphere-viewer/core/index.css';
import { Button } from '@/components/ui';
import { cn } from '@/utils';

interface Demo360ViewerProps {
  className?: string;
}

const RESUME_DELAY = 2000;
const BASE_SPEED_RAD = 0.02;
// Bundled equirectangular demo panorama (see public/demo/) — no runtime
// dependency on a third-party CDN.
const DEMO_PANORAMA_URL = '/demo/living-room-panorama.webp';

export function Demo360Viewer({ className }: Demo360ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<unknown>(null);
  const initViewerRef = useRef<() => Promise<void>>(async () => undefined);

  const [loadFailed, setLoadFailed] = useState(false);

  const autoRotateFrameRef = useRef<number | null>(null);
  const autoRotateLastTimeRef = useRef<number | null>(null);
  const autoRotateIdleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    // StrictMode mounts the effect twice in dev: the first mount's async
    // initViewer can resolve AFTER the second mount created its viewer, and
    // would then destroy the active viewer and leave a stuck loader + blank
    // canvas. `disposed` lets a superseded instance bail out without touching
    // the shared refs/state of the instance that actually owns the container.
    let disposed = false;

    const stopAutoRotate = () => {
      if (autoRotateIdleTimeoutRef.current != null) {
        window.clearTimeout(autoRotateIdleTimeoutRef.current);
        autoRotateIdleTimeoutRef.current = null;
      }
      if (autoRotateFrameRef.current != null) {
        cancelAnimationFrame(autoRotateFrameRef.current);
        autoRotateFrameRef.current = null;
      }
      autoRotateLastTimeRef.current = null;
    };

    const startAutoRotate = () => {
      if (motionQuery.matches) return;

      const currentViewer = viewerRef.current as {
        getPosition: () => { yaw: number; pitch: number };
        rotate: (p: { yaw: number; pitch: number }) => void;
      } | null;
      if (!currentViewer || autoRotateFrameRef.current != null) return;

      const step = (timestamp: number) => {
        const v = viewerRef.current as {
          getPosition: () => { yaw: number; pitch: number };
          rotate: (p: { yaw: number; pitch: number }) => void;
        } | null;
        if (!v) return;

        if (autoRotateLastTimeRef.current == null) {
          autoRotateLastTimeRef.current = timestamp;
        }

        const dtSeconds = (timestamp - autoRotateLastTimeRef.current) / 1000;
        autoRotateLastTimeRef.current = timestamp;

        const position = v.getPosition();
        v.rotate({
          yaw: position.yaw + BASE_SPEED_RAD * dtSeconds,
          pitch: position.pitch,
        });

        autoRotateFrameRef.current = requestAnimationFrame(step);
      };

      autoRotateFrameRef.current = requestAnimationFrame(step);
    };

    const scheduleAutoRotate = () => {
      stopAutoRotate();
      autoRotateIdleTimeoutRef.current = window.setTimeout(() => {
        startAutoRotate();
      }, RESUME_DELAY);
    };

    const handleMotionPreferenceChange = () => {
      if (motionQuery.matches) {
        stopAutoRotate();
      } else {
        scheduleAutoRotate();
      }
    };

    const destroyViewer = () => {
      if (
        viewerRef.current &&
        typeof (viewerRef.current as { destroy: () => void }).destroy === 'function'
      ) {
        try {
          (viewerRef.current as { destroy: () => void }).destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      viewerRef.current = null;
    };

    const initViewer = async () => {
      if (!container) return;

      try {
        const { Viewer } = await import('@photo-sphere-viewer/core');

        // This instance was unmounted while the import was in flight (dev
        // StrictMode double-mount) — the active instance owns the container.
        if (disposed) return;

        // A retry after a failure must start from a clean viewer.
        destroyViewer();
        setLoadFailed(false);

        const newViewer = new Viewer({
          container,
          panorama: DEMO_PANORAMA_URL,
          defaultPitch: 0.1,
          defaultYaw: 0,
          navbar: false,
          loadingTxt: 'Loading interactive preview…',
          touchmoveTwoFingers: true,
          mousewheelCtrlKey: true,
        });
        viewerRef.current = newViewer;

        // CDN/image failures surface via the panorama-error event — show a
        // friendly fallback instead of a blank black box.
        newViewer.addEventListener('panorama-error', () => {
          destroyViewer();
          setLoadFailed(true);
        });

        if (!motionQuery.matches) {
          scheduleAutoRotate();
        }

        container.addEventListener('pointerdown', scheduleAutoRotate);
        container.addEventListener('wheel', scheduleAutoRotate, { passive: true });
        container.addEventListener('touchstart', scheduleAutoRotate, { passive: true });
        motionQuery.addEventListener('change', handleMotionPreferenceChange);
      } catch (error) {
        if (disposed) return;
        console.error('Failed to initialize 360 viewer:', error);
        destroyViewer();
        setLoadFailed(true);
      }
    };

    initViewerRef.current = initViewer;
    void initViewer();

    return () => {
      disposed = true;
      container?.removeEventListener('pointerdown', scheduleAutoRotate);
      container?.removeEventListener('wheel', scheduleAutoRotate);
      container?.removeEventListener('touchstart', scheduleAutoRotate);
      motionQuery.removeEventListener('change', handleMotionPreferenceChange);
      stopAutoRotate();
      destroyViewer();
    };
  }, []);

  const handleRetry = () => {
    void initViewerRef.current();
  };

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Interactive 360 degree tour preview. Drag or swipe to explore the room."
      // Inline style beats PSV's own white radial-gradient background
      // (loaded after Tailwind, same specificity) so the container reads as
      // the intended dark "viewport" even before the panorama renders.
      style={{ background: '#0A0A0B' }}
      className={cn(
        'relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-[#0A0A0B]',
        'shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)]',
        className
      )}
    >
      {loadFailed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0A0A0B] p-6 text-center">
          <p className="text-sm text-white/80">
            Couldn&apos;t load the interactive preview right now.
          </p>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
