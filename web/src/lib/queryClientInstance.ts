import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client with retry disabled.
 *
 * Retries are handled centrally by the Axios interceptor in api/client.ts,
 * which retries 429 (rate limit with backoff), 401 (token refresh), and
 * 5xx/network errors (up to 3 attempts with exponential backoff).
 *
 * Disabling React Query retries prevents double-retrying (e.g., 3 Axios
 * retries × 3 React Query retries = 9 total attempts for a 500 error).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
