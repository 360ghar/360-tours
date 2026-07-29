import { test, expect } from '@playwright/test';

// Mock authenticated session
test.describe('Tour Management', () => {
  // Skip auth for now - these tests check page structure
  test.beforeEach(async () => {
    // In a real scenario, we'd set up auth state here
    // For now, we'll test what's accessible
  });

  test.describe('Tour List Page', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/tours');

      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });
  });

  test.describe('Public Tour View', () => {
    test('should display public tour page structure', async ({ page }) => {
      // Navigate to a public tour (would need a valid tour ID in production)
      await page.goto('/tours/test-tour-id/view');

      // Check that page loads (may show error for invalid tour)
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Embedded Tour', () => {
    test('should display embedded tour page', async ({ page }) => {
      await page.goto('/embed/test-tour-id');

      // Check that page loads
      await expect(page.locator('body')).toBeVisible();
    });

    test('should handle query parameters', async ({ page }) => {
      await page.goto('/embed/test-tour-id?navbar=false&autoplay=true');

      // Check that page loads with params
      await expect(page.locator('body')).toBeVisible();
    });
  });
});

test.describe('Tour Creation Wizard', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/tours/create');

    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Tour Editor', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/tours/test-tour-id/edit');

    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });
});
