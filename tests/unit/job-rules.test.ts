import { describe, expect, it } from 'vitest';
import { canPublishAnotherJob, nextExpiration } from '../../src/services/job-service';

describe('job rules', () => {
  it('allows only fewer than ten active jobs', () => {
    expect(canPublishAnotherJob(9)).toBe(true);
    expect(canPublishAnotherJob(10)).toBe(false);
  });

  it('expires exactly thirty days after publish or renewal', () => {
    expect(nextExpiration(new Date('2026-07-13T00:00:00Z')).toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });
});
