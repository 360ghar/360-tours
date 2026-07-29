import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT, ERROR_MESSAGES } from '@/constants';
import type { ApiError } from '@/types';
import { supabaseAuth } from '@/lib/supabaseAuth';

const MAX_RETRY_ATTEMPTS = 3;
const MAX_TOKEN_RETRY_ATTEMPTS = 1;

let isRefreshingToken = false;
let refreshPromise: Promise<string | null> | null = null;

const authExpiredListeners: Array<() => void> = [];

export function onAuthExpired(listener: () => void): () => void {
  authExpiredListeners.push(listener);
  return () => {
    const idx = authExpiredListeners.indexOf(listener);
    if (idx !== -1) authExpiredListeners.splice(idx, 1);
  };
}

function notifyAuthExpired() {
  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch {
      // listener errors should not break other listeners
    }
  }
}

function getBearerToken(headers: InternalAxiosRequestConfig['headers'] | undefined): string | null {
  const raw =
    (headers as { Authorization?: string } | undefined)?.Authorization ??
    (headers as { get?: (k: string) => string | undefined } | undefined)?.get?.('Authorization');
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match ? match[1] : null;
}

/**
 * Only force a sign-out if the token that failed is still the current one.
 * If it differs, a concurrent refresh/login already replaced it — expiring
 * the session here would wipe out that newer, valid session.
 */
async function expireSessionIfStillStale(failedToken: string | null): Promise<void> {
  const currentToken = supabaseAuth.getTokens()?.access_token ?? null;
  if (currentToken && failedToken && currentToken !== failedToken) {
    return;
  }
  await supabaseAuth.signOut().catch(() => {});
  notifyAuthExpired();
}

async function tryRefreshToken(): Promise<string | null> {
  if (!isRefreshingToken) {
    isRefreshingToken = true;
    refreshPromise = supabaseAuth.getAccessToken();
  }
  try {
    const token = await refreshPromise;
    return token;
  } finally {
    isRefreshingToken = false;
    refreshPromise = null;
  }
}

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Prefer the in-memory session first so concurrent login/hydration
    // requests don't race getSession() and go out without a Bearer token.
    let accessToken = supabaseAuth.getTokens()?.access_token ?? null;
    if (!accessToken) {
      accessToken = await supabaseAuth.getAccessToken();
    }
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config;

    if (originalRequest) {
      const extendedRequest = originalRequest as InternalAxiosRequestConfig & {
        _tokenRetryCount?: number;
        _retryCount?: number;
        _skipAuthExpiry?: boolean;
      };

      if (error.response?.status === 401) {
        // Non-critical requests (e.g. recordLastMethod) should not trigger the
        // sign-out cascade — just reject so the caller can handle it.
        if (extendedRequest._skipAuthExpiry) {
          return Promise.reject(error);
        }

        const hadAuthHeader = Boolean(
          originalRequest.headers?.Authorization ||
            // axios may store headers in AxiosHeaders
            (originalRequest.headers as { get?: (k: string) => string } | undefined)?.get?.(
              'Authorization'
            )
        );

        // Unauthenticated probe (no Bearer) is not a session expiry — never
        // force sign-out. This stops a race during login from wiping a good session.
        if (!hadAuthHeader) {
          return Promise.reject(error);
        }

        const failedToken = getBearerToken(originalRequest.headers);
        const tokenRetryCount = extendedRequest._tokenRetryCount || 0;

        if (tokenRetryCount >= MAX_TOKEN_RETRY_ATTEMPTS) {
          await expireSessionIfStillStale(failedToken);
          return Promise.reject(new Error(ERROR_MESSAGES.SESSION_EXPIRED));
        }

        extendedRequest._tokenRetryCount = tokenRetryCount + 1;

        try {
          const newToken = await tryRefreshToken();
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }
        } catch {
          // refresh failed, fall through to sign-out
        }

        await expireSessionIfStillStale(failedToken);
        return Promise.reject(new Error(ERROR_MESSAGES.SESSION_EXPIRED));
      }

      if (error.response?.status === 429) {
        const retryCount = extendedRequest._retryCount || 0;

        if (retryCount < MAX_RETRY_ATTEMPTS) {
          extendedRequest._retryCount = retryCount + 1;

          const retryAfter = error.response.headers?.['retry-after'];
          const parsedRetryAfter = parseInt(retryAfter as string, 10);
          const delayMs = Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
            ? parsedRetryAfter * 1000
            : Math.min(1000 * 2 ** retryCount, 10000);

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return apiClient(originalRequest);
        }
      }

      // Retry 5xx server errors and network failures (with exponential backoff).
      // Disabled in test environment to prevent interceptor re-entry in unit tests.
      const isNetworkError = !error.response;
      const isServerError = error.response?.status !== undefined && error.response.status >= 500;
      if ((isNetworkError || isServerError) && !import.meta.env?.TEST) {
        const retryCount = extendedRequest._retryCount || 0;
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          extendedRequest._retryCount = retryCount + 1;
          const delayMs = Math.min(1000 * 2 ** retryCount, 10000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return apiClient(originalRequest);
        }
      }

      // 429 and 5xx retries already handled above.
      // 401 retries already handled above.
      // Fall through to error message extraction for all other errors.
    }

    let errorMessage: string = ERROR_MESSAGES.GENERIC;
    const responseData = error.response?.data;

    if (responseData?.detail) {
      if (typeof responseData.detail === 'string') {
        errorMessage = responseData.detail;
      } else if (responseData.detail.message) {
        errorMessage = responseData.detail.message;
      }
    } else if (responseData?.error?.message) {
      errorMessage = responseData.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Preserve the original error as the cause for debugging
    error.message = errorMessage;
    return Promise.reject(error);
  }
);

export function extractData<T>(response: { data: T }): T {
  return response.data;
}

export default apiClient;
export { apiClient };
