import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock data
export const mockUser = {
  id: 1,
  supabase_user_id: 'supabase-user-1',
  email: 'test@example.com',
  full_name: 'Test User',
  is_active: true,
  role: 'user',
  profile_image_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockTour = {
  id: 'tour-1',
  title: 'Test Tour',
  description: 'A test tour description',
  status: 'published',
  visibility: 'public',
  thumbnail_url: 'https://example.com/thumb.jpg',
  settings: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  owner_id: 'user-1',
};

export const mockScene = {
  id: 'scene-1',
  tour_id: 'tour-1',
  title: 'Test Scene',
  image_url: 'https://example.com/scene.jpg',
  order_index: 0,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockHotspot = {
  id: 'hotspot-1',
  scene_id: 'scene-1',
  type: 'navigation',
  title: 'Go to Living Room',
  yaw: 0,
  pitch: 0,
  target_scene_id: 'scene-2',
  style: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// API handlers
export const handlers = [
  // Users
  http.get('/api/v1/users/me', () => {
    return HttpResponse.json(mockUser);
  }),

  http.get('/api/v1/users/profile', () => {
    return HttpResponse.json(mockUser);
  }),

  http.put('/api/v1/users/me', () => {
    return HttpResponse.json(mockUser);
  }),

  // Tours
  http.get('/api/v1/tours', () => {
    return HttpResponse.json({
      items: [mockTour],
      next_cursor: null,
      has_more: false,
      limit: 20,
    });
  }),

  http.get('/api/v1/tours/:id', ({ params }) => {
    return HttpResponse.json({
      ...mockTour,
      id: params.id,
    });
  }),

  http.post('/api/v1/tours', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      ...mockTour,
      ...body,
      id: 'new-tour-id',
    });
  }),

  http.put('/api/v1/tours/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      ...mockTour,
      ...body,
      id: params.id,
    });
  }),

  http.delete('/api/v1/tours/:id', () => {
    return HttpResponse.json({ message: 'Deleted' });
  }),

  // Upload media (cursor pagination)
  http.get('/api/v1/upload/media', () => {
    return HttpResponse.json({
      items: [],
      next_cursor: null,
      has_more: false,
      limit: 24,
    });
  }),

  // AI jobs (cursor pagination)
  http.get('/api/v1/ai/jobs', () => {
    return HttpResponse.json({
      items: [],
      next_cursor: null,
      has_more: false,
      limit: 20,
    });
  }),

  // Scenes
  http.get('/api/v1/tours/:tourId/scenes', () => {
    return HttpResponse.json([mockScene]);
  }),

  http.post('/api/v1/tours/:tourId/scenes', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      ...mockScene,
      ...body,
      id: 'new-scene-id',
    });
  }),

  // Hotspots
  http.get('/api/v1/scenes/:sceneId/hotspots', () => {
    return HttpResponse.json([mockHotspot]);
  }),

  http.post('/api/v1/scenes/:sceneId/hotspots', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      ...mockHotspot,
      ...body,
      id: 'new-hotspot-id',
    });
  }),

  // Analytics
  http.get('/api/v1/analytics/dashboard', () => {
    return HttpResponse.json({
      total_tours: 10,
      total_views: 1000,
      total_scenes: 50,
      storage_used: 500 * 1024 * 1024,
    });
  }),

  http.get('/api/v1/analytics/tours/:id', () => {
    return HttpResponse.json({
      total_views: 100,
      unique_visitors: 50,
      avg_duration: 120,
      top_scenes: [],
    });
  }),
];

// Setup server
export const server = setupServer(...handlers);
