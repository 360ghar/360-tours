/**
 * E2E tests for the public tour viewer.
 *
 * Runs hermetically in the `chromium` project: the backend API is stubbed
 * with `page.route()` and panorama images are fulfilled with a tiny valid
 * PNG, so every assertion is deterministic — no real backend, no network.
 *
 * The previous version of this spec asserted `expect(body).toBeVisible()`
 * (vacuous — always true), so it could not catch viewer regressions.
 */
import { test, expect, type Page } from '@playwright/test';
import { installMockAuth, MOCK_TOUR, TINY_PNG } from './fixtures/mockAuth';

const TOUR_ID = 'test-tour-id';

/** Hotspot fixture helper (full `Hotspot` shape as consumed by the viewer). */
function hotspot(overrides: Record<string, unknown>) {
  return {
    id: 'hs-missing',
    scene_id: 'scene-1',
    type: 'info',
    position: { yaw: 0, pitch: 0 },
    target_scene_id: null,
    title: null,
    description: null,
    icon: null,
    icon_name: null,
    icon_color: null,
    icon_size: 32,
    content: null,
    custom_data: {},
    order_index: 0,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

const SCENE_LIVING = {
  id: 'scene-1',
  tour_id: TOUR_ID,
  title: 'Living Room',
  image_url: 'https://example.com/living-room.jpg',
  order_index: 0,
  hotspots: [
    hotspot({
      id: 'hs-info-1',
      scene_id: 'scene-1',
      type: 'info',
      title: 'About this room',
      content: { text: 'Sunny corner room with a fireplace' },
    }),
    hotspot({
      id: 'hs-nav-1',
      scene_id: 'scene-1',
      type: 'navigation',
      title: 'Go to Kitchen',
      target_scene_id: 'scene-2',
      position: { yaw: 45, pitch: 0 },
    }),
  ],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const SCENE_KITCHEN = {
  id: 'scene-2',
  tour_id: TOUR_ID,
  title: 'Kitchen',
  image_url: 'https://example.com/kitchen.jpg',
  order_index: 1,
  hotspots: [
    hotspot({
      id: 'hs-kitchen',
      scene_id: 'scene-2',
      type: 'info',
      title: 'Kitchen tip',
      content: { text: 'New quartz countertops' },
    }),
  ],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

async function mockPublicTourApi(
  page: Page,
  { tourStatus = 200, tour }: { tourStatus?: number; tour?: unknown } = {}
) {
  // The public tour payload (scenes are embedded per the public API).
  await page.route(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`), route => {
    if (tourStatus !== 200) {
      void route.fulfill({ status: tourStatus, body: '{}' });
      return;
    }
    void route.fulfill({
      json:
        tour ??
        ({
          ...MOCK_TOUR,
          id: TOUR_ID,
          status: 'published',
          visibility: 'public',
          like_count: 12,
          floor_plans: [],
          main_scene_id: 'scene-1',
          scenes: [SCENE_LIVING, SCENE_KITCHEN],
        } as object),
      status: 200,
    });
  });

  // Analytics events: accepted, never asserted.
  await page.route(new RegExp(`/public/tours/${TOUR_ID}/events(\\?.*)?$`), route =>
    route.fulfill({ status: 204 })
  );

  // Panorama / thumbnail images: fulfill with a tiny valid PNG so the
  // photo-sphere-viewer texture actually loads and markers render.
  await page.route(/\.(jpg|jpeg|png|webp)(\\?.*)?$/i, route =>
    route.fulfill({ body: TINY_PNG, contentType: 'image/png', status: 200 })
  );
}


test.describe('Public Tour Viewer — hermetic (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    // Fake session so the app boots deterministically without real Supabase.
    await installMockAuth(page);
    mockPublicTourApi(page);
  });

  test('renders the tour title, the viewer canvas, and scene markers', async ({ page }) => {
    await page.goto(`/view/${TOUR_ID}`);

    await expect(page.getByRole('heading', { name: 'E2E Tour' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
    // The first scene's markers render once the viewer is ready.
    await expect(page.locator('[data-marker-id="hs-info-1"]')).toBeVisible({ timeout: 15000 });
  });

  test('opens the content modal when an info hotspot is clicked', async ({ page }) => {
    await page.goto(`/view/${TOUR_ID}`);

    const marker = page.locator('[data-marker-id="hs-info-1"]');
    await marker.click({ timeout: 15000 });

    await expect(page.getByRole('heading', { name: 'About this room' })).toBeVisible();
    await expect(page.getByText('Sunny corner room with a fireplace')).toBeVisible();
  });

  test('navigates to the target scene when a navigation hotspot is clicked', async ({ page }) => {
    await page.goto(`/view/${TOUR_ID}`);

    // The Kitchen scene's marker must not exist until we navigate to it.
    await expect(page.locator('[data-marker-id="hs-kitchen"]')).toHaveCount(0, {
      timeout: 15000,
    });

    await page.locator('[data-marker-id="hs-nav-1"]').click({ timeout: 15000 });

    // Kitchen marker appears => the viewer actually switched scenes.
    await expect(page.locator('[data-marker-id="hs-kitchen"]')).toBeVisible({ timeout: 15000 });
  });

  test('shows the like count from the tour payload and takes the new count from the like answer', async ({
    page,
  }) => {
    // The public tour has no per-viewer liked flag; POST /like answers {like_count}.
    await page.route(new RegExp(`/public/tours/${TOUR_ID}/like(\\?.*)?$`), route =>
      route.fulfill({ json: { like_count: 13 }, status: 200 })
    );
    await page.goto(`/view/${TOUR_ID}`);

    const likeButton = page.getByRole('button', { name: 'Like this tour' });
    await expect(likeButton).toBeVisible({ timeout: 15000 });
    await expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    await expect(likeButton).toContainText('12');

    await likeButton.click();

    const liked = page.getByRole('button', { name: 'Unlike this tour' });
    await expect(liked).toBeVisible({ timeout: 15000 });
    await expect(liked).toHaveAttribute('aria-pressed', 'true');
    await expect(liked).toContainText('13');
  });

  test('shows Tour Not Found for a missing tour (404)', async ({ page }) => {
    // Re-stub just the tour route with a 404; the other routes stay mocked.
    await page.unroute(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`));
    await page.route(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`), route =>
      route.fulfill({ status: 404, body: '{}' })
    );

    await page.goto(`/view/${TOUR_ID}`);

    await expect(page.getByText('Tour Not Found')).toBeVisible({ timeout: 15000 });
  });

  test('does not treat a draft payload as a playable public tour', async ({ page }) => {
    await page.unroute(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`));
    await page.route(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`), route =>
      route.fulfill({
        json: {
          ...MOCK_TOUR,
          id: TOUR_ID,
          status: 'draft',
          visibility: 'private',
          scenes: [SCENE_LIVING, SCENE_KITCHEN],
        },
        status: 200,
      })
    );

    await page.goto(`/view/${TOUR_ID}`);

    await expect(page.getByText('Tour Not Found')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="panorama-viewer"]')).toHaveCount(0);
  });

  test('distinguishes server failures from 404 and retries', async ({ page }) => {
    await page.unroute(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`));
    await page.route(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`), route =>
      route.fulfill({ status: 500, body: '{}' })
    );

    await page.goto(`/view/${TOUR_ID}`);

    // A 500 is NOT "tour not found" — a retryable error screen is shown.
    await expect(page.getByText("Couldn't load this tour")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Tour Not Found')).toHaveCount(0);

    // Fix the backend and retry: the tour loads without a reload.
    await page.unroute(new RegExp(`/public/tours/${TOUR_ID}(\\?.*)?$`));
    mockPublicTourApi(page);

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Tour' })).toBeVisible({ timeout: 15000 });
  });
});

/**
 * Public routes must render without waiting on the auth bootstrap.
 *
 * The router used to be gated on `authStore.isLoading`, so a slow or failing
 * `GET /users/me` blanked the public viewer (and the embedded iframe) for the
 * whole retry window even though those routes are anonymous by contract.
 */
test.describe('Public viewer is independent of the auth bootstrap', () => {
  test.beforeEach(async ({ page }) => {
    await installMockAuth(page);
    mockPublicTourApi(page);

    // Stall the profile fetch that checkAuth awaits. Registered last, so it
    // takes precedence over the fixture's own /users/me handler.
    await page.route('**/api/v1/users/me', async route => {
      await new Promise(resolve => setTimeout(resolve, 30_000));
      await route.abort();
    });
  });

  test('renders /view/:id while checkAuth is still in flight', async ({ page }) => {
    await page.goto(`/view/${TOUR_ID}`);

    await expect(page.getByRole('heading', { name: 'E2E Tour' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  });

  test('renders /embed/:id while checkAuth is still in flight', async ({ page }) => {
    await page.goto(`/embed/${TOUR_ID}`);

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-marker-id="hs-info-1"]')).toBeVisible({ timeout: 15000 });
  });
});

/**
 * The embed's outbound messages are the contract the Flutter WebView and
 * public/embed.js consume. Loaded top-level (window.parent === window) the page
 * posts to itself, so an in-page listener can observe the same payloads.
 */
test.describe('Embed outbound messages', () => {
  test.beforeEach(async ({ page }) => {
    await installMockAuth(page);
    mockPublicTourApi(page);
    await page.addInitScript(() => {
      (window as unknown as { __embedMessages: unknown[] }).__embedMessages = [];
      window.addEventListener('message', event => {
        const data = event.data as { type?: string } | null;
        if (data && typeof data.type === 'string') {
          (window as unknown as { __embedMessages: unknown[] }).__embedMessages.push(data);
        }
      });
    });
  });

  test('posts ready with the opening scene, then sceneChange on navigation', async ({ page }) => {
    await page.goto(`/embed/${TOUR_ID}`);
    await expect(page.locator('[data-marker-id="hs-nav-1"]')).toBeVisible({ timeout: 15000 });

    const ready = await page.waitForFunction(
      () =>
        (window as unknown as { __embedMessages: { type: string }[] }).__embedMessages.find(
          m => m.type === 'ready'
        ),
      undefined,
      { timeout: 15000 }
    );
    expect(await ready.jsonValue()).toMatchObject({
      type: 'ready',
      tourId: TOUR_ID,
      data: { sceneCount: 2, currentSceneId: 'scene-1' },
    });

    await page.locator('[data-marker-id="hs-nav-1"]').click();

    const sceneChange = await page.waitForFunction(
      () =>
        (window as unknown as { __embedMessages: { type: string; data?: { sceneId?: string } }[] })
          .__embedMessages.find(m => m.type === 'sceneChange' && m.data?.sceneId === 'scene-2'),
      undefined,
      { timeout: 15000 }
    );
    expect(await sceneChange.jsonValue()).toMatchObject({ type: 'sceneChange' });
  });

  test('honors ?scene= as the opening scene in ready', async ({ page }) => {
    await page.goto(`/embed/${TOUR_ID}?scene=scene-2`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });

    const ready = await page.waitForFunction(
      () =>
        (window as unknown as { __embedMessages: { type: string }[] }).__embedMessages.find(
          m => m.type === 'ready'
        ),
      undefined,
      { timeout: 15000 }
    );
    expect(await ready.jsonValue()).toMatchObject({
      data: { currentSceneId: 'scene-2' },
    });
  });
});
