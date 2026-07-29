import { useEffect, useCallback, useRef } from 'react';

type KeyFilter = string | string[];
type Handler = (event: KeyboardEvent) => void;

interface UseKeyPressOptions {
  target?: EventTarget | null;
  enabled?: boolean;
}

export function useKeyPress(
  key: KeyFilter,
  handler: Handler,
  options: UseKeyPressOptions = {}
): void {
  const { target = typeof window !== 'undefined' ? window : null, enabled = true } = options;
  const handlerRef = useRef<Handler>(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.includes(event.key)) {
        handlerRef.current(event);
      }
    },
    [key]
  );

  useEffect(() => {
    if (!enabled || !target) return;

    const listener = handleKeyPress as EventListener;
    target.addEventListener('keydown', listener);

    return () => {
      target.removeEventListener('keydown', listener);
    };
  }, [target, enabled, handleKeyPress]);
}

export function useEscapeKey(handler: Handler, enabled: boolean = true): void {
  useKeyPress('Escape', handler, { enabled });
}
