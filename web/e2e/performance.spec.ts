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

  test('should not load dashboard chunks on the landing page', async ({ page }) => {
    // The landing page must only load the marketing chunk graph: authed-app
    // routes (dashboard, tours, editor, media) are lazy-loaded and must never
    // be requested while viewing `/`. (Replaces the old lazy-image test,
    // which was vacuous — the landing page renders no `<img>` elements.)
    const requestedChunks: string[] = [];
    page.on('request', req => {
      const url = req.url();
      if (/\/assets\/.*\.js/.test(url)) requestedChunks.push(url);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const authedChunks = requestedChunks.filter(url =>
      /DashboardPage|ToursPage|TourEditPage|TourCreatePage|MediaLibraryPage|AnalyticsPage/.test(
        url
      )
    );
    expect(authedChunks).toHaveLength(0);
  });
});
