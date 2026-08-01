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

  test('should be responsive without horizontal overflow', async ({ page }) => {
    await page.goto('/');

    // A responsive layout must not overflow horizontally at any common
    // viewport (previously asserted `body` visibility — always true, vacuous).
    const viewports = [
      { width: 1280, height: 720 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(
        overflow,
        `horizontal overflow of ${overflow}px at ${viewport.width}x${viewport.height}`
      ).toBeLessThanOrEqual(1);
    }
  });
});
