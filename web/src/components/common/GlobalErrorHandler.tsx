import { useEffect } from 'react';
import { useUIStore, useAuthStore } from '@/stores';
import { ROUTES, ERROR_MESSAGES } from '@/constants';
import type { AxiosError } from 'axios';
import { envelopeMessage, readErrorEnvelope } from '@/api/errors';

// Auth flows that must never receive a `next=` return path.
const AUTH_REDIRECT_BLOCKLIST: readonly string[] = [
  ROUTES.LOGIN,
  ROUTES.REGISTER,
  ROUTES.AUTH_CALLBACK,
];

export function GlobalErrorHandler() {
  const { addToast } = useUIStore();
  const { logout } = useAuthStore();

  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);

      const error = event.reason as AxiosError<unknown>;

      // Check for authentication errors
      if (error?.response?.status === 401) {
        addToast({
          type: 'error',
          title: 'Session Expired',
          message: ERROR_MESSAGES.SESSION_EXPIRED,
        });
        logout();
        // Mirror App.tsx AuthInitializer: keep the return path so the user
        // lands back where they were after signing in again. Auth pages are
        // blocklisted to avoid bounce loops.
        const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const loginUrl = new URL(ROUTES.LOGIN, window.location.origin);
        if (
          returnPath.startsWith('/') &&
          !returnPath.startsWith('//') &&
          !AUTH_REDIRECT_BLOCKLIST.includes(window.location.pathname)
        ) {
          loginUrl.searchParams.set('next', returnPath);
        }
        // Use replace so back-button doesn't re-enter a dying session.
        window.location.replace(loginUrl.toString());
        return;
      }

      // Check for network errors
      if (error?.code === 'ERR_NETWORK') {
        addToast({
          type: 'error',
          title: 'Connection Error',
          message: ERROR_MESSAGES.NETWORK,
        });
        return;
      }

      // Check for authorization errors
      if (error?.response?.status === 403) {
        addToast({
          type: 'error',
          title: 'Access Denied',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
        return;
      }

      // Check for not found errors
      if (error?.response?.status === 404) {
        addToast({
          type: 'error',
          title: 'Not Found',
          message: ERROR_MESSAGES.NOT_FOUND,
        });
        return;
      }

      // Check for validation errors
      if (error?.response?.status === 422) {
        // A 422 carries the field errors in error.details.fields.
        const message = envelopeMessage(readErrorEnvelope(error?.response?.data));
        addToast({
          type: 'error',
          title: 'Validation Error',
          message: message ?? ERROR_MESSAGES.VALIDATION,
        });
        return;
      }

      // Generic server error
      if (error?.response?.status && error.response.status >= 500) {
        addToast({
          type: 'error',
          title: 'Server Error',
          message: ERROR_MESSAGES.GENERIC,
        });
        return;
      }

      // Generic error handler
      // Every non-2xx body is {error: {code, message, details}}; nothing else is read.
      const message =
        envelopeMessage(readErrorEnvelope(error?.response?.data)) ||
        error?.message ||
        ERROR_MESSAGES.GENERIC;

      addToast({
        type: 'error',
        title: 'Error',
        message,
      });
    };

    // Handle runtime errors
    const handleError = (event: ErrorEvent) => {
      console.error('Runtime error:', event.error);

      // Don't show toast for ResizeObserver errors (common and harmless)
      if (event.message?.includes('ResizeObserver')) {
        return;
      }

      addToast({
        type: 'error',
        title: 'Application Error',
        message: ERROR_MESSAGES.GENERIC,
      });
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [addToast, logout]);

  return null;
}
