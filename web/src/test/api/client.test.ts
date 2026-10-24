import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import axios from 'axios';

vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    getAccessToken: vi.fn(),
    getTokens: vi.fn().mockReturnValue(null),
    signOut: vi.fn().mockResolvedValue(undefined),
  },
}));

import apiClient, { extractData, isIdempotentMethod, onAuthExpired } from '@/api/client';
import { supabaseAuth } from '@/lib/supabaseAuth';
import { ERROR_MESSAGES } from '@/constants';

function getRequestInterceptor() {
  return (apiClient.interceptors.request as unknown as {
    handlers: Array<{
      fulfilled: (config: unknown) => Promise<unknown> | unknown;
    }>;
  }).handlers[0];
}

function getResponseInterceptor() {
  return (apiClient.interceptors.response as unknown as {
    handlers: Array<{
      rejected: (error: unknown) => Promise<unknown> | unknown;
    }>;
  }).handlers[0];
}

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('request interceptor', () => {
    it('adds Authorization header when access token is available', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('test-access-token');

      const interceptor = getRequestInterceptor();
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get' as const,
        url: '/test',
      };

      const result = (await interceptor.fulfilled(config)) as {
        headers: { Authorization?: string };
      };
      expect(result.headers.Authorization).toBe('Bearer test-access-token');
    });

    it('does not add Authorization header when no token', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue(null);

      const interceptor = getRequestInterceptor();
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get' as const,
        url: '/test',
      };

      const result = (await interceptor.fulfilled(config)) as {
        headers: { Authorization?: string };
      };
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('never attaches a Bearer token to public endpoints even when a token exists', async () => {
      (supabaseAuth.getTokens as Mock).mockReturnValue({ access_token: 'session-token' });
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('session-token');

      const interceptor = getRequestInterceptor();
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get' as const,
        url: '/public/tours/tour-1?track=false',
      };

      const result = (await interceptor.fulfilled(config)) as {
        headers: { Authorization?: string };
        _skipAuthExpiry?: boolean;
      };
      expect(result.headers.Authorization).toBeUndefined();
      expect(supabaseAuth.getAccessToken).not.toHaveBeenCalled();
      // Marks the request so a 401/403 on it never triggers the sign-out cascade.
      expect(result._skipAuthExpiry).toBe(true);
    });

    it('still attaches a Bearer token to authenticated endpoints', async () => {
      (supabaseAuth.getTokens as Mock).mockReturnValue(null);
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('session-token');

      const interceptor = getRequestInterceptor();
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get' as const,
        url: '/tours/tour-1',
      };

      const result = (await interceptor.fulfilled(config)) as {
        headers: { Authorization?: string };
        _skipAuthExpiry?: boolean;
      };
      expect(result.headers.Authorization).toBe('Bearer session-token');
      expect(result._skipAuthExpiry).toBeUndefined();
    });
  });

  describe('response interceptor - 401 handling', () => {
    it('attempts token refresh on 401, then signs out if refresh returns null', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue(null);
      (supabaseAuth.getTokens as Mock).mockReturnValue({ access_token: 'stale-token' });
      (supabaseAuth.signOut as Mock).mockResolvedValue(undefined);

      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders({ Authorization: 'Bearer stale-token' }),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.SESSION_EXPIRED);
      expect(supabaseAuth.getAccessToken).toHaveBeenCalled();
      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('signs out on 401 when token retry limit is exceeded', async () => {
      (supabaseAuth.getTokens as Mock).mockReturnValue({ access_token: 'stale-token' });
      (supabaseAuth.signOut as Mock).mockResolvedValue(undefined);

      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders({ Authorization: 'Bearer stale-token' }),
        url: '/test',
        _tokenRetryCount: 1,
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.SESSION_EXPIRED);
      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('notifies auth expired listeners on 401 failure', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue(null);
      (supabaseAuth.getTokens as Mock).mockReturnValue({ access_token: 'stale-token' });
      (supabaseAuth.signOut as Mock).mockResolvedValue(undefined);

      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders({ Authorization: 'Bearer stale-token' }),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.SESSION_EXPIRED);
      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('rejects unauthenticated probes (no Authorization header) without signing out', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toBe(error);
      expect(supabaseAuth.getAccessToken).not.toHaveBeenCalled();
      expect(supabaseAuth.signOut).not.toHaveBeenCalled();
    });

    it('does not sign out when a concurrent login already replaced the failed token', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue(null);
      // A concurrent login succeeded and replaced the token after this
      // request's refresh attempt failed — must not tear down that session.
      (supabaseAuth.getTokens as Mock).mockReturnValue({ access_token: 'fresh-token-from-concurrent-login' });
      (supabaseAuth.signOut as Mock).mockResolvedValue(undefined);

      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders({ Authorization: 'Bearer stale-token' }),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.SESSION_EXPIRED);
      expect(supabaseAuth.signOut).not.toHaveBeenCalled();
    });

    it('rejects public 401 without refresh, sign-out, or auth-expiry notification', async () => {
      // A stale session would normally trigger the refresh → sign-out cascade;
      // public requests are flagged _skipAuthExpiry by the request interceptor
      // and must fail anonymously instead of logging a visitor out.
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue(null);
      (supabaseAuth.getTokens as Mock).mockReturnValue({ access_token: 'stale-token' });
      (supabaseAuth.signOut as Mock).mockResolvedValue(undefined);

      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders({ Authorization: 'Bearer stale-token' }),
        url: '/public/tours/tour-1',
        _skipAuthExpiry: true,
      } as never;

      await expect(interceptor.rejected(error)).rejects.toBe(error);
      expect(supabaseAuth.getAccessToken).not.toHaveBeenCalled();
      expect(supabaseAuth.signOut).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('response interceptor - 429 handling', () => {
    it('retries with exponential backoff on 429', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('token');

      const originalAdapter = apiClient.defaults.adapter;
      let callCount = 0;
      apiClient.defaults.adapter = async (config) => {
        callCount++;
        if (callCount === 1) {
          throw new axios.AxiosError('Too Many Requests', '429', config as never, undefined, {
            status: 429,
            data: {},
            statusText: 'Too Many Requests',
            headers: {},
            config: config as never,
          });
        }
        return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config: config as never };
      };

      try {
        vi.useFakeTimers();
        const promise = apiClient.get('/test');
        await vi.advanceTimersByTimeAsync(1100);
        const result = await promise;

        expect(result.data).toEqual({ success: true });
        expect(callCount).toBe(2);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
        vi.useRealTimers();
      }
    });

    // A rate-limited POST must not be replayed: the caller cannot tell a
    // pre-processing 429 (safe) from one raised after the write landed, and a
    // replayed POST /tours duplicates the tour — the same rule the 5xx branch
    // already applied.
    it('never replays a non-idempotent method on 429', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('token');

      const originalAdapter = apiClient.defaults.adapter;
      let callCount = 0;
      apiClient.defaults.adapter = async (config) => {
        callCount++;
        throw new axios.AxiosError('Too Many Requests', '429', config as never, undefined, {
          status: 429,
          data: {},
          statusText: 'Too Many Requests',
          headers: {},
          config: config as never,
        });
      };

      try {
        await expect(apiClient.post('/tours', { title: 'T' })).rejects.toBeTruthy();
        expect(callCount).toBe(1);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
      }
    });

    it('respects Retry-After header on 429', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('token');

      const originalAdapter = apiClient.defaults.adapter;
      let callCount = 0;
      apiClient.defaults.adapter = async (config) => {
        callCount++;
        if (callCount === 1) {
          throw new axios.AxiosError('Too Many Requests', '429', config as never, undefined, {
            status: 429,
            data: {},
            statusText: 'Too Many Requests',
            headers: { 'retry-after': '2' },
            config: config as never,
          });
        }
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: config as never };
      };

      try {
        vi.useFakeTimers();
        const promise = apiClient.get('/test');
        await vi.advanceTimersByTimeAsync(2100);
        const result = await promise;

        expect(result.data).toEqual({ ok: true });
        expect(callCount).toBe(2);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
        vi.useRealTimers();
      }
    });

    it('falls back to exponential backoff for invalid Retry-After header', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('token');

      const originalAdapter = apiClient.defaults.adapter;
      let callCount = 0;
      apiClient.defaults.adapter = async (config) => {
        callCount++;
        if (callCount === 1) {
          throw new axios.AxiosError('Too Many Requests', '429', config as never, undefined, {
            status: 429,
            data: {},
            statusText: 'Too Many Requests',
            headers: { 'retry-after': 'invalid' },
            config: config as never,
          });
        }
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: config as never };
      };

      try {
        vi.useFakeTimers();
        const promise = apiClient.get('/test');
        // Should use exponential backoff (1000ms for first retry) instead of NaN
        await vi.advanceTimersByTimeAsync(1100);
        const result = await promise;

        expect(result.data).toEqual({ ok: true });
        expect(callCount).toBe(2);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
        vi.useRealTimers();
      }
    });

    it('gives up after MAX_RETRY_ATTEMPTS on 429', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue('token');

      const originalAdapter = apiClient.defaults.adapter;
      let callCount = 0;
      apiClient.defaults.adapter = async (config) => {
        callCount++;
        throw new axios.AxiosError('Too Many Requests', '429', config as never, undefined, {
          status: 429,
          data: {},
          statusText: 'Too Many Requests',
          headers: {},
          config: config as never,
        });
      };

      try {
        vi.useFakeTimers();
        const promise = apiClient.get('/test').catch((e: Error) => e);
        for (let i = 0; i < 10; i++) {
          await vi.advanceTimersByTimeAsync(1000);
        }
        const error = await promise;
        expect(error).toBeInstanceOf(Error);
        expect(callCount).toBe(4);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
        vi.useRealTimers();
      }
    });
  });

  describe('retry replay policy (isIdempotentMethod)', () => {
    // 5xx/network retries replay the original request; only idempotent methods
    // are safe to replay (a lost-response 500 may have processed a mutation).
    it('replays GET/HEAD/OPTIONS', () => {
      expect(isIdempotentMethod('GET')).toBe(true);
      expect(isIdempotentMethod('get')).toBe(true);
      expect(isIdempotentMethod('HEAD')).toBe(true);
      expect(isIdempotentMethod('OPTIONS')).toBe(true);
      // Axios defaults to GET when no method is set.
      expect(isIdempotentMethod(undefined)).toBe(true);
    });

    it('never replays mutating methods', () => {
      expect(isIdempotentMethod('POST')).toBe(false);
      expect(isIdempotentMethod('PUT')).toBe(false);
      expect(isIdempotentMethod('PATCH')).toBe(false);
      expect(isIdempotentMethod('DELETE')).toBe(false);
    });
  });

  describe('response interceptor - error message extraction', () => {
    it('reads the message of the error envelope', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Server Error', '404', undefined, undefined, {
        status: 404,
        data: { error: { code: 'TOUR_NOT_FOUND', message: 'Tour not found' } },
        statusText: 'Not Found',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow('Tour not found');
    });

    it('lists the field errors of a 422 from details.fields', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Unprocessable', '422', undefined, undefined, {
        status: 422,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: {
              fields: [
                {
                  field: 'body.title',
                  msg: 'String should have at most 255 characters',
                  type: 'string_too_long',
                },
              ],
            },
          },
        },
        statusText: 'Unprocessable Entity',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(
        'title: String should have at most 255 characters'
      );
    });

    it('does not read the legacy {detail} body', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('', '500', undefined, undefined, {
        status: 500,
        data: { detail: 'Custom error message' },
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;
      error.message = '';

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.GENERIC);
    });

    it('extracts error from error.message object', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Server Error', '500', undefined, undefined, {
        status: 500,
        data: { error: { message: 'Internal error' } },
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow('Internal error');
    });

    it('falls back to generic error message', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('', '500', undefined, undefined, {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;
      error.message = '';

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.GENERIC);
    });

    it('uses axios error.message as fallback', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Network Error', 'ERR_NETWORK');
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow('Network Error');
    });
  });

  describe('extractData', () => {
    it('extracts data from response', () => {
      const result = extractData({ data: { id: '1', name: 'Test' } });
      expect(result).toEqual({ id: '1', name: 'Test' });
    });

    it('works with array data', () => {
      const result = extractData({ data: [1, 2, 3] });
      expect(result).toEqual([1, 2, 3]);
    });

    it('works with null data', () => {
      const result = extractData({ data: null });
      expect(result).toBeNull();
    });
  });
});
