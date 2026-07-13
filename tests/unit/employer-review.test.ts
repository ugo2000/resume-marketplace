import { describe, expect, it } from 'vitest';
import { canTransitionReview } from '../../src/services/employer-service';

describe('canTransitionReview', () => {
  it('allows pending to approved or rejected', () => {
    expect(canTransitionReview('pending', 'approved')).toBe(true);
    expect(canTransitionReview('pending', 'rejected')).toBe(true);
  });

  it('blocks direct draft to approved', () => {
    expect(canTransitionReview('draft', 'approved')).toBe(false);
  });
});
