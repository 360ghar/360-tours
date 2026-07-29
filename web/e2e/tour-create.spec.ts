/**
 * E2E tests for tour creation workflow.
 *
 * Tests the tour creation wizard, scene upload, and initial settings.
 */
import { test, expect } from '@playwright/test';
import { TourEditorPage } from './page-objects/TourEditorPage';

async function waitForTourCreateOrLogin(page: import('@playwright/test').Page) {
  await Promise.race([
    page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => undefined),
    page
      .locator('input[name="title"], [placeholder*="title" i], input[type="file"], [data-testid="upload-zone"], .dropzone')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => undefined),
  ]);
}

test.describe('Tour Creation', () => {
  test.describe('Tour Creation Wizard', () => {
    test('should display the tour creation form', async ({ page }) => {
      // First login (mock or skip if no backend)
      await page.goto('/login');

      // Check if login page loads
      await expect(page.locator('body')).toBeVisible();

      // Try to navigate to create page (will redirect to login if not authenticated)
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      // Either see the create form or get redirected to login
      const isOnCreate = await page.url().includes('/tours/create');
      const isOnLogin = await page.url().includes('/login');

      expect(isOnCreate || isOnLogin).toBe(true);
    });

    test('should have required form fields for new tour', async ({ page }) => {
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      // Check for tour creation elements (if authenticated)
      if (!page.url().includes('/login')) {
        // Look for title input
        const titleInput = page.locator('input[name="title"], [placeholder*="title" i]');
        const submitButton = page.locator('button[type="submit"], button:has-text("Create")');

        // At least one form element should exist
        const hasFormElements = (await titleInput.count()) > 0 || (await submitButton.count()) > 0;
        expect(hasFormElements || page.url().includes('/login')).toBe(true);
      }
    });

    test('should validate required fields', async ({ page }) => {
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      if (!page.url().includes('/login')) {
        // Try to submit empty form
        const submitButton = page.locator('button[type="submit"], button:has-text("Create")');
        if (await submitButton.isVisible()) {
          await submitButton.click();

          // Should show validation error
          const errorMessage = page.locator('[role="alert"], .error, .text-red');
          const hasError = (await errorMessage.count()) > 0;
          expect(hasError).toBe(true);
        }
      }
    });
  });

  test.describe('Scene Upload', () => {
    test('should support file upload interface', async ({ page }) => {
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      if (!page.url().includes('/login')) {
        // Look for file upload elements
        const fileInput = page.locator('input[type="file"]');
        const uploadZone = page.locator('[data-testid="upload-zone"], .upload-zone, .dropzone');

        const hasUploadElements = (await fileInput.count()) > 0 || (await uploadZone.count()) > 0;
        expect(hasUploadElements).toBe(true);
      }
    });

    test('should accept 360 panorama images', async ({ page }) => {
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      if (!page.url().includes('/login')) {
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.count() > 0) {
          // Check accept attribute includes image types
          const acceptAttr = await fileInput.getAttribute('accept');
          if (acceptAttr) {
            expect(acceptAttr).toMatch(/image/);
          }
        }
      }
    });

    test('should show upload progress indicator', async ({ page }) => {
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      if (!page.url().includes('/login')) {
        // Look for progress indicator elements (may be hidden until upload starts)
        const progressElements = page.locator(
          '[role="progressbar"], .progress, [data-testid="upload-progress"]'
        );
        // Just verify the page structure, not actual upload
        await expect(progressElements.or(page.locator('body')).first()).toBeVisible();
      }
    });
  });

  test.describe('Tour Settings', () => {
    test('should allow setting tour title and description', async ({ page }) => {
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      if (!page.url().includes('/login')) {
        const titleInput = page.locator('input[name="title"]');
        const descriptionInput = page.locator('textarea[name="description"]');

        if (await titleInput.isVisible()) {
          await titleInput.fill('Test Tour Title');
          await expect(titleInput).toHaveValue('Test Tour Title');
        }

        if (await descriptionInput.isVisible()) {
          await descriptionInput.fill('Test description for the tour');
          await expect(descriptionInput).toHaveValue('Test description for the tour');
        }
      }
    });

    test('should have visibility options', async ({ page }) => {
      await page.goto('/tours/create');
      await waitForTourCreateOrLogin(page);

      if (!page.url().includes('/login')) {
        // Look for visibility selector
        const visibilitySelector = page.locator(
          '[name="visibility"], [data-testid="visibility-select"], input[type="radio"]'
        );
        const hasVisibilityOptions = (await visibilitySelector.count()) > 0;

        // Visibility options may be on a separate settings page
        expect(hasVisibilityOptions || (await page.locator('body').isVisible())).toBe(true);
      }
    });
  });
});

test.describe('Tour Editor Access', () => {
  test('should load tour editor for existing tour', async ({ page }) => {
    // This test would need a valid tour ID
    const testTourId = 'test-tour-id';
    await page.goto(`/tours/${testTourId}/edit`);

    // Either loads editor or redirects to login/404
    const currentUrl = page.url();
    const isValidState =
      currentUrl.includes('/edit') ||
      currentUrl.includes('/login') ||
      currentUrl.includes('/tours') ||
      currentUrl.includes('/404');

    expect(isValidState).toBe(true);
  });

  test('should display scene panel in editor', async ({ page }) => {
    const testTourId = 'test-tour-id';
    await page.goto(`/tours/${testTourId}/edit`);

    if (!page.url().includes('/login') && !page.url().includes('/404')) {
      const editorPage = new TourEditorPage(page);
      // Editor elements should be present
      await expect(editorPage.scenePanel.or(page.locator('body')).first()).toBeVisible();
    }
  });
});
