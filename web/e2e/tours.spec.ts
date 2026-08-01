/**
 * E2E tests for tour management routes.
 *
 * Runnable in the plain `chromium` project with NO auth and NO backend:
 * - Protected routes must exhibit the REAL redirect behavior (unauthenticated
 *   visitors land on `/login` — `ProtectedRoute` redirects via router state).
 * - Public routes must render a meaningful state for a missing tour instead of
 *   asserting on the always-visible `<body>`.
 */
import { test, expect } from '@playwright/test';

test.describe('Tour Management — protected routes (unauthenticated)', () => {
  for (const path of ['/tours', '/tours/create', '/tours/test-tour-id', '/tours/test-tour-id/edit']) {
    test(`redirects unauthenticated visitors from ${path} to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test.describe('Public tour routes (no backend)', () => {
  test('shows "Tour Not Found" for a missing public tour', async ({ page }) => {
    // The public tour endpoint is anonymous; a 404 (not a 5xx, which would be
    // retried) resolves the page into its not-found state deterministically.
    await page.route('**/api/v1/public/tours/**', route => {
      void route.fulfill({ status: 404, json: { detail: 'Tour not found' } });
    });

    await page.goto('/view/test-tour-id');
    await expect(page.getByRole('heading', { name: 'Tour Not Found' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('embed page surfaces a load error for a missing tour', async ({ page }) => {
    await page.route('**/api/v1/public/tours/**', route => {
      void route.fulfill({ status: 404, json: { detail: 'Tour not found' } });
    });

    await page.goto('/embed/test-tour-id');
    await expect(page.getByText('Failed to load tour')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
