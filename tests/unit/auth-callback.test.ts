import { describe, expect, it } from 'vitest';
import {
  authRoutes,
  parseAuthCallback,
  parseImplicitSessionPayload,
} from '../../src/routes/auth';

describe('parseAuthCallback', () => {
  it('accepts a Supabase email token hash for server-side confirmation', () => {
    const params = new URLSearchParams('token_hash=hashed-token&type=email');

    expect(parseAuthCallback(params)).toEqual({
      kind: 'otp',
      tokenHash: 'hashed-token',
      type: 'email',
    });
  });

  it('keeps supporting PKCE authorization codes', () => {
    const params = new URLSearchParams('code=auth-code');

    expect(parseAuthCallback(params)).toEqual({
      kind: 'code',
      code: 'auth-code',
    });
  });

  it('rejects incomplete callback parameters', () => {
    expect(parseAuthCallback(new URLSearchParams())).toBeNull();
    expect(parseAuthCallback(new URLSearchParams('token_hash=hashed-token'))).toBeNull();
  });
});

describe('parseImplicitSessionPayload', () => {
  it('accepts access and refresh tokens from the default Supabase email redirect', () => {
    expect(
      parseImplicitSessionPayload({
        accessToken: 'a'.repeat(40),
        refreshToken: 'r'.repeat(40),
      }),
    ).toEqual({
      accessToken: 'a'.repeat(40),
      refreshToken: 'r'.repeat(40),
    });
  });

  it('rejects missing or suspiciously short tokens', () => {
    expect(parseImplicitSessionPayload({})).toBeNull();
    expect(
      parseImplicitSessionPayload({ accessToken: 'short', refreshToken: 'short' }),
    ).toBeNull();
  });
});


const testEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  APP_ORIGIN: 'https://example.com',
} as never;

describe('default Supabase confirmation bridge', () => {
  it('renders a browser bridge when Supabase redirects with tokens in the URL fragment', async () => {
    const response = await authRoutes.request('/callback', {}, testEnv);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('/auth-callback.js');
    expect(html).toContain('Confirming your email');
  });

  it('rejects an invalid implicit-session payload before contacting Supabase', async () => {
    const response = await authRoutes.request(
      '/callback/session',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({ accessToken: 'short', refreshToken: 'short' }),
      },
      testEnv,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_session_tokens' });
  });
});
