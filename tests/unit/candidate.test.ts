import { describe, expect, it } from 'vitest';
import { candidateCanPublish } from '../../src/services/candidate-service';

describe('candidateCanPublish', () => {
  it('requires age confirmation and verified identity', () => {
    expect(candidateCanPublish({ date_of_birth_confirmed: true, identity_status: 'verified' })).toBe(true);
    expect(candidateCanPublish({ date_of_birth_confirmed: false, identity_status: 'verified' })).toBe(false);
    expect(candidateCanPublish({ date_of_birth_confirmed: true, identity_status: 'processing' })).toBe(false);
  });
});
