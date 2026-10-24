import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// The axios client's request interceptor reads the Supabase session;
// mock it so requests are deterministic in tests.
vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    getTokens: vi.fn(() => null),
  },
}));

import { toursApi } from '@/api/tours';
import { API_BASE_URL } from '@/constants';
import { cursorPage, mockTour, mockScene } from '../mocks/handlers';

/**
 * Backend contract regression tests.
 *
 * The backend exposes:
 *   PATCH /tours/{id}
 *   PATCH /scenes/{id}
 *   POST  /tours/{tourId}/scenes/reorder
 *
 * The handlers below are registered with EXACTLY those methods + paths and the
 * server runs with `onUnhandledRequest: 'error'`. If src/api/tours.ts ever
 * drifts to a different HTTP method or path, the request goes unhandled and
 * these tests fail.
 */

interface CapturedRequest {
  method: string;
  pathname: string;
  body: unknown;
}

const captured: CapturedRequest[] = [];

// The axios client targets `API_BASE_URL` (env-dependent: CI default
// http://localhost:3600/api/v1, but local shells may export a different
// VITE_API_BASE_URL — e.g. http://localhost:8000 with no /api/v1 prefix).
// The msw handlers above pin the exact full URL against API_BASE_URL, so the
// pathname assertions below derive the expected base path from it instead of
// hardcoding '/api/v1' (which broke local runs where the base has no suffix).
const apiBasePath = new URL(API_BASE_URL).pathname.replace(/\/$/, '');

async function capture(request: Request): Promise<CapturedRequest> {
  const entry: CapturedRequest = {
    method: request.method,
    pathname: new URL(request.url).pathname,
    body: request.body ? await request.json() : undefined,
  };
  captured.push(entry);
  return entry;
}

const server = setupServer(
  http.patch(`${API_BASE_URL}/tours/:id`, async ({ request, params }) => {
    const { body } = await capture(request);
    return HttpResponse.json({
      ...mockTour,
      ...(body as Record<string, unknown>),
      id: params.id,
    });
  }),

  http.patch(`${API_BASE_URL}/scenes/:id`, async ({ request, params }) => {
    const { body } = await capture(request);
    return HttpResponse.json({
      ...mockScene,
      ...(body as Record<string, unknown>),
      id: params.id,
    });
  }),

  http.post(`${API_BASE_URL}/tours/:tourId/scenes/reorder`, async ({ request, params }) => {
    const { body } = await capture(request);
    const sceneIds = (body as { scene_ids: string[] }).scene_ids;
    return HttpResponse.json(
      cursorPage(
        sceneIds.map((id, index) => ({
          ...mockScene,
          id,
          tour_id: params.tourId,
          order_index: index,
        }))
      )
    );
  }),

  // A list is a CursorPage: the second request carries the cursor of the first answer.
  http.get(`${API_BASE_URL}/tours`, async ({ request }) => {
    const url = new URL(request.url);
    captured.push({ method: 'GET', pathname: `${url.pathname}${url.search}`, body: undefined });
    const cursor = url.searchParams.get('cursor');
    if (cursor === 'page-2') {
      return HttpResponse.json({
        items: [{ ...mockTour, id: 'tour-3' }],
        next_cursor: null,
        has_more: false,
        limit: 100,
        total: null,
      });
    }
    return HttpResponse.json({
      items: [
        { ...mockTour, id: 'tour-1' },
        { ...mockTour, id: 'tour-2' },
      ],
      next_cursor: 'page-2',
      has_more: true,
      limit: 100,
      total: null,
    });
  }),

  http.post(`${API_BASE_URL}/tours`, async ({ request }) => {
    const { body } = await capture(request);
    return HttpResponse.json({ ...mockTour, ...(body as Record<string, unknown>) }, { status: 201 });
  }),

  http.delete(`${API_BASE_URL}/tours/:id`, async ({ request }) => {
    await capture(request);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE_URL}/tours/:id/heatmap`, async ({ request, params }) => {
    const url = new URL(request.url);
    captured.push({ method: 'GET', pathname: `${url.pathname}${url.search}`, body: undefined });
    return HttpResponse.json({
      tour_id: params.id,
      heatmap: [
        { scene_id: 'scene-1', yaw: 10, pitch: -5, intensity: 1, count: 3 },
        { scene_id: 'scene-2', yaw: 20, pitch: 0, intensity: 0.4, count: 1 },
      ],
    });
  }),

  http.post(`${API_BASE_URL}/public/tours/:id/events`, async ({ request }) => {
    await capture(request);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_BASE_URL}/public/tours/:id/like`, async ({ request }) => {
    await capture(request);
    return HttpResponse.json({ like_count: 4 });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  captured.length = 0;
});

describe('toursApi backend method contract', () => {
  it('updateTour uses PATCH /tours/{id}', async () => {
    const result = await toursApi.updateTour('tour-1', { title: 'Patched Tour' });

    expect(result.id).toBe('tour-1');
    expect(result.title).toBe('Patched Tour');

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('PATCH');
    expect(captured[0].pathname).toBe(`${apiBasePath}/tours/tour-1`);
    expect(captured[0].body).toEqual({ title: 'Patched Tour' });
  });

  it('updateScene uses PATCH /scenes/{id}', async () => {
    const result = await toursApi.updateScene('scene-1', { title: 'Patched Scene' });

    expect(result.id).toBe('scene-1');
    expect(result.title).toBe('Patched Scene');

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('PATCH');
    expect(captured[0].pathname).toBe(`${apiBasePath}/scenes/scene-1`);
    expect(captured[0].body).toEqual({ title: 'Patched Scene' });
  });

  it('reorderScenes uses POST /tours/{tourId}/scenes/reorder with scene_ids body', async () => {
    const result = await toursApi.reorderScenes('tour-1', ['scene-2', 'scene-1']);

    // The reorder answer is a CursorPage of the reordered scenes.
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe('scene-2');
    expect(result.items[0].order_index).toBe(0);
    expect(result.items[1].id).toBe('scene-1');
    expect(result.items[1].order_index).toBe(1);

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('POST');
    expect(captured[0].pathname).toBe(`${apiBasePath}/tours/tour-1/scenes/reorder`);
    expect(captured[0].body).toEqual({ scene_ids: ['scene-2', 'scene-1'] });
  });

  it('getAllTours follows next_cursor until has_more is false and asks for 100 per page', async () => {
    const tours = await toursApi.getAllTours({ status: 'published' });

    expect(tours.map(t => t.id)).toEqual(['tour-1', 'tour-2', 'tour-3']);
    expect(captured).toHaveLength(2);
    const first = new URL(`http://x${captured[0].pathname}`);
    expect(first.searchParams.get('limit')).toBe('100');
    expect(first.searchParams.get('status')).toBe('published');
    expect(first.searchParams.has('cursor')).toBe(false);
    const second = new URL(`http://x${captured[1].pathname}`);
    expect(second.searchParams.get('cursor')).toBe('page-2');
    expect(second.searchParams.get('status')).toBe('published');
  });

  it('getTours clamps the page size to the server maximum of 100', async () => {
    await toursApi.getTours({ limit: 500 });

    const query = new URL(`http://x${captured[0].pathname}`).searchParams;
    expect(query.get('limit')).toBe('100');
  });

  it('createTour posts the body it is given: no status of its own', async () => {
    await toursApi.createTour({ title: 'Loft', visibility: 'private' });

    expect(captured[0].method).toBe('POST');
    expect(captured[0].body).toEqual({ title: 'Loft', visibility: 'private' });
  });

  it('deleteTour answers 204 with no body', async () => {
    await expect(toursApi.deleteTour('tour-1')).resolves.toBeUndefined();
    expect(captured[0].method).toBe('DELETE');
  });

  it('getTourHeatmap reads the flat list, one point per scene cell', async () => {
    const data = await toursApi.getTourHeatmap('tour-1', { scene_id: 'scene-1' });

    expect(data.heatmap).toHaveLength(2);
    expect(data.heatmap[0]).toEqual({
      scene_id: 'scene-1',
      yaw: 10,
      pitch: -5,
      intensity: 1,
      count: 3,
    });
    expect(captured[0].pathname).toContain('scene_id=scene-1');
  });

  it('trackEvent posts the JSON body (204) and sends none of the old query keys', async () => {
    await toursApi.trackEvent('tour-1', {
      event_type: 'scene_view',
      scene_id: 'scene-1',
      session_id: 'session-1',
      event_data: { yaw: 12.5, pitch: -3 },
    });

    expect(captured[0].method).toBe('POST');
    expect(captured[0].pathname).toBe(`${apiBasePath}/public/tours/tour-1/events`);
    expect(captured[0].body).toEqual({
      event_type: 'scene_view',
      scene_id: 'scene-1',
      session_id: 'session-1',
      event_data: { yaw: 12.5, pitch: -3 },
    });
  });

  it('likePublicTour reads the like_count answer', async () => {
    await expect(toursApi.likePublicTour('tour-1')).resolves.toEqual({ like_count: 4 });
  });
});
