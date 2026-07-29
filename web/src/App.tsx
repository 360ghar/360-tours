import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from '@/lib/queryClient';
import { router } from '@/lib/router';
import { Toaster } from '@/components/ui/Toaster';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorBoundary } from '@/components/features/ErrorBoundary';
import { GlobalErrorHandler, OfflineIndicator } from '@/components/common';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores';
import { useUIStore } from '@/stores';
import { applyTheme } from '@/stores/uiStore';
import { onAuthExpired } from '@/api';
import { ROUTES } from '@/constants';

const AUTH_REDIRECT_BLOCKLIST: readonly string[] = [
  ROUTES.LOGIN,
  ROUTES.REGISTER,
  ROUTES.AUTH_CALLBACK,
];

function ThemeInitializer() {
  const { theme } = useUIStore();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return null;
}

function AuthInitializer() {
  const { checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const unsubscribe = onAuthExpired(() => {
      // Soft-clear store first; hard redirect only when not already on login.
      // Avoid full reloads when already on /login (that caused bounce loops).
      if (window.location.pathname === ROUTES.LOGIN) {
        return;
      }
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const loginUrl = new URL(ROUTES.LOGIN, window.location.origin);
      if (
        returnPath.startsWith('/') &&
        !returnPath.startsWith('//') &&
        !AUTH_REDIRECT_BLOCKLIST.includes(window.location.pathname)
      ) {
        loginUrl.searchParams.set('next', returnPath);
      }
      // Use replace so back-button doesn't re-enter a dying dashboard session.
      window.location.replace(loginUrl.toString());
    });
    return unsubscribe;
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary-200)] border-t-[var(--color-primary-600)]" />
          <p className="text-[var(--color-text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeInitializer />
        <GlobalErrorHandler />
        <AuthInitializer />
        <Toaster />
        <ConfirmDialog />
        <OfflineIndicator />
      </QueryProvider>
    </ErrorBoundary>
  );
}
