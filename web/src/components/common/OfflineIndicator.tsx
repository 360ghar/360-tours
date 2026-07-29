import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/utils';

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    let reconnectedTimer: ReturnType<typeof setTimeout>;

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      reconnectedTimer = setTimeout(() => setShowReconnected(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(reconnectedTimer);
    };
  }, []);

  if (isOnline && !showReconnected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'fixed bottom-4 left-1/2 z-[var(--z-toast)] flex -translate-x-1/2 animate-slide-up items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all duration-300',
        isOnline
          ? 'bg-[var(--color-success-500)] text-white'
          : 'bg-[var(--color-error-500)] text-white',
        className
      )}
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" aria-hidden="true" />
          Back online
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          You're offline
        </>
      )}
    </div>
  );
}
