import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.history.pushState({}, '', '/');
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-4">
          <div className="max-w-md w-full text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-error-100)]">
              <AlertTriangle className="h-8 w-8 text-[var(--color-error-600)]" />
            </div>
            <h1 className="mt-6 text-2xl font-bold text-[var(--color-text-primary)]">
              Something went wrong
            </h1>
            <p className="mt-2 text-[var(--color-text-muted)]">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-4 rounded-lg bg-[var(--color-surface)] p-4 text-left">
                <p className="text-sm font-medium text-[var(--color-error-600)]">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <pre className="mt-2 max-h-40 overflow-auto text-xs text-[var(--color-text-muted)]">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </Button>
              <Button variant="outline" onClick={this.handleGoHome}>
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary?: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-[200px] items-center justify-center p-4">
      <div className="text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-[var(--color-error-500)]" />
        <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
          Something went wrong
        </h3>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {error.message || 'An unexpected error occurred'}
        </p>
        {resetErrorBoundary && (
          <Button variant="outline" size="sm" className="mt-4" onClick={resetErrorBoundary}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
