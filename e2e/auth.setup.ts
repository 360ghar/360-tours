/**
 * Authentication setup for E2E tests.
 *
 * This file runs before other tests to set up authentication state.
 * Run with: npx playwright test --project=setup
 */
import { test as setup, expect } from '@playwright/test';
import { TEST_USER, STORAGE_STATE_PATH, loginWithPhonePassword } from './fixtures/auth';
import * as fs from 'fs';
import * as path from 'path';

const authDir = path.dirname(STORAGE_STATE_PATH);
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

setup('authenticate', async ({ page }) => {
  if (!TEST_USER.phone || !TEST_USER.password) {
    await page.context().storageState({ path: STORAGE_STATE_PATH });
    return;
  }

  await page.goto('/login');

  if (page.url().includes('/dashboard') || page.url().includes('/tours')) {
    await page.context().storageState({ path: STORAGE_STATE_PATH });
    return;
  }

  await expect(
    page.getByLabel(/phone number/i),
    'Login form phone input should be visible'
  ).toBeVisible();
  await loginWithPhonePassword(page);

  await page.waitForURL(/\/(dashboard|tours)/, { timeout: 15000 });

  const currentUrl = page.url();
  if (!currentUrl.includes('/dashboard') && !currentUrl.includes('/tours')) {
    throw new Error(
      `Authentication failed: login did not redirect to dashboard/tours. Current URL: ${currentUrl}`
    );
  }

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
