import { describe, expect, it } from 'vitest';
import {
  confirmationDestination,
  wantsJsonResponse,
} from '../../src/routes/auth';

describe('wantsJsonResponse', () => {
  it('recognizes explicit JSON response requests', () => {
    expect(
      wantsJsonResponse(
        new Request('https://example.test/auth/register/candidate', {
          headers: { accept: 'application/json' },
        }),
      ),
    ).toBe(true);

    expect(
      wantsJsonResponse(
        new Request('https://example.test/auth/register/candidate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
      ),
    ).toBe(true);
  });

  it('keeps normal browser form navigations on HTML responses', () => {
    expect(
      wantsJsonResponse(
        new Request('https://example.test/auth/register/candidate', {
          headers: { accept: 'text/html,application/xhtml+xml' },
        }),
      ),
    ).toBe(false);
    expect(wantsJsonResponse(new Request('https://example.test'))).toBe(false);
  });
});

describe('confirmationDestination', () => {
  it('keeps employer onboarding unchanged', () => {
    expect(confirmationDestination('employer', false)).toBe('/employer/onboarding');
    expect(confirmationDestination('employer', true)).toBe('/employer/onboarding');
  });

  it('sends completed candidates directly to identity verification', () => {
    expect(confirmationDestination('candidate', true)).toBe('/candidate/verification');
  });

  it('preserves onboarding for legacy candidates without profiles', () => {
    expect(confirmationDestination('candidate', false)).toBe('/candidate/onboarding');
    expect(confirmationDestination(null, false)).toBe('/candidate/onboarding');
  });
});
