import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, useAuthStore } from '@/stores';
import { ROUTES, ERROR_MESSAGES } from '@/constants';
import type { AxiosError } from 'axios';

interface ApiError {
  message?: string;
  detail?: string;
  code?: string;
}

export function GlobalErrorHandler() {
  const navigate = useNavigate();
  const { addToast } = useUIStore();
  const { logout } = useAuthStore();

  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);

      const error = event.reason as AxiosError<ApiError>;

      // Check for authentication errors
      if (error?.response?.status === 401) {
        addToast({
          type: 'error',
          title: 'Session Expired',
          message: ERROR_MESSAGES.SESSION_EXPIRED,
        });
        logout();
        navigate(ROUTES.LOGIN);
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
        const detail = error?.response?.data?.detail;
        addToast({
          type: 'error',
          title: 'Validation Error',
          message: typeof detail === 'string' ? detail : ERROR_MESSAGES.VALIDATION,
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
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
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
  }, [addToast, logout, navigate]);

  return null;
}
