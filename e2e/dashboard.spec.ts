import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Settings Pages', () => {
  test.describe('Profile', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/profile');

      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });
  });

  test.describe('Settings', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/settings');

      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });
  });
});

test.describe('Analytics', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/analytics');

    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });
});
