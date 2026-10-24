import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { makeHotspot, makeScene, makeTour } from '../fixtures';

/**
 * Handlers answer with the shapes in `openapi/openapi.json`: integer ids,
 * `CursorPage` lists, `scene_metadata`, 204 on delete, error envelope on failure.
 */

export const mockUser = {
  id: 1,
  supabase_user_id: 'supabase-user-1',
  email: 'test@example.com',
  full_name: 'Test User',
  is_active: true,
  is_verified: true,
  role: 'user',
  profile_image_url: null,
  preferences: {},
  notification_settings: {
    push_notifications: true,
    email_notifications: true,
    sms_notifications: false,
    promotional_emails: false,
  },
  privacy_settings: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockTour = makeTour({
  title: 'Test Tour',
  description: 'A test tour description',
  status: 'published',
  is_public: true,
  visibility: 'public',
  thumbnail_url: 'https://example.com/thumb.jpg',
  settings: {},
});

export const mockScene = makeScene({
  id: 'scene-1',
  title: 'Test Scene',
  image_url: 'https://example.com/scene.jpg',
  scene_metadata: {},
});

export const mockHotspot = makeHotspot({
  id: 'hotspot-1',
  type: 'navigation',
  title: 'Go to Living Room',
  position: { yaw: 0, pitch: 0 },
  target_scene_id: 'scene-2',
});

/** One page of a list route. `total` is null unless `include_total=true`. */
export function cursorPage<T>(items: T[], limit = 20) {
  return { items, next_cursor: null, has_more: false, limit, total: null };
}

export const handlers = [
  // Users
  http.get('/api/v1/users/me', () => HttpResponse.json(mockUser)),

  http.put('/api/v1/users/me', () => HttpResponse.json(mockUser)),

  // Tours
  http.get('/api/v1/tours', () => HttpResponse.json(cursorPage([mockTour]))),

  http.get('/api/v1/tours/:id', ({ params }) =>
    HttpResponse.json({
      ...mockTour,
      id: params.id,
      main_scene_id: null,
      scenes: [],
      floor_plans: [],
    })
  ),

  http.post('/api/v1/tours', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockTour, ...body, id: 'new-tour-id' }, { status: 201 });
  }),

  http.patch('/api/v1/tours/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockTour, ...body, id: params.id });
  }),

  http.delete('/api/v1/tours/:id', () => new HttpResponse(null, { status: 204 })),

  // Upload media (cursor pagination)
  http.get('/api/v1/upload/media', () => HttpResponse.json(cursorPage([], 24))),

  // Scenes
  http.get('/api/v1/tours/:tourId/scenes', () => HttpResponse.json(cursorPage([mockScene]))),

  http.post('/api/v1/tours/:tourId/scenes', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockScene, ...body, id: 'new-scene-id' }, { status: 201 });
  }),

  // Hotspots
  http.get('/api/v1/scenes/:sceneId/hotspots', () =>
    HttpResponse.json(cursorPage([mockHotspot]))
  ),

  http.post('/api/v1/scenes/:sceneId/hotspots', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockHotspot, ...body, id: 'new-hotspot-id' }, { status: 201 });
  }),

  // Dashboard and analytics
  http.get('/api/v1/dashboard/stats', () =>
    HttpResponse.json({
      total_tours: 10,
      published_tours: 4,
      total_views: 1000,
      total_scenes: 50,
      storage_used: 500 * 1024 * 1024,
      storage_limit: 5 * 1024 * 1024 * 1024,
    })
  ),

  http.get('/api/v1/tours/:id/analytics', ({ params }) =>
    HttpResponse.json({
      tour_id: params.id,
      total_views: 100,
      unique_views: 50,
      total_likes: 0,
      total_shares: 0,
      avg_session_duration: 120,
      scene_views: {},
      hotspot_clicks: {},
      share_breakdown: {},
      session_durations: [],
      device_breakdown: { desktop: 0, mobile: 0, tablet: 0, vr: 0 },
      country_breakdown: {},
      daily_views: [],
    })
  ),
];

// Setup server
export const server = setupServer(...handlers);
