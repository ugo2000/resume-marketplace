import { describe, expect, it } from 'vitest';
import { activeJobCount } from '../../src/services/job-service';

describe('job publishing limits', () => {
  it('does not count closed or expired jobs as active', () => {
    const now = new Date('2026-07-13T00:00:00Z');
    expect(activeJobCount([
      { status: 'published', expiresAt: '2026-07-14T00:00:00Z' },
      { status: 'published', expiresAt: '2026-07-12T00:00:00Z' },
      { status: 'closed', expiresAt: '2026-07-20T00:00:00Z' },
    ], now)).toBe(1);
  });
});
