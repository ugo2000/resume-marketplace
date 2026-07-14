import { expect, test, type Page } from '@playwright/test';

const fillAccountStep = async (page: Page, password = 'correct horse battery staple') => {
  await page.getByLabel('Email address').fill('avery@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
};

const fillJobProfileStep = async (page: Page) => {
  await page.getByLabel('Legal name').fill('Avery Chen');
  await page.getByLabel('Country').selectOption('CA');
  await page.getByLabel('State or province').fill('Ontario');
  await page.getByLabel('City').fill('Toronto');
  await page.getByLabel('Desired job title').fill('Operations Coordinator');
  await page.getByLabel('Years of experience').fill('6');
  await page.getByLabel('Work authorization').selectOption('authorized_without_sponsorship');
};

const reachReviewStep = async (page: Page) => {
  await fillAccountStep(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await fillJobProfileStep(page);
  await page.getByRole('button', { name: 'Continue' }).click();
};

test('candidate moves forward and backward without losing values', async ({ page }) => {
  await page.goto('/register/candidate');
  await fillAccountStep(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await fillJobProfileStep(page);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Email address')).toHaveValue('avery@example.com');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('correct horse battery staple');

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Legal name')).toHaveValue('Avery Chen');
  await expect(page.getByLabel('Country')).toHaveValue('CA');
  await expect(page.getByLabel('Desired job title')).toHaveValue('Operations Coordinator');
});

test('password mismatch blocks progression and focuses confirmation', async ({ page }) => {
  await page.goto('/register/candidate');
  await page.getByLabel('Email address').fill('avery@example.com');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
  await page.getByLabel('Confirm password').fill('different secure password');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByLabel('Confirm password')).toBeFocused();
  await expect(page.locator('[data-progress-step="1"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('[data-registration-status]')).toContainText('correct the highlighted field');
});

test('review summarizes candidate details and omits passwords', async ({ page }) => {
  await page.goto('/register/candidate');
  await reachReviewStep(page);

  const review = page.locator('.review-list');
  await expect(review).toContainText('avery@example.com');
  await expect(review).toContainText('Avery Chen');
  await expect(review).toContainText('Toronto, Ontario, Canada');
  await expect(review).toContainText('Operations Coordinator');
  await expect(review).toContainText('6 years');
  await expect(review).toContainText('Authorized without sponsorship');
  await expect(review).not.toContainText('correct horse battery staple');
});

test('keyboard controls can navigate the wizard', async ({ page }) => {
  await page.goto('/register/candidate');
  await fillAccountStep(page);

  const firstContinue = page.getByRole('button', { name: 'Continue' });
  await firstContinue.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Step 2: Job profile' })).toBeVisible();

  const back = page.getByRole('button', { name: 'Back' });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Step 1: Create account' })).toBeVisible();
});

test('mobile layout reaches the review step', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register/candidate');
  await reachReviewStep(page);

  await expect(page.locator('[data-progress-step="3"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: 'Create candidate account' })).toBeVisible();
});

test('final submission reaches the branded check-email page', async ({ page }) => {
  await page.route('**/auth/register/candidate', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Check your email</title></head><body><h1>Check your email</h1><p>We sent a verification email.</p></body></html>',
    });
  });

  await page.goto('/register/candidate');
  await reachReviewStep(page);
  await page.getByLabel('I confirm that I am at least 18 years old.').check();
  await page.getByLabel(/I agree to the Terms/).check();
  await page.getByLabel(/I acknowledge the Privacy policy/).check();
  await page.getByRole('button', { name: 'Create candidate account' }).click();

  await expect(page).toHaveTitle('Check your email');
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});
