import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * public/sw.js keeps a cache that outlives sign-out. Account data must never
 * enter it: the backend marks account responses `private, no-store`.
 */
const SOURCE = readFileSync(join(__dirname, '..', '..', '..', 'public', 'sw.js'), 'utf8');

type Headers = { get: (name: string) => string | null; has: (name: string) => boolean };

function headers(values: Record<string, string> = {}): Headers {
  const lower = Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    get: name => lower[name.toLowerCase()] ?? null,
    has: name => name.toLowerCase() in lower,
  };
}

function loadWorker(response: { ok: boolean; headers: Headers }) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const put = vi.fn();
  const caches = { open: vi.fn().mockResolvedValue({ put }), match: vi.fn(), keys: vi.fn() };
  const fetchStub = vi.fn().mockResolvedValue({ ...response, clone: () => response });
  const scope = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler;
    },
    location: { origin: 'https://app.test' },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  new Function('self', 'caches', 'fetch', 'Response', SOURCE)(scope, caches, fetchStub, {
    error: () => 'offline',
  });

  async function request(url: string, requestHeaders: Record<string, string> = {}) {
    const respondWith = vi.fn();
    handlers.fetch({
      request: { method: 'GET', url, mode: 'cors', headers: headers(requestHeaders) },
      respondWith,
    });
    if (respondWith.mock.calls.length > 0) await respondWith.mock.calls[0][0];
    return { respondWith, put, fetchStub };
  }
  return { request };
}

describe('service worker cache', () => {
  it('leaves same-origin API calls to the network', async () => {
    const { request } = loadWorker({ ok: true, headers: headers() });
    const { respondWith, put } = await request('https://app.test/api/v1/users/me');
    expect(respondWith).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('does not cache a request that carries a token', async () => {
    const { request } = loadWorker({ ok: true, headers: headers() });
    const { respondWith } = await request('https://app.test/data.json', {
      Authorization: 'Bearer token',
    });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it('does not cache a response marked no-store or private', async () => {
    for (const value of ['private, no-store', 'no-store', 'private']) {
      const { request } = loadWorker({ ok: true, headers: headers({ 'Cache-Control': value }) });
      const { put } = await request('https://app.test/data.json');
      expect(put).not.toHaveBeenCalled();
    }
  });

  it('caches a public static asset', async () => {
    const { request } = loadWorker({
      ok: true,
      headers: headers({ 'Cache-Control': 'public, max-age=31536000' }),
    });
    const { put } = await request('https://app.test/assets/app-1a2b3c.js');
    expect(put).toHaveBeenCalledTimes(1);
  });
});
