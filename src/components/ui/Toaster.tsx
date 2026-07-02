import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils';
import { useUIStore, Toast } from '@/stores';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success:
    'bg-[var(--color-success-50)] border-[var(--color-success-500)] text-[var(--color-success-800)]',
  error: 'bg-[var(--color-error-50)] border-[var(--color-error-500)] text-[var(--color-error-800)]',
  info: 'bg-[var(--color-primary-50)] border-[var(--color-primary-500)] text-[var(--color-primary-800)]',
  warning:
    'bg-[var(--color-warning-50)] border-[var(--color-warning-500)] text-[var(--color-warning-800)]',
};

const iconStyles = {
  success: 'text-[var(--color-success-600)]',
  error: 'text-[var(--color-error-600)]',
  info: 'text-[var(--color-primary-600)]',
  warning: 'text-[var(--color-warning-600)]',
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = icons[toast.type];
  const liveRole = toast.type === 'error' ? 'alert' : 'status';

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 150);
  };

  return (
    <div
      role={liveRole}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all duration-150',
        styles[toast.type],
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', iconStyles[toast.type])} aria-hidden="true" />
      <div className="flex-1 space-y-1">
        {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
        <p className="text-sm">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded p-1 transition-colors hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, removeToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-md">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={() => removeToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}
