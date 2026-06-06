import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import axios from 'axios';

vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    getAccessToken: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  },
}));

import apiClient, { extractData, onAuthExpired } from '@/api/client';
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
  });

  describe('response interceptor - 401 handling', () => {
    it('attempts token refresh on 401, then signs out if refresh returns null', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue(null);
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
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.SESSION_EXPIRED);
      expect(supabaseAuth.getAccessToken).toHaveBeenCalled();
      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('signs out on 401 when token retry limit is exceeded', async () => {
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
        headers: new axios.AxiosHeaders(),
        url: '/test',
        _tokenRetryCount: 1,
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.SESSION_EXPIRED);
      expect(supabaseAuth.signOut).toHaveBeenCalled();
    });

    it('notifies auth expired listeners on 401 failure', async () => {
      (supabaseAuth.getAccessToken as Mock).mockResolvedValue(null);
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
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow(ERROR_MESSAGES.SESSION_EXPIRED);
      expect(listener).toHaveBeenCalled();

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

  describe('response interceptor - error message extraction', () => {
    it('extracts error from detail string', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Server Error', '500', undefined, undefined, {
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

      await expect(interceptor.rejected(error)).rejects.toThrow('Custom error message');
    });

    it('extracts error from detail.message object', async () => {
      const interceptor = getResponseInterceptor();

      const error = new axios.AxiosError('Server Error', '500', undefined, undefined, {
        status: 500,
        data: { detail: { code: 'VALIDATION_ERROR', message: 'Title is required' } },
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: new axios.AxiosHeaders() } as never,
      });
      error.config = {
        headers: new axios.AxiosHeaders(),
        url: '/test',
      } as never;

      await expect(interceptor.rejected(error)).rejects.toThrow('Title is required');
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
