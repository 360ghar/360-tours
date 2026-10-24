/**
 * Route-mocked authentication for hermetic E2E specs (no backend, no real
 * Supabase credentials).
 *
 * Approach: install a fake Supabase session into localStorage BEFORE the app
 * boots (`page.addInitScript`). supabase-js restores the session on startup
 * (storage key STORAGE_KEYS.AUTH_TOKENS) and the Axios interceptor attaches
 * the fake Bearer token. The fake access token is a structurally valid JWT
 * with a future `exp`, so supabase-js treats the session as live and never
 * attempts a network refresh. The backend API routes the page under test
 * needs are stubbed with `page.route()`.
 *
 * Usage:
 *   test.beforeEach(async ({ page }) => {
 *     await installMockAuth(page);
 *     await page.route('**' + '/api/v1/tours', route => ...);
 *   });
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page } from '@playwright/test';

/**
 * Resolve STORAGE_KEYS.AUTH_TOKENS from the app source so the fixture can
 * never drift from the real key. (The barrel export pulls in env-dependent
 * modules, so we read the constant file directly.)
 */
function resolveAuthStorageKey(): string {
  const fixtureDir = dirname(fileURLToPath(import.meta.url));
  const queryKeysPath = join(fixtureDir, '../../src/constants/queryKeys.ts');
  const match = readFileSync(queryKeysPath, 'utf8').match(/AUTH_TOKENS:\s*'([^']+)'/);
  if (!match) {
    throw new Error(`Could not resolve AUTH_TOKENS storage key from ${queryKeysPath}`);
  }
  return match[1];
}

export const AUTH_TOKENS_STORAGE_KEY = resolveAuthStorageKey();

/** `GET /users/me` (SelfUser): the id is an integer. */
export interface MockStaffUser {
  id: number;
  supabase_user_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  role: 'user' | 'agent' | 'admin';
  profile_image_url: string | null;
  preferences: Record<string, unknown>;
  notification_settings: Record<string, boolean>;
  privacy_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const MOCK_STAFF_USER: MockStaffUser = {
  id: 1,
  supabase_user_id: 'e2e-supabase-user',
  email: 'e2e@example.com',
  full_name: 'E2E Test User',
  is_active: true,
  is_verified: true,
  role: 'agent',
  profile_image_url: null,
  preferences: {},
  notification_settings: {
    push_notifications: true,
    email_notifications: true,
    sms_notifications: false,
    promotional_emails: false,
  },
  privacy_settings: {},
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/** Structurally valid HS256-shaped JWT with a future `exp` claim. */
export function fakeJwt(expiresInSeconds = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = Buffer.from(
    JSON.stringify({ sub: 'e2e-supabase-user', role: 'authenticated', exp })
  ).toString('base64url');
  return `${header}.${payload}.e2e-signature`;
}

/**
 * Seed the fake Supabase session and stub `GET /api/v1/users/me` (the only
 * request the auth bootstrap makes). Call before `page.goto(...)`.
 */
export async function installMockAuth(
  page: Page,
  user: MockStaffUser = MOCK_STAFF_USER
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  await page.addInitScript(
    ({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
    {
      storageKey: AUTH_TOKENS_STORAGE_KEY,
      session: {
        access_token: fakeJwt(),
        refresh_token: fakeJwt(),
        expires_in: 3600,
        expires_at: expiresAt,
        token_type: 'bearer',
        user: {
          id: user.supabase_user_id,
          email: user.email,
          role: 'authenticated',
        },
      },
    }
  );

  await page.route('**/api/v1/users/me', route => {
    void route.fulfill({ json: user, status: 200 });
  });
}

/** A list route answers a CursorPage; `total` is null unless `include_total` is sent. */
export function cursorPage<T>(items: T[], limit = 20) {
  return { items, next_cursor: null, has_more: false, limit, total: null };
}

/** Tour payload with the keys the pages under test read (`Tour`, integer `user_id`). */
export const MOCK_TOUR = {
  id: 'tour-1',
  user_id: 1,
  title: 'E2E Tour',
  description: null,
  status: 'draft',
  is_public: false,
  visibility: 'private',
  short_code: null,
  is_featured: false,
  settings: {},
  thumbnail_url: null,
  view_count: 0,
  like_count: 0,
  share_count: 0,
  scene_count: 2,
  main_scene_id: 'scene-1',
  floor_plans: [] as unknown[],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/** Minimal Scene-shaped payloads for the editor. */
export const MOCK_SCENES = [
  {
    id: 'scene-1',
    tour_id: 'tour-1',
    title: 'Living Room',
    image_url: 'https://example.com/living-room.jpg',
    order_index: 0,
    scene_metadata: null,
    is_processed: true,
    processing_error: null,
    hotspots: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'scene-2',
    tour_id: 'tour-1',
    title: 'Kitchen',
    image_url: 'https://example.com/kitchen.jpg',
    order_index: 1,
    scene_metadata: null,
    is_processed: true,
    processing_error: null,
    hotspots: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];

/** `POST /api/v1/upload` answers 201 with an UploadResult. */
export const MOCK_UPLOAD_RESPONSE = {
  file_path: '/tour_original/e2e.png',
  public_url: 'https://example.com/e2e-scene.png',
  file_type: 'image',
  file_size: 1,
  content_type: 'image/png',
  original_filename: 'e2e.png',
  media: null,
};

/** 1x1 PNG — tiny but valid, passes image validation. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
