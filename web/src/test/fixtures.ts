/**
 * Wire-shaped fixtures for tests. Each builder returns a payload as the backend
 * sends it (see `openapi/openapi.json`): integer user ids, `scene_metadata`,
 * UTC timestamps with a `Z` suffix, `floor_plans` on the tour, `icon_size` and
 * `custom_data` never null.
 */
import type {
  FloorPlan,
  Hotspot,
  PublicScene,
  PublicTour,
  Scene,
  Tour,
  TourWithScenes,
  User,
} from '@/types';

export const FIXTURE_TIME = '2024-01-01T00:00:00Z';

export function makeHotspot(overrides: Partial<Hotspot> = {}): Hotspot {
  return {
    id: 'hotspot-1',
    scene_id: 'scene-1',
    type: 'info',
    position: { yaw: 0, pitch: 0 },
    target_scene_id: null,
    title: 'Test Hotspot',
    description: null,
    icon: null,
    icon_name: null,
    icon_color: null,
    icon_size: 32,
    content: null,
    custom_data: {},
    order_index: 0,
    is_active: true,
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    ...overrides,
  };
}

export function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    tour_id: 'tour-1',
    title: 'Scene 1',
    description: null,
    image_url: 'https://example.com/scene1.jpg',
    thumbnail_url: null,
    vr_url: null,
    order_index: 0,
    scene_metadata: null,
    is_processed: true,
    processing_error: null,
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    hotspots: [],
    ...overrides,
  };
}

export function makePublicScene(overrides: Partial<PublicScene> = {}): PublicScene {
  return {
    id: 'scene-1',
    tour_id: 'tour-1',
    title: 'Scene 1',
    description: null,
    image_url: 'https://example.com/scene1.jpg',
    thumbnail_url: null,
    vr_url: null,
    order_index: 0,
    scene_metadata: null,
    is_processed: true,
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    hotspots: [],
    ...overrides,
  };
}

export function makeFloorPlan(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: 'fp-1',
    tour_id: 'tour-1',
    name: 'Ground floor',
    image_url: 'https://example.com/fp-1.png',
    floor_number: 1,
    markers: [],
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    ...overrides,
  };
}

/** A tour row as `GET /tours` and the mutation routes return it (no scenes). */
export function makeTour(overrides: Partial<Tour> = {}): Tour {
  return {
    id: 'tour-1',
    user_id: 1,
    title: 'Test Tour',
    description: null,
    status: 'draft',
    is_public: false,
    visibility: 'private',
    short_code: null,
    is_featured: false,
    view_count: 0,
    like_count: 0,
    share_count: 0,
    settings: null,
    thumbnail_url: null,
    published_at: null,
    archived_at: null,
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    deleted_at: null,
    ...overrides,
  };
}

/** `GET /tours/{id}` for the owner. */
export function makeTourWithScenes(overrides: Partial<TourWithScenes> = {}): TourWithScenes {
  const scenes = overrides.scenes ?? [
    makeScene({ id: 'scene-1', order_index: 0, title: 'Scene 1' }),
    makeScene({ id: 'scene-2', order_index: 1, title: 'Scene 2' }),
  ];
  return {
    ...makeTour(),
    main_scene_id: scenes[0]?.id ?? null,
    floor_plans: [],
    ...overrides,
    scenes,
  };
}

/** `GET /public/tours/{id}`: no `user_id`. */
export function makePublicTour(overrides: Partial<PublicTour> = {}): PublicTour {
  const scenes = overrides.scenes ?? [makePublicScene()];
  return {
    id: 'tour-1',
    title: 'Public Tour',
    description: null,
    status: 'published',
    is_public: true,
    visibility: 'public',
    short_code: null,
    is_featured: false,
    view_count: 0,
    like_count: 0,
    share_count: 0,
    settings: null,
    thumbnail_url: null,
    published_at: FIXTURE_TIME,
    archived_at: null,
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    deleted_at: null,
    main_scene_id: scenes[0]?.id ?? null,
    floor_plans: [],
    ...overrides,
    scenes,
  };
}

/** `GET /users/me`: the id is an integer. */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    supabase_user_id: 'supabase-user-id',
    email: 'test@example.com',
    phone: '+1234567890',
    full_name: 'Test User',
    date_of_birth: null,
    profile_image_url: null,
    role: 'user',
    is_active: true,
    is_verified: true,
    preferences: {},
    notification_settings: {},
    privacy_settings: {},
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    ...overrides,
  };
}
