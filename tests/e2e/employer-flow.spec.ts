import { expect, test } from '@playwright/test';

const token = process.env.E2E_TEST_TOKEN ?? '';
const origin = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

test('approved employer posts a job and unlocks a candidate once', async ({ request }) => {
  const session = await request.post('/test-support/session', {
    data: { fixture: 'approved-employer-with-10-credits' },
    headers: { 'x-e2e-test-token': token },
  });
  expect(session.ok()).toBeTruthy();

  const draft = await request.post('/employer/jobs', {
    headers: { Origin: origin },
    form: {
      title: 'Operations Assistant',
      description: 'Coordinate daily operations.',
      city: 'Seattle',
      stateProvince: 'WA',
      country: 'US',
      employmentType: 'Full time',
      workplaceType: 'On site',
    },
  });
  expect(draft.ok()).toBeTruthy();
  const { jobId } = await draft.json();
  expect((await request.post(`/employer/jobs/${jobId}/publish`, { headers: { Origin: origin } })).ok()).toBeTruthy();

  const search = await request.get('/employer/candidates?q=operations', {
    headers: { Accept: 'application/json' },
  });
  expect(search.ok()).toBeTruthy();
  const candidateId = (await search.json()).candidates[0].candidate_id;
  expect((await request.post(`/employer/candidates/${candidateId}/unlock`, { headers: { Origin: origin } })).ok()).toBeTruthy();
  expect((await request.post(`/employer/candidates/${candidateId}/unlock`, { headers: { Origin: origin } })).ok()).toBeTruthy();

  const wallet = await request.get('/employer/credits', {
    headers: { Accept: 'application/json' },
  });
  expect((await wallet.json()).wallet.available_credits).toBe(9);
});
