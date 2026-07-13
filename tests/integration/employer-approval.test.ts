import { describe, expect, it } from 'vitest';
import { documentDeleteAfter } from '../../src/services/employer-service';

describe('employer approval retention', () => {
  it('schedules proof deletion 30 days after review', () => {
    const reviewedAt = new Date('2026-07-13T00:00:00.000Z');
    expect(documentDeleteAfter(reviewedAt).toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });
});
