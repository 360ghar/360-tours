import { useEffect, useRef } from 'react';

interface Options {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  enabled?: boolean;
  minDistance?: number;
}

export function useTwoFingerSwipe(
  ref: React.RefObject<HTMLElement | null>,
  { onSwipeLeft, onSwipeRight, enabled = true, minDistance = 60 }: Options
) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lastX = useRef<number | null>(null);
  const lastY = useRef<number | null>(null);
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);

  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft;
    onSwipeRightRef.current = onSwipeRight;
  }, [onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;

    const getCenter = (touches: TouchList) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const reset = () => {
      startX.current = null;
      startY.current = null;
      lastX.current = null;
      lastY.current = null;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const center = getCenter(e.touches);
      startX.current = center.x;
      startY.current = center.y;
      lastX.current = center.x;
      lastY.current = center.y;
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startX.current === null) return;
      const center = getCenter(e.touches);
      lastX.current = center.x;
      lastY.current = center.y;
    };

    const onEnd = () => {
      if (startX.current === null) return;
      const endX = lastX.current ?? startX.current;
      const endY = lastY.current ?? startY.current ?? 0;
      const dx = endX - startX.current;
      const dy = endY - (startY.current ?? 0);
      if (Math.abs(dx) > minDistance && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onSwipeLeftRef.current();
        else onSwipeRightRef.current();
      }
      reset();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [enabled, minDistance, ref]);
}
