import { describe, expect, it } from 'vitest';
import { anonymizedName } from '../../src/services/unlock-service';

describe('anonymizedName', () => {
  it('returns initials without exposing full name', () => {
    expect(anonymizedName('Emma Rose Carter')).toBe('E. C.');
    expect(anonymizedName('Victor')).toBe('V.');
  });
});
