import { describe, expect, it } from 'vitest';
import { canApply } from '../../src/services/application-service';

describe('canApply', () => {
  it('requires verified identity and an open job', () => {
    expect(canApply('verified', 'published', new Date('2026-08-01'), new Date('2026-07-13'))).toBe(true);
    expect(canApply('processing', 'published', new Date('2026-08-01'), new Date('2026-07-13'))).toBe(false);
    expect(canApply('verified', 'expired', new Date('2026-07-01'), new Date('2026-07-13'))).toBe(false);
  });
});
