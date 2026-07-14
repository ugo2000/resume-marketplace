import { afterEach, describe, expect, it, vi } from 'vitest';
import { authRoutes } from '../../src/routes/auth';

const testEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  APP_ORIGIN: 'https://example.com',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
} as never;

const payload = {
  email: 'avery@example.com',
  password: 'correct horse battery staple',
  confirmPassword: 'correct horse battery staple',
  fullName: 'Avery Chen',
  country: 'CA',
  stateProvince: 'Ontario',
  city: 'Toronto',
  headline: 'Operations Coordinator',
  yearsExperience: 6,
  workAuthorization: 'authorized_without_sponsorship',
  age18: 'on',
  termsAccepted: 'on',
  privacyAccepted: 'on',
  'cf-turnstile-response': 'verified-token',
};

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

const requestUrl = (input: RequestInfo | URL) => (
  input instanceof Request ? input.url : String(input)
);

const installSuccessfulNetwork = () => {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    requests.push(url);

    if (url.includes('/rest/v1/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return jsonResponse({ success: true });
    }
    if (url.includes('/auth/v1/signup')) {
      return jsonResponse({
        user: {
          id: 'candidate-user-id',
          email: 'avery@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { role: 'candidate' },
          user_metadata: { role: 'candidate' },
          identities: [],
          created_at: '2026-07-14T00:00:00.000Z',
        },
        session: null,
      });
    }
    if (url.includes('/rest/v1/users')) return new Response(null, { status: 201 });
    if (url.includes('/rest/v1/candidate_profiles')) return new Response(null, { status: 201 });

    throw new Error(`Unexpected request: ${url}`);
  }));
  return requests;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('candidate registration HTTP flow', () => {
  it('returns the stable JSON contract and writes both public records', async () => {
    const requests = installSuccessfulNetwork();

    const response = await authRoutes.request(
      '/register/candidate',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.10',
        },
        body: JSON.stringify(payload),
      },
      testEnv,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, verificationEmailSent: true });
    expect(requests.some((url) => url.includes('/rest/v1/users'))).toBe(true);
    expect(requests.some((url) => url.includes('/rest/v1/candidate_profiles'))).toBe(true);
  });

  it('returns the branded check-email page for browser form submissions', async () => {
    installSuccessfulNetwork();
    const form = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => form.set(key, String(value)));

    const response = await authRoutes.request(
      '/register/candidate',
      {
        method: 'POST',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'content-type': 'application/x-www-form-urlencoded',
          'cf-connecting-ip': '203.0.113.11',
        },
        body: form.toString(),
      },
      testEnv,
    );
    const html = await response.text();

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<title>Check your email</title>');
    expect(html).toContain('We accepted your candidate account request');
    expect(html).not.toContain(payload.password);
    expect(html).not.toContain(payload.fullName);
  });

  it('does not create an account when Turnstile fails', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.includes('/rest/v1/rpc/consume_rate_limit')) return jsonResponse(true);
      if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
        return jsonResponse({ success: false });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const response = await authRoutes.request(
      '/register/candidate',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.12',
        },
        body: JSON.stringify(payload),
      },
      testEnv,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'bot_check_failed' });
    expect(requests.some((url) => url.includes('/auth/v1/signup'))).toBe(false);
  });
});
