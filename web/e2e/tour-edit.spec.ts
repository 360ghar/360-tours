/**
 * E2E tests for tour editing.
 *
 * Runs hermetically in the `chromium` project with mocked auth + API: the
 * editor mounts against mocked tour/scenes data and the scene panel behaviors
 * are asserted against real DOM. The unauthenticated test asserts the real
 * redirect behavior.
 */
import { test, expect } from '@playwright/test';
import { installMockAuth, MOCK_TOUR, MOCK_SCENES } from './fixtures/mockAuth';

const TOUR_ID = 'test-tour-id';

test.describe('Tour Editor — unauthenticated', () => {
  test('redirects unauthenticated visitors to /login', async ({ page }) => {
    await page.goto(`/tours/${TOUR_ID}/edit`);
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Tour Editor — hermetic (mocked auth + API)', () => {
  test.beforeEach(async ({ page }) => {
    await installMockAuth(page);
    await page.route('**/api/v1/tours/test-tour-id', route =>
      route.fulfill({ json: { ...MOCK_TOUR, id: TOUR_ID }, status: 200 })
    );
    await page.route('**/api/v1/tours/test-tour-id/scenes', route =>
      route.fulfill({ json: MOCK_SCENES, status: 200 })
    );
  });

  test('loads the editor toolbar and the mocked scenes in the scene panel', async ({ page }) => {
    await page.goto(`/tours/${TOUR_ID}/edit`);

    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="scene-panel"]')).toBeVisible();

    const sceneCards = page.locator('[data-testid="scene-card"]');
    await expect(sceneCards).toHaveCount(2);
    await expect(sceneCards.first()).toContainText('Living Room');
    await expect(sceneCards.nth(1)).toContainText('Kitchen');
  });

  test('selecting a scene marks it as the selected scene', async ({ page }) => {
    await page.goto(`/tours/${TOUR_ID}/edit`);

    const sceneCards = page.locator('[data-testid="scene-card"]');
    await expect(sceneCards).toHaveCount(2, { timeout: 15000 });
    // The first scene is auto-selected on load.
    await expect(sceneCards.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(sceneCards.nth(1)).toHaveAttribute('aria-pressed', 'false');

    await sceneCards.nth(1).click();
    await expect(sceneCards.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(sceneCards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Save is disabled until there are unsaved changes', async ({ page }) => {
    await page.goto(`/tours/${TOUR_ID}/edit`);

    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible({ timeout: 15000 });
    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeDisabled();
  });
});
