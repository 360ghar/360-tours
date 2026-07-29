import { Loader2 } from 'lucide-react';
import { cn } from '@/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn('animate-spin text-[var(--color-primary-600)]', sizeClasses[size], className)}
    />
  );
}

interface LoadingOverlayProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingOverlay({
  message = 'Loading...',
  fullScreen = false,
}: LoadingOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-4 bg-[var(--color-background)]/80 backdrop-blur-sm',
        fullScreen ? 'fixed inset-0 z-[var(--z-modal)]' : 'absolute inset-0'
      )}
    >
      <Spinner size="lg" />
      <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
    </div>
  );
}

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = 'Loading...' }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4"
    >
      <Spinner size="lg" />
      <p className="text-[var(--color-text-muted)]">{message}</p>
    </div>
  );
}
