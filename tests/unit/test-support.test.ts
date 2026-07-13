import { describe, expect, it } from 'vitest';
import { app } from '../../src/index';
import type { Bindings } from '../../src/env';

const baseEnvironment = {
  APP_ORIGIN: 'https://staging.example.test',
} as Bindings;

describe('POST /test-support/session', () => {
  it('is indistinguishable from a missing route when the fixture token is disabled', async () => {
    const response = await app.request(
      '/test-support/session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fixture: 'verified-candidate' }),
      },
      baseEnvironment,
    );

    expect(response.status).toBe(404);
  });

  it('rejects an unknown fixture before accessing external services', async () => {
    const response = await app.request(
      '/test-support/session',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-e2e-test-token': 'staging-only-token',
        },
        body: JSON.stringify({ fixture: 'administrator' }),
      },
      { ...baseEnvironment, E2E_TEST_TOKEN: 'staging-only-token' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_fixture' });
  });
});
