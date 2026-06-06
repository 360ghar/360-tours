import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should display the landing page correctly', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/360 Viewer/);

    // Check hero section is visible
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should have working navigation links', async ({ page }) => {
    await page.goto('/');

    // Check login link is visible
    const loginLink = page.getByRole('link', { name: /login|sign in/i });
    if (!(await loginLink.first().isVisible())) {
      const menuButton = page.getByRole('button', { name: /toggle menu/i });
      if (await menuButton.isVisible()) {
        await menuButton.click();
      }
    }
    await expect(loginLink.first()).toBeVisible();

    // Check signup link is visible
    const signupLink = page.getByRole('link', {
      name: /sign up|get started|register|start free/i,
    });
    await expect(signupLink.first()).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    await page.goto('/');

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('body')).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });
});
