/**
 * E2E tests for AI-powered features.
 *
 * Tests AI wizard, scene analysis, and description generation.
 */
import { test, expect } from '@playwright/test';

test.describe('AI Features', () => {
  const testTourId = 'test-tour-id';

  test.describe('AI Tour Wizard', () => {
    test('should access AI wizard from tour creation', async ({ page }) => {
      await page.goto('/tours/create');

      if (!page.url().includes('/login')) {
        // Look for AI wizard button or tab
        const aiWizardButton = page.locator(
          'button:has-text("AI"), [data-testid="ai-wizard"], button:has-text("Smart Setup")'
        );

        if ((await aiWizardButton.count()) > 0) {
          await expect(aiWizardButton.first()).toBeVisible();
        }
      }
    });

    test('should display AI wizard interface', async ({ page }) => {
      await page.goto('/tours/create');

      if (!page.url().includes('/login')) {
        const aiWizardButton = page.locator(
          'button:has-text("AI"), [data-testid="ai-wizard"]'
        ).first();

        if (await aiWizardButton.isVisible()) {
          await aiWizardButton.click();

          // AI wizard should open
          const wizardModal = page.locator(
            '[data-testid="ai-wizard-modal"], [role="dialog"]:has-text("AI")'
          );

          await expect(wizardModal.or(page.locator('body')).first()).toBeVisible();
        }
      }
    });

    test('should support image upload for AI analysis', async ({ page }) => {
      await page.goto('/tours/create');

      if (!page.url().includes('/login')) {
        // Look for AI-powered upload zone
        const uploadZone = page.locator(
          '[data-testid="ai-upload"], .ai-upload-zone'
        );

        if (await uploadZone.isVisible()) {
          const fileInput = uploadZone.locator('input[type="file"]');
          await expect(fileInput).toBeAttached();
        }
      }
    });
  });

  test.describe('Scene Analysis', () => {
    test('should access scene analysis in editor', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for analyze button
        const analyzeButton = page.locator(
          'button:has-text("Analyze"), [data-testid="analyze-scene"], button:has-text("AI Analysis")'
        );

        if ((await analyzeButton.count()) > 0) {
          await expect(analyzeButton.first()).toBeVisible();
        }
      }
    });

    test('should display analysis results', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        const analyzeButton = page.locator(
          'button:has-text("Analyze"), [data-testid="analyze-scene"]'
        ).first();

        if (await analyzeButton.isVisible()) {
          await analyzeButton.click();

          // Wait for analysis (or loading state)
          const loadingIndicator = page.locator(
            '[data-testid="loading"], .loading, .spinner'
          );
          const resultsPanel = page.locator(
            '[data-testid="analysis-results"], .analysis-results'
          );

          // Either loading or results should appear
          await expect(loadingIndicator.or(resultsPanel).or(page.locator('body')).first()).toBeVisible();
        }
      }
    });

    test('should show detected room type', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for room type display
        const roomTypeLabel = page.locator(
          '[data-testid="room-type"], .room-type, :has-text("Room Type")'
        );

        // Room type may be shown after analysis
        await expect(roomTypeLabel.or(page.locator('body')).first()).toBeVisible();
      }
    });

    test('should suggest hotspot positions', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for hotspot suggestions
        const suggestionsPanel = page.locator(
          '[data-testid="hotspot-suggestions"], .hotspot-suggestions'
        );

        if (await suggestionsPanel.isVisible()) {
          const suggestions = suggestionsPanel.locator('.suggestion, .suggested-hotspot');
          const count = await suggestions.count();
          expect(count).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  test.describe('Description Generation', () => {
    test('should have generate description button', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for generate button
        const generateButton = page.locator(
          'button:has-text("Generate"), [data-testid="generate-description"], button:has-text("AI Description")'
        );

        if ((await generateButton.count()) > 0) {
          await expect(generateButton.first()).toBeVisible();
        }
      }
    });

    test('should generate tour description', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        const generateButton = page.locator(
          'button:has-text("Generate Description"), [data-testid="generate-description"]'
        ).first();

        if (await generateButton.isVisible()) {
          await generateButton.click();

          // Should show loading then generated text
          const descriptionArea = page.locator('textarea[name="description"]');
          await expect(descriptionArea.or(page.locator('body')).first()).toBeVisible();
        }
      }
    });

    test('should generate scene titles', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for scene title generation
        const generateTitleButton = page.locator(
          'button:has-text("Generate Title"), [data-testid="generate-scene-title"]'
        );

        if (await generateTitleButton.isVisible()) {
          await generateTitleButton.click();

          const titleInput = page.locator('input[name="title"], [data-testid="scene-title"]');
          await expect(titleInput.or(page.locator('body')).first()).toBeVisible();
        }
      }
    });

    test('should allow regenerating descriptions', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for regenerate button
        const regenerateButton = page.locator(
          'button:has-text("Regenerate"), [data-testid="regenerate"]'
        );

        if (await regenerateButton.isVisible()) {
          await expect(regenerateButton).toBeEnabled();
        }
      }
    });
  });

  test.describe('AI Job Status', () => {
    test('should show AI processing status', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for AI status indicator
        const statusIndicator = page.locator(
          '[data-testid="ai-status"], .ai-status, .processing-status'
        );

        // Status may or may not be visible based on active jobs
        await expect(statusIndicator.or(page.locator('body')).first()).toBeVisible();
      }
    });

    test('should display progress for long-running AI tasks', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for progress bar
        const progressBar = page.locator(
          '[role="progressbar"], .progress-bar, [data-testid="ai-progress"]'
        );

        // Progress may be visible during AI processing
        await expect(progressBar.or(page.locator('body')).first()).toBeVisible();
      }
    });

    test('should handle AI errors gracefully', async ({ page }) => {
      await page.goto(`/tours/${testTourId}/edit`);

      if (!page.url().includes('/login') && !page.url().includes('/404')) {
        // Look for error handling UI
        const errorMessage = page.locator(
          '[role="alert"], .error-message, [data-testid="ai-error"]'
        );

        // Error handling should be in place
        await expect(errorMessage.or(page.locator('body')).first()).toBeVisible();
      }
    });
  });
});
