/**
 * E2E tests for AI features.
 *
 * Runs hermetically in the `chromium` project with mocked auth + API:
 * - the AI wizard opens from the tour-create chooser;
 * - closing the wizard while a job is processing asks for confirmation and
 *   persists the job id, so reopening resumes monitoring it (real behavior of
 *   the close guard added for orphaned-job protection).
 * The unauthenticated tests assert the real redirect behavior.
 */
import { test, expect } from '@playwright/test';
import { installMockAuth, TINY_PNG } from './fixtures/mockAuth';

/** `AIJobBase` as `GET /ai/jobs/{id}` returns it. */
const RUNNING_JOB = {
  id: 'job-1',
  job_type: 'generate_tour',
  status: 'processing',
  progress: 42,
  tour_id: null,
  scene_id: null,
  error_message: null,
  started_at: '2025-01-01T00:00:00Z',
  completed_at: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  actual_duration: null,
};

test.describe('AI Features — unauthenticated', () => {
  test('redirects unauthenticated visitors from /tours/create to /login', async ({ page }) => {
    await page.goto('/tours/create');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('redirects unauthenticated visitors from /tours/:id/edit to /login', async ({ page }) => {
    await page.goto('/tours/test-tour-id/edit');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('AI Tour Wizard — hermetic (mocked auth + API)', () => {
  test.beforeEach(async ({ page }) => {
    await installMockAuth(page);
  });

  test('opens the AI wizard from the create page and renders step 1', async ({ page }) => {
    await page.goto('/tours/create');
    await page.getByRole('button', { name: 'AI generate' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('AI Tour Generation')).toBeVisible();
    await expect(dialog.getByText('Drag & drop 360° images')).toBeVisible();
  });

  test('closing while a job runs confirms, persists the job, and reopening resumes it', async ({
    page,
  }) => {
    await page.route('**/api/v1/ai/tours/generate', route =>
      route.fulfill({
        json: { job: RUNNING_JOB, tour_id: 'tour-1', scene_ids: [] },
        status: 201,
      })
    );
    await page.route('**/api/v1/ai/jobs/job-1', route =>
      route.fulfill({ json: { job: RUNNING_JOB, result: null }, status: 200 })
    );
    await page.route('**/api/v1/ai/jobs/job-1/cancel', route =>
      route.fulfill({
        json: { job: { ...RUNNING_JOB, status: 'cancelled' }, result: null },
        status: 200,
      })
    );

    await page.goto('/tours/create');
    await page.getByRole('button', { name: 'AI generate' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Step 1 → details → options → generate (job start is mocked).
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: TINY_PNG });
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByRole('button', { name: 'Generate Tour' }).click();

    // Processing step shows the mocked job's status.
    await expect(dialog.getByText('Tour Generation', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('Processing...')).toBeVisible();

    // Closing while a job runs must ask first.
    await dialog.getByRole('button', { name: 'Close' }).click();
    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible();
    await expect(
      confirmDialog.getByText(
        'The AI job keeps running in the background. You can close this and check later.'
      )
    ).toBeVisible();

    // "Keep waiting" keeps the wizard open on the processing step.
    await confirmDialog.getByRole('button', { name: 'Keep waiting' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Tour Generation', { exact: true })).toBeVisible();

    // "Close anyway" closes the wizard (the job id is persisted).
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Close anyway' }).click();
    await expect(dialog).toBeHidden();

    // Reopening the wizard resumes monitoring of the persisted job.
    await page.getByRole('button', { name: 'AI generate' }).click();
    const reopened = page.getByRole('dialog');
    await expect(reopened).toBeVisible({ timeout: 15000 });
    await expect(reopened.getByText('Tour Generation', { exact: true })).toBeVisible({ timeout: 15000 });

    // Cancel clears the persisted job and returns to the options step.
    await reopened.getByRole('button', { name: 'Cancel Processing' }).click();
    await expect(reopened.getByText('Summary')).toBeVisible();
  });
});
