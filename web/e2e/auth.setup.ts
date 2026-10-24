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
  // Explicit skip: a real login needs E2E_TEST_USER_PHONE / E2E_TEST_USER_PASSWORD
  // plus a reachable backend + Supabase — none of which exist in CI. An EMPTY
  // storage state is written so the `chromium-authenticated` project still
  // starts, but NO spec may depend on it silently: every spec defaults to
  // unauthenticated-but-meaningful assertions (redirect-to-login) or to the
  // hermetic mocked-auth pattern from e2e/fixtures/mockAuth.ts.
  if (!TEST_USER.phone || !TEST_USER.password) {
    console.warn(
      '[auth.setup] Skipping real login: E2E_TEST_USER_PHONE / E2E_TEST_USER_PASSWORD not set. Writing empty storage state.'
    );
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
