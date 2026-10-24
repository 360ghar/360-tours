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
import { isSameOriginPath } from '@/utils/url';

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
  const checkAuth = useAuthStore(s => s.checkAuth);

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
        isSameOriginPath(returnPath) &&
        !AUTH_REDIRECT_BLOCKLIST.includes(window.location.pathname)
      ) {
        loginUrl.searchParams.set('next', returnPath);
      }
      // Use replace so back-button doesn't re-enter a dying dashboard session.
      window.location.replace(loginUrl.toString());
    });
    return unsubscribe;
  }, []);

  // The router mounts immediately, even while checkAuth is still in flight.
  // Public routes (/view/:id, /embed/:id, the landing page) have
  // no dependency on the session and must never wait on it — a slow or failing
  // /users/me used to blank the embedded viewer for the whole retry window.
  // Routes that DO depend on auth gate themselves: ProtectedRoute renders a
  // PageLoader while `isLoading`, and RootRedirect does the same for `/`.
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
