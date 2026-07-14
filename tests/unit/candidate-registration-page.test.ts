import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { publicRoutes } from '../../src/routes/public';

const testEnv = {
  TURNSTILE_SITE_KEY: 'site-key',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  APP_ORIGIN: 'https://example.com',
} as never;

describe('candidate registration page', () => {
  it('renders a semantic three-step candidate wizard', async () => {
    const response = await publicRoutes.request('/register/candidate', {}, testEnv);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html.match(/data-registration-step="[123]"/g)).toHaveLength(3);
    expect(html.match(/data-progress-step="[123]"/g)).toHaveLength(3);
    expect(html).toContain('data-candidate-registration');
    expect(html).toContain('action="/auth/register/candidate"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).toContain('name="fullName"');
    expect(html).toContain('name="country"');
    expect(html).toContain('name="stateProvince"');
    expect(html).toContain('name="city"');
    expect(html).toContain('name="headline"');
    expect(html).toContain('name="yearsExperience"');
    expect(html).toContain('name="workAuthorization"');
    expect(html).toContain('name="age18"');
    expect(html).toContain('name="termsAccepted"');
    expect(html).toContain('name="privacyAccepted"');
    expect(html).toContain('cf-turnstile');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('$2.49 USD');
    expect(html).toContain('/candidate-registration.js');
  });

  it('keeps employer registration as the existing email and password form', async () => {
    const response = await publicRoutes.request('/register/employer', {}, testEnv);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('action="/auth/register/employer"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).not.toContain('data-candidate-registration');
    expect(html).not.toContain('name="fullName"');
  });

  it('uses in-memory progressive enhancement without storing or transmitting draft data', async () => {
    const script = await readFile('public/candidate-registration.js', 'utf8');

    expect(script).not.toContain('localStorage');
    expect(script).not.toContain('sessionStorage');
    expect(script).not.toMatch(/\bfetch\s*\(/);
    expect(script).not.toContain('XMLHttpRequest');
    expect(script).not.toMatch(/data-review-field=["']password/i);
    expect(script).toContain('reportValidity');
    expect(script).toContain('aria-current');
    expect(script).toContain('aria-busy');
  });
});
