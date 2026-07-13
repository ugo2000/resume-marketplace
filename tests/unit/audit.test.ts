import { describe, expect, it } from 'vitest';
import { auditEntry } from '../../src/lib/audit';

describe('auditEntry', () => {
  it('serializes a stable action record', () => {
    expect(
      auditEntry('admin-1', 'employer.approved', 'employer', 'emp-1', {
        reason: 'verified',
      }),
    ).toEqual({
      actor_user_id: 'admin-1',
      action: 'employer.approved',
      target_type: 'employer',
      target_id: 'emp-1',
      metadata: { reason: 'verified' },
    });
  });
});
