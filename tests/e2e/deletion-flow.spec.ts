import { expect, test } from '@playwright/test';

const token = process.env.E2E_TEST_TOKEN ?? '';
const origin = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

test('candidate can restore during the thirty-day recovery window', async ({ request }) => {
  const session = await request.post('/test-support/session', {
    data: { fixture: 'verified-candidate' },
    headers: { 'x-e2e-test-token': token },
  });
  expect(session.ok()).toBeTruthy();

  const deletion = await request.post('/candidate/delete-account', {
    headers: { Origin: origin },
  });
  expect(deletion.ok()).toBeTruthy();
  expect((await deletion.json()).restoreDays).toBe(30);

  const restore = await request.post('/auth/restore-account', {
    headers: { Origin: origin },
  });
  expect(restore.ok()).toBeTruthy();
});
