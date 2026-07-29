import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/utils';

interface AiRetryErrorProps {
  error: string;
  onRetry: () => void;
  isLoading?: boolean;
  /** Tailwind max-width class to match the surrounding layout (default max-w-md). */
  maxWidthClassName?: string;
}

/**
 * Shared inline error + retry block for the AI feature dialogs
 * (scene analysis, hotspot suggestions, description generation).
 */
export function AiRetryError({
  error,
  onRetry,
  isLoading = false,
  maxWidthClassName = 'max-w-md',
}: AiRetryErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        'mb-4 w-full rounded-lg border border-[var(--color-error-200)] bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-600)]',
        maxWidthClassName
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="flex-1">{error}</span>
      </div>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry} isLoading={isLoading}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
