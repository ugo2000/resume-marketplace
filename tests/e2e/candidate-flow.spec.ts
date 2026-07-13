import { expect, test } from '@playwright/test';

const token = process.env.E2E_TEST_TOKEN ?? '';

test('verified candidate creates a resume and applies', async ({ page }) => {
  const fixture = await page.request.post('/test-support/session', {
    data: { fixture: 'verified-candidate' },
    headers: { 'x-e2e-test-token': token },
  });
  expect(fixture.ok()).toBeTruthy();

  await page.goto('/candidate/resume');
  await page.getByLabel('Full name').fill('Emma Carter');
  await page.getByLabel('Headline').fill('Operations Coordinator');
  await page.getByRole('button', { name: 'Save resume' }).click();
  await expect(page.locator('body')).toContainText('"ok":true');

  await page.goto('/jobs');
  await page.getByRole('link', { name: /Operations Assistant/ }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('body')).toContainText('"ok":true');
});
