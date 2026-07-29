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
import { mockTour, mockScene } from '../mocks/handlers';

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
      sceneIds.map((id, index) => ({
        ...mockScene,
        id,
        tour_id: params.tourId,
        order_index: index,
      }))
    );
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
    expect(captured[0].pathname).toBe('/api/v1/tours/tour-1');
    expect(captured[0].body).toEqual({ title: 'Patched Tour' });
  });

  it('updateScene uses PATCH /scenes/{id}', async () => {
    const result = await toursApi.updateScene('scene-1', { title: 'Patched Scene' });

    expect(result.id).toBe('scene-1');
    expect(result.title).toBe('Patched Scene');

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('PATCH');
    expect(captured[0].pathname).toBe('/api/v1/scenes/scene-1');
    expect(captured[0].body).toEqual({ title: 'Patched Scene' });
  });

  it('reorderScenes uses POST /tours/{tourId}/scenes/reorder with scene_ids body', async () => {
    const result = await toursApi.reorderScenes('tour-1', ['scene-2', 'scene-1']);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('scene-2');
    expect(result[0].order_index).toBe(0);
    expect(result[1].id).toBe('scene-1');
    expect(result[1].order_index).toBe(1);

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('POST');
    expect(captured[0].pathname).toBe('/api/v1/tours/tour-1/scenes/reorder');
    expect(captured[0].body).toEqual({ scene_ids: ['scene-2', 'scene-1'] });
  });
});
