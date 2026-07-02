/**
 * Authentication fixtures for E2E testing.
 *
 * Provides utilities for creating authenticated test contexts.
 */
import { test as base, expect, type Page } from '@playwright/test';

export const TEST_USER = {
  phone: process.env.E2E_TEST_USER_PHONE || '',
  password: process.env.E2E_TEST_USER_PASSWORD || '',
  name: process.env.E2E_TEST_USER_NAME || 'Test User',
};

export const STORAGE_STATE_PATH = 'e2e/.auth/user.json';

function phoneInputValue(phone: string): string {
  return phone.startsWith('+91') ? phone.slice(3) : phone.replace(/^\+/, '');
}

export async function loginWithPhonePassword(page: Page): Promise<void> {
  await page.goto('/login');

  await page.getByLabel(/phone number/i).fill(phoneInputValue(TEST_USER.phone));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByLabel(/^password$/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
}

export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, provide) => {
    if (!TEST_USER.phone || !TEST_USER.password) {
      await provide(page);
      return;
    }

    await loginWithPhonePassword(page);

    await page.waitForURL(/\/(dashboard|tours)/, { timeout: 10000 }).catch(() => {
      console.warn('Login redirect timeout - backend may not be available');
    });

    await provide(page);
  },
});

export async function globalAuthSetup(page: Page) {
  if (!TEST_USER.phone || !TEST_USER.password) {
    await page.context().storageState({ path: STORAGE_STATE_PATH });
    return;
  }

  await loginWithPhonePassword(page);

  await page.waitForURL(/\/(dashboard|tours)/);

  await page.context().storageState({ path: STORAGE_STATE_PATH });
}

export async function isAuthenticated(page: Page): Promise<boolean> {
  const token = await page.evaluate(() => {
    return (
      localStorage.getItem('360viewer_auth_tokens') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('supabase.auth.token') ||
      sessionStorage.getItem('auth_token')
    );
  });
  return !!token;
}

export async function waitForAuth(page: Page, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await isAuthenticated(page)) {
      return true;
    }
    await page.waitForTimeout(100);
  }
  return false;
}

export { expect };
