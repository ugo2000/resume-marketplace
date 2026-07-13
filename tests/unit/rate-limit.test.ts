import { describe, expect, it } from 'vitest';
import { fixedWindowStart } from '../../src/middleware/rate-limit';

describe('fixedWindowStart', () => {
  it('groups requests into one-minute windows', () => {
    expect(fixedWindowStart(new Date('2026-07-13T00:00:59Z'), 60).toISOString()).toBe(
      '2026-07-13T00:00:00.000Z',
    );
  });
});
