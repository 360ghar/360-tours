import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Login', () => {
    test('shows the identifier-first login form', async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /phone/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByRole('tab', { name: /email/i })).toBeVisible();
      await expect(page.getByLabel(/phone number/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
      await expect(page.getByLabel(/^password$/i)).toHaveCount(0);
    });

    test('switches between phone and email identifiers', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('tab', { name: /email/i }).click();

      await expect(page.getByRole('tab', { name: /email/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByLabel(/email address/i)).toBeVisible();
      await expect(page.getByLabel(/phone number/i)).toHaveCount(0);

      await page.getByRole('tab', { name: /phone/i }).click();
      await expect(page.getByLabel(/phone number/i)).toBeVisible();
    });

    test('keeps identifier fields required before backend auth branching', async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByLabel(/phone number/i)).toHaveAttribute('required');

      await page.getByRole('tab', { name: /email/i }).click();
      await expect(page.getByLabel(/email address/i)).toHaveAttribute('required');
    });

    test('shows validation for invalid phone identifiers', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/phone number/i).fill('123');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();

      await expect(page.getByText(/phone must be in e\.164 format/i)).toBeVisible();
    });

    test('has a link to registration', async ({ page }) => {
      await page.goto('/login');

      await expect(
        page.getByRole('link', { name: /create account|sign up|register/i })
      ).toBeVisible();
    });
  });

  test.describe('Register', () => {
    test('shows the identifier-first registration form', async ({ page }) => {
      await page.goto('/register');

      await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
      await expect(page.getByLabel(/full name/i)).toBeVisible();
      await expect(page.getByLabel(/phone number/i)).toBeVisible();
      await expect(page.getByRole('checkbox')).toBeVisible();
      await expect(page.getByRole('link', { name: /terms of service/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /privacy policy/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /send verification code/i })).toBeVisible();
      await expect(page.getByLabel(/^password$/i)).toHaveCount(0);
    });

    test('switches registration to email identifier mode', async ({ page }) => {
      await page.goto('/register');

      await page.getByRole('tab', { name: /^email$/i }).click();

      await expect(page.getByRole('tab', { name: /^email$/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByLabel(/email address/i)).toBeVisible();
      await expect(page.getByLabel(/phone number/i)).toHaveCount(0);
    });

    test('requires terms acceptance before sending a verification code', async ({ page }) => {
      await page.goto('/register');

      await page.getByLabel(/full name/i).fill('Test User');
      await page.getByLabel(/phone number/i).fill('+919876543210');
      await page.getByRole('button', { name: /send verification code/i }).click();

      await expect(
        page.getByText(/you must accept the terms of service and privacy policy/i)
      ).toBeVisible();
    });

    test('has a link back to login', async ({ page }) => {
      await page.goto('/register');

      await expect(page.getByRole('link', { name: /login|sign in|already have/i })).toBeVisible();
    });
  });
});
