import { describe, expect, it } from 'vitest';
import { creditPack } from '../../src/services/credit-service';

describe('creditPack', () => {
  it('maps only approved packs', () => {
    expect(creditPack('10')).toEqual({ purpose: 'credit_pack_10', credits: 10, amountCents: 3000 });
    expect(creditPack('25')).toEqual({ purpose: 'credit_pack_25', credits: 25, amountCents: 7500 });
    expect(() => creditPack('50')).toThrow();
  });
});
