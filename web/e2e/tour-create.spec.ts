/**
 * E2E tests for the tour creation workflow.
 *
 * Runs hermetically in the `chromium` project: a fake Supabase session +
 * `page.route()` mocks stand in for auth and the backend, so the three-step
 * wizard and the upload pipeline actually complete. The unauthenticated test
 * asserts the real redirect behavior.
 */
import { test, expect } from '@playwright/test';
import {
  installMockAuth,
  MOCK_TOUR,
  MOCK_UPLOAD_RESPONSE,
  cursorPage,
  TINY_PNG,
} from './fixtures/mockAuth';

test.describe('Tour Creation — unauthenticated', () => {
  test('redirects unauthenticated visitors to /login', async ({ page }) => {
    await page.goto('/tours/create');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Tour Creation — hermetic (mocked auth + API)', () => {
  test.beforeEach(async ({ page }) => {
    await installMockAuth(page);
    await page.route('**/api/v1/tours', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ json: { ...MOCK_TOUR, id: 'new-tour-id' }, status: 201 });
      } else {
        await route.fulfill({
          json: cursorPage([], 12),
        });
      }
    });
    // Upload succeeds by default; individual tests override this route.
    await page.route('**/api/v1/upload', route =>
      route.fulfill({ json: MOCK_UPLOAD_RESPONSE, status: 201 })
    );
    await page.route(/\/api\/v1\/tours\/[^/]+\/scenes(\?.*)?$/, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          json: {
            id: 'scene-1',
            tour_id: 'new-tour-id',
            title: 'living-room',
            image_url: MOCK_UPLOAD_RESPONSE.public_url,
            order_index: 0,
            hotspots: [],
          },
          status: 201,
        });
      } else {
        await route.fulfill({ json: cursorPage([]) });
      }
    });
  });

  test('walks the three-step wizard: chooser → info → upload', async ({ page }) => {
    await page.goto('/tours/create');

    // Step 0 — chooser with the three creation paths.
    await expect(page.getByRole('heading', { name: 'Create New Tour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guided capture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload panoramas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI generate' })).toBeVisible();

    // Step 1 — tour info.
    await page.getByRole('button', { name: 'Upload panoramas' }).click();
    const titleInput = page.locator('input[name="title"]');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('E2E Create Test');

    // Step 2 — upload scenes (POST /tours is mocked).
    await page.getByRole('button', { name: 'Continue to Upload' }).click();
    await expect(page.getByRole('heading', { name: 'Upload 360° Images' })).toBeVisible();
  });

  test('uploads a file end-to-end and reaches Continue to Editor', async ({ page }) => {
    await page.goto('/tours/create');
    await page.getByRole('button', { name: 'Upload panoramas' }).click();
    await page.locator('input[name="title"]').fill('E2E Create Test');
    await page.getByRole('button', { name: 'Continue to Upload' }).click();
    await expect(page.getByRole('heading', { name: 'Upload 360° Images' })).toBeVisible();

    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'living-room.png', mimeType: 'image/png', buffer: TINY_PNG });
    await expect(page.getByText('living-room.png')).toBeVisible();

    // POST /upload + POST /tours/:id/scenes are mocked → the row completes.
    await page.getByRole('button', { name: 'Upload 1 Files' }).click();
    await expect(page.getByText('Uploaded')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Continue to Editor' })).toBeVisible();
  });

  test('blocks Continue to Editor when every upload fails, then recovers via Retry', async ({
    page,
  }) => {
    // 422 is not retried by the Axios interceptor, so the row errors instantly.
    let failUpload = true;
    await page.route('**/api/v1/upload', route => {
      if (failUpload) {
        return route.fulfill({
          status: 422,
          json: {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Mocked upload failure',
              details: { fields: [] },
            },
          },
        });
      }
      return route.fulfill({ json: MOCK_UPLOAD_RESPONSE, status: 201 });
    });

    await page.goto('/tours/create');
    await page.getByRole('button', { name: 'Upload panoramas' }).click();
    await page.locator('input[name="title"]').fill('E2E Create Test');
    await page.getByRole('button', { name: 'Continue to Upload' }).click();
    await expect(page.getByRole('heading', { name: 'Upload 360° Images' })).toBeVisible();

    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'living-room.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByRole('button', { name: 'Upload 1 Files' }).click();

    // All files failed → Continue is blocked with an inline warning + retry.
    await expect(page.getByText('Mocked upload failure')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No scenes were uploaded')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to Editor' })).toHaveCount(0);

    // Per-row Retry re-runs the upload for that file and unblocks Continue.
    failUpload = false;
    await page.getByRole('button', { name: 'Retry living-room.png' }).click();
    await expect(page.getByText('Uploaded')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Continue to Editor' })).toBeVisible();
  });

  test('rejects invalid file types; removing them still blocks Continue', async ({ page }) => {
    await page.goto('/tours/create');
    await page.getByRole('button', { name: 'Upload panoramas' }).click();
    await page.locator('input[name="title"]').fill('E2E Create Test');
    await page.getByRole('button', { name: 'Continue to Upload' }).click();
    await expect(page.getByRole('heading', { name: 'Upload 360° Images' })).toBeVisible();

    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await expect(page.getByText(/Invalid file type/)).toBeVisible();

    // A rejected file is never uploaded and cannot be retried; with zero
    // scenes the Continue button stays blocked.
    await expect(page.getByRole('button', { name: /Upload \d+ Files/ })).toHaveCount(0);
    await expect(page.getByText('No scenes were uploaded')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to Editor' })).toHaveCount(0);

    // Removing the invalid file still leaves zero scenes — Continue stays blocked.
    await page.getByRole('button', { name: 'Remove notes.txt' }).click();
    await expect(page.getByRole('button', { name: 'Continue to Editor' })).toHaveCount(0);
    await expect(
      page.getByText('Upload at least one JPEG, PNG, or WebP panorama to open the editor.')
    ).toBeVisible();
  });

  test('walks upload through to the editor after a successful scene create', async ({ page }) => {
    await page.route('**/api/v1/tours/new-tour-id', route =>
      route.fulfill({
        json: {
          ...MOCK_TOUR,
          id: 'new-tour-id',
          title: 'E2E Create Test',
          scenes: [
            {
              id: 'scene-1',
              tour_id: 'new-tour-id',
              title: 'living-room',
              image_url: MOCK_UPLOAD_RESPONSE.public_url,
              order_index: 0,
              hotspots: [],
            },
          ],
        },
        status: 200,
      })
    );
    await page.route(/\/api\/v1\/tours\/new-tour-id\/scenes(\?.*)?$/, route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: cursorPage([
            {
              id: 'scene-1',
              tour_id: 'new-tour-id',
              title: 'living-room',
              image_url: MOCK_UPLOAD_RESPONSE.public_url,
              order_index: 0,
              scene_metadata: null,
              is_processed: true,
              processing_error: null,
              hotspots: [],
            },
          ]),
          status: 200,
        });
      }
      return route.fallback();
    });
    await page.route(/\.(jpg|jpeg|png|webp)(\?.*)?$/i, route =>
      route.fulfill({ body: TINY_PNG, contentType: 'image/png', status: 200 })
    );

    await page.goto('/tours/create');
    await page.getByRole('button', { name: 'Upload panoramas' }).click();
    await page.locator('input[name="title"]').fill('E2E Create Test');
    await page.getByRole('button', { name: 'Continue to Upload' }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'living-room.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByRole('button', { name: 'Upload 1 Files' }).click();
    await expect(page.getByText('Uploaded')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Continue to Editor' }).click();
    await expect(page).toHaveURL(/\/tours\/new-tour-id\/edit/);
    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="scene-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="scene-card"]')).toContainText('living-room');
  });
});
