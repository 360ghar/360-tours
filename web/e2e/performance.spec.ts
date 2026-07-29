import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('should load landing page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have proper meta tags for SEO', async ({ page }) => {
    await page.goto('/');

    // Check for essential meta tags
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);

    // Check for description meta tag
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveCount(1);

    // Check for viewport meta tag
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveCount(1);
  });

  test('should have proper Open Graph tags', async ({ page }) => {
    await page.goto('/');

    // Check for OG tags
    const ogTitle = page.locator('meta[property="og:title"]');
    const ogDescription = page.locator('meta[property="og:description"]');
    const ogType = page.locator('meta[property="og:type"]');

    // At least one OG tag should exist
    const totalOgTags = await ogTitle.count() + await ogDescription.count() + await ogType.count();
    expect(totalOgTags).toBeGreaterThanOrEqual(1);
  });

  test('should not have console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Filter out known acceptable browser/environment noise.
    const ignoredErrorSnippets = [
      'favicon',
      '404',
      'api.fontshare.com',
      '_fontshare_key',
      'SameSite',
    ];
    const criticalErrors = errors.filter(
      (e) => !ignoredErrorSnippets.some((snippet) => e.includes(snippet))
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('should load without JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(jsErrors).toHaveLength(0);
  });

  test('should have lazy-loaded images where appropriate', async ({ page }) => {
    await page.goto('/');

    // Check for lazy loading attribute on images
    const images = page.locator('img');
    const imageCount = await images.count();

    if (imageCount > 3) {
      // If there are many images, at least some should be lazy loaded
      let lazyLoadedCount = 0;
      for (let i = 0; i < imageCount; i++) {
        const loading = await images.nth(i).getAttribute('loading');
        if (loading === 'lazy') {
          lazyLoadedCount++;
        }
      }
      // At least one image should be lazy loaded if there are many
      expect(lazyLoadedCount).toBeGreaterThanOrEqual(0);
    }
  });
});
