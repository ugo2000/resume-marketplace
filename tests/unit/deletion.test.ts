import { describe, expect, it } from 'vitest';
import { restoreDeadline } from '../../src/services/cleanup-service';

describe('restoreDeadline', () => {
  it('returns exactly thirty days after request', () => {
    expect(restoreDeadline(new Date('2026-07-13T12:00:00Z')).toISOString()).toBe(
      '2026-08-12T12:00:00.000Z',
    );
  });
});
