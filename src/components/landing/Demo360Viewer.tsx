import { useEffect, useRef } from 'react';
import '@photo-sphere-viewer/core/index.css';
import { cn } from '@/utils';

interface Demo360ViewerProps {
  className?: string;
}

const RESUME_DELAY = 2000;
const BASE_SPEED_RAD = 0.02;

export function Demo360Viewer({ className }: Demo360ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<unknown>(null);

  const autoRotateFrameRef = useRef<number | null>(null);
  const autoRotateLastTimeRef = useRef<number | null>(null);
  const autoRotateIdleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let viewer: unknown;
    const container = containerRef.current;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

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

    const initViewer = async () => {
      if (!container || viewerRef.current) return;

      try {
        const { Viewer } = await import('@photo-sphere-viewer/core');

        viewer = new Viewer({
          container,
          panorama: 'https://photo-sphere-viewer-data.netlify.app/assets/sphere.jpg',
          defaultPitch: 0.1,
          defaultYaw: 0,
          navbar: false,
          loadingTxt: '',
          touchmoveTwoFingers: true,
          mousewheelCtrlKey: true,
        });

        viewerRef.current = viewer;
        if (!motionQuery.matches) {
          scheduleAutoRotate();
        }

        container.addEventListener('pointerdown', scheduleAutoRotate);
        container.addEventListener('wheel', scheduleAutoRotate, { passive: true });
        container.addEventListener('touchstart', scheduleAutoRotate, { passive: true });
        motionQuery.addEventListener('change', handleMotionPreferenceChange);
      } catch (error) {
        console.error('Failed to initialize 360 viewer:', error);
      }
    };

    initViewer();

    return () => {
      container?.removeEventListener('pointerdown', scheduleAutoRotate);
      container?.removeEventListener('wheel', scheduleAutoRotate);
      container?.removeEventListener('touchstart', scheduleAutoRotate);
      motionQuery.removeEventListener('change', handleMotionPreferenceChange);
      stopAutoRotate();
      if (viewerRef.current && typeof (viewerRef.current as { destroy: () => void }).destroy === 'function') {
        try {
          (viewerRef.current as { destroy: () => void }).destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      viewerRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Interactive 360 degree tour preview. Drag or swipe to explore the room."
      className={cn(
        'w-full aspect-[16/10] rounded-2xl overflow-hidden bg-[#0A0A0B]',
        'shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)]',
        className
      )}
    />
  );
}
