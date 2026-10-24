import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    getTokens: vi.fn(() => null),
  },
}));

import { captureApi } from '@/api/capture';
import { uploadApi } from '@/api/upload';
import { API_BASE_URL } from '@/constants';

interface Captured {
  method: string;
  path: string;
  body: unknown;
}
const captured: Captured[] = [];

async function record(request: Request): Promise<Captured> {
  const url = new URL(request.url);
  const entry: Captured = { method: request.method, path: `${url.pathname}${url.search}`, body: undefined };
  if (request.body) {
    entry.body = await request.json();
  }
  captured.push(entry);
  return entry;
}

const base = new URL(API_BASE_URL).pathname.replace(/\/$/, '');

const server = setupServer(
  http.patch(`${API_BASE_URL}/capture-sessions/:id`, async ({ request, params }) => {
    const { body } = await record(request);
    return HttpResponse.json({ id: params.id, status: (body as { status: string }).status });
  }),
  http.post(`${API_BASE_URL}/capture-sessions/:id/complete`, async ({ request, params }) => {
    await record(request);
    return HttpResponse.json({ id: params.id, status: 'ready' });
  }),
  http.post(`${API_BASE_URL}/upload/media/batch-delete`, async ({ request }) => {
    const { body } = await record(request);
    const ids = (body as { media_ids: string[] }).media_ids;
    return HttpResponse.json({ deleted: ids, failed: [], storage_warnings: [] });
  }),
  http.get(`${API_BASE_URL}/upload/media`, async ({ request }) => {
    const url = new URL(request.url);
    captured.push({ method: 'GET', path: `${url.pathname}${url.search}`, body: undefined });
    return HttpResponse.json({ items: [], next_cursor: null, has_more: false, limit: 24, total: null });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  captured.length = 0;
});

describe('captureApi', () => {
  it('moves a session with PATCH {status} only', async () => {
    await captureApi.moveSession('sess-1', 'capturing');

    expect(captured[0].method).toBe('PATCH');
    expect(captured[0].path).toBe(`${base}/capture-sessions/sess-1`);
    expect(captured[0].body).toEqual({ status: 'capturing' });
  });

  it('reports a failure as status failed with the reason (kept only with failed)', async () => {
    await captureApi.failSession('sess-1', 'Upload unavailable');

    expect(captured[0].body).toEqual({ status: 'failed', error_message: 'Upload unavailable' });
  });

  it('cuts an error message to fit the 2000 character limit', async () => {
    await captureApi.failSession('sess-1', 'x'.repeat(5000));

    const body = captured[0].body as { error_message: string };
    expect(body.error_message.length).toBeLessThanOrEqual(2000);
  });

  it('completes a session with POST /complete', async () => {
    const session = await captureApi.completeSession('sess-1');

    expect(captured[0].path).toBe(`${base}/capture-sessions/sess-1/complete`);
    expect(session.status).toBe('ready');
  });
});

describe('uploadApi.deleteMediaFiles', () => {
  it('uses POST /upload/media/batch-delete and cuts the ids into groups of at most 50', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`);

    const result = await uploadApi.deleteMediaFiles(ids);

    expect(result.deleted).toHaveLength(120);
    expect(captured).toHaveLength(3);
    expect(captured.map(c => (c.body as { media_ids: string[] }).media_ids.length)).toEqual([
      50, 50, 20,
    ]);
    expect(captured[0].path).toBe(`${base}/upload/media/batch-delete`);
  });

  it('rejects when the server reports ids it could not delete, and the error carries the result', async () => {
    server.use(
      http.post(`${API_BASE_URL}/upload/media/batch-delete`, () =>
        HttpResponse.json({ deleted: ['a'], failed: ['b'], storage_warnings: ['c'] })
      )
    );

    await expect(uploadApi.deleteMediaFiles(['a', 'b', 'c'])).rejects.toMatchObject({
      result: { deleted: ['a'], failed: ['b'], storage_warnings: ['c'] },
    });
  });
});

describe('uploadApi.getMediaFiles', () => {
  it('sends the search term, the cursor and a limit of at most 100; never the removed folder key', async () => {
    await uploadApi.getMediaFiles({ search: 'living', cursor: 'abc', limit: 500, visibility: 'public' });

    const query = new URL(`http://x${captured[0].path}`).searchParams;
    expect(query.get('search')).toBe('living');
    expect(query.get('cursor')).toBe('abc');
    expect(query.get('limit')).toBe('100');
    expect(query.get('visibility')).toBe('public');
    expect(query.has('folder')).toBe(false);
  });

  it('leaves an unset cursor out of the query', async () => {
    await uploadApi.getMediaFiles({ cursor: null, limit: 24 });

    const query = new URL(`http://x${captured[0].path}`).searchParams;
    expect(query.has('cursor')).toBe(false);
    expect(query.get('limit')).toBe('24');
  });
});
