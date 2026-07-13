import { describe, expect, it } from 'vitest';
import { identityStatusForEvent } from '../../src/services/payment-service';

describe('identity workflow', () => {
  it('maps verified and retry-required events to publish-safe states', () => {
    expect(identityStatusForEvent('identity.verification_session.verified')).toBe('verified');
    expect(identityStatusForEvent('identity.verification_session.requires_input')).toBe('requires_input');
    expect(identityStatusForEvent('checkout.session.completed')).toBeNull();
  });
});
