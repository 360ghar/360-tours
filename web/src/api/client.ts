import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT, ERROR_MESSAGES } from '@/constants';
import { supabaseAuth } from '@/lib/supabaseAuth';
import { envelopeMessage, parseApiError } from './errors';

const MAX_RETRY_ATTEMPTS = 3;
const MAX_TOKEN_RETRY_ATTEMPTS = 1;

/**
 * Only these HTTP methods are safe to replay automatically. A 5xx or network
 * failure is ambiguous — the server may have processed a mutating request
 * (e.g. POST /tours created the row but the response was lost), so replaying
 * it can create duplicates (duplicate tours/scenes/hotspots). **429 obeys the
 * same rule**: a rate limit is usually applied before processing, but the
 * client cannot prove that (a proxy/CDN/WAF may rate-limit a request the
 * origin already handled), so a rate-limited mutation surfaces the error
 * instead of being replayed. 401 is exempt: the request was rejected for
 * missing credentials, so a replay with a fresh token is safe.
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True when a request method is safe to replay automatically after an
 * ambiguous failure (5xx / network error). Exportable for unit tests — the
 * interceptor's retry branch is disabled under `import.meta.env.TEST`.
 */
export function isIdempotentMethod(method: string | undefined): boolean {
  return IDEMPOTENT_METHODS.has((method ?? 'GET').toUpperCase());
}

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

type ExtendedRequestConfig = InternalAxiosRequestConfig & {
  _tokenRetryCount?: number;
  /** 429 retries. Kept separate from `_serverRetryCount` so rate limiting
   * cannot consume the budget reserved for 5xx/network retries. */
  _rateLimitRetryCount?: number;
  _serverRetryCount?: number;
  _skipAuthExpiry?: boolean;
};

function getBearerToken(headers: InternalAxiosRequestConfig['headers'] | undefined): string | null {
  const raw =
    (headers as { Authorization?: string } | undefined)?.Authorization ??
    (headers as { get?: (k: string) => string | undefined } | undefined)?.get?.('Authorization');
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match ? match[1] : null;
}

/**
 * True for backend paths that are anonymous by design (`/public/*`, e.g.
 * `/public/tours/:id`, `/public/tours/:id/events`, like endpoints). These
 * requests must never carry a Bearer token and a 401/403 on them is a content
 * problem, not a session-expiry problem — otherwise a signed-in visitor on a
 * public tour could be force-logged-out by a stale session.
 */
function isPublicApiPath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/, 1)[0];
  return path.startsWith('/public/');
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
    const extendedRequest = config as ExtendedRequestConfig;

    // A FormData body must never go out under the instance's default JSON
    // content type: axios 1.x `transformRequest` sees the JSON type and
    // serializes the FormData with `JSON.stringify(formDataToJSON(data))`,
    // dropping every File. Clearing the header lets axios set
    // `multipart/form-data` with the correct boundary.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      const headers = config.headers as unknown as {
        delete?: (name: string) => void;
      } & Record<string, unknown>;
      if (typeof headers?.delete === 'function') {
        headers.delete('Content-Type');
      } else if (headers) {
        delete headers['Content-Type'];
        delete headers['content-type'];
      }
    }

    // Public endpoints are anonymous by contract: never attach a Bearer token
    // and never treat a 401/403 there as session expiry. Without this, a stale
    // session would get attached to a public tour request and a 401 would
    // trigger the refresh → sign-out → hard-redirect cascade on a public page.
    if (isPublicApiPath(config.url)) {
      extendedRequest._skipAuthExpiry = true;
      return config;
    }

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
  async (error: AxiosError) => {
    const originalRequest = error.config;

    if (originalRequest) {
      const extendedRequest = originalRequest as ExtendedRequestConfig;

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

      // A 429 is rejected BEFORE processing, so replaying is safe in principle
      // — but only for methods that are safe to replay at all. A rate-limited
      // POST may still have been counted/queued upstream (proxy, CDN, WAF), and
      // the caller cannot tell a pre- from a post-processing 429 apart.
      const method = (originalRequest.method ?? 'GET').toUpperCase();

      if (error.response?.status === 429 && isIdempotentMethod(method)) {
        // Separate budget from the 5xx branch: sharing one counter let rate
        // limiting consume the retries reserved for server errors.
        const retryCount = extendedRequest._rateLimitRetryCount || 0;

        if (retryCount < MAX_RETRY_ATTEMPTS) {
          extendedRequest._rateLimitRetryCount = retryCount + 1;

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
      // Only idempotent methods (GET/HEAD/OPTIONS) are replayed: a lost-response
      // 500 on a mutating request must not be resent (duplicate-tour risk).
      // Disabled in test environment to prevent interceptor re-entry in unit tests.
      const isNetworkError = !error.response;
      const isServerError = error.response?.status !== undefined && error.response.status >= 500;
      if (
        (isNetworkError || isServerError) &&
        !import.meta.env?.TEST &&
        isIdempotentMethod(method)
      ) {
        const retryCount = extendedRequest._serverRetryCount || 0;
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          extendedRequest._serverRetryCount = retryCount + 1;
          const delayMs = Math.min(1000 * 2 ** retryCount, 10000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return apiClient(originalRequest);
        }
      }

      // 429 and 5xx retries already handled above.
      // 401 retries already handled above.
      // Fall through to error message extraction for all other errors.
    }

    // Every non-2xx body is {"error": {"code", "message", "details"}}; a 422 carries
    // details.fields. Nothing else is read from the body.
    let errorMessage: string = ERROR_MESSAGES.GENERIC;
    const envelope = envelopeMessage(parseApiError(error));
    if (envelope) {
      errorMessage = envelope;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Keep the original axios message reachable for debugging: the normalized
    // user-facing message replaces `message`, so preserve the raw one as
    // `cause` unless axios already attached one (e.g. network errors).
    if (error.cause === undefined && error.message !== errorMessage) {
      error.cause = new Error(error.message);
    }
    error.message = errorMessage;
    return Promise.reject(error);
  }
);

export function extractData<T>(response: { data: T }): T {
  return response.data;
}

export default apiClient;
export { apiClient };
