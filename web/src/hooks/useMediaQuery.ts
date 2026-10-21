import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => undefined;
      const mediaQuery = window.matchMedia(query);
      const handler = () => onStoreChange();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
    () => false
  );
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}
