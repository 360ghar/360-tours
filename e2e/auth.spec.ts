import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Login', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');

      // Check form elements are visible
      await expect(page.getByLabel(/phone/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/login');

      // Submit empty form
      await page.getByRole('button', { name: /login|sign in/i }).click();

      await expect(page.getByLabel(/phone/i)).toHaveAttribute('required');
      await expect(page.getByLabel(/password/i)).toHaveAttribute('required');
    });

    test('should show validation error for invalid phone', async ({ page }) => {
      await page.goto('/login');

      // Enter invalid phone
      await page.getByLabel(/phone/i).fill('123');
      await page.getByLabel(/password/i).fill('Password123');
      await page.getByRole('button', { name: /login|sign in/i }).click();

      await expect(page.getByText(/phone must be in e\.164 format/i)).toBeVisible();
    });

    test('should have link to register page', async ({ page }) => {
      await page.goto('/login');

      const registerLink = page.getByRole('link', { name: /sign up|register|create account/i });
      await expect(registerLink).toBeVisible();
    });

    test('should have forgot password link', async ({ page }) => {
      await page.goto('/login');

      const forgotLink = page.getByRole('link', { name: /forgot|reset/i });
      await expect(forgotLink).toBeVisible();
    });
  });

  test.describe('Register', () => {
    test('should display register form', async ({ page }) => {
      await page.goto('/register');

      // Check form elements are visible
      await expect(page.getByLabel(/phone/i)).toBeVisible();
      await expect(page.getByLabel(/full name/i)).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /sign up|register|create/i })).toBeVisible();
    });

    test('should show validation for password requirements', async ({ page }) => {
      await page.goto('/register');

      // Enter weak password
      await page.getByLabel(/phone/i).fill('9876543210');
      await page.getByLabel(/full name/i).fill('Test User');
      await page.getByLabel(/password/i).first().fill('123');
      await page.getByLabel(/confirm password/i).fill('123');
      await page.getByRole('checkbox').check();

      // Submit form
      await page.getByRole('button', { name: /sign up|register|create/i }).click();

      await expect(page.getByText(/password must/i).first()).toBeVisible();
    });

    test('should have link to login page', async ({ page }) => {
      await page.goto('/register');

      const loginLink = page.getByRole('link', { name: /login|sign in|already have/i });
      await expect(loginLink).toBeVisible();
    });
  });
});
