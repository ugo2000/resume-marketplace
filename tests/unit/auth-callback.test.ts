import { describe, expect, it } from 'vitest';
import { parseAuthCallback } from '../../src/routes/auth';

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
