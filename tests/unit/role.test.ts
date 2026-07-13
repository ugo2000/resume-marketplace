import { describe, expect, it } from 'vitest';
import { authorizeRole } from '../../src/middleware/role';

describe('authorizeRole', () => {
  it('rejects unauthenticated users', () => {
    expect(authorizeRole(null, ['candidate'])).toEqual({ allowed: false, status: 401 });
  });

  it('rejects suspended users', () => {
    expect(authorizeRole({ role: 'employer', status: 'suspended' }, ['employer'])).toEqual({ allowed: false, status: 403 });
  });

  it('allows an active matching role', () => {
    expect(authorizeRole({ role: 'admin', status: 'active' }, ['admin'])).toEqual({ allowed: true, status: 200 });
  });
});
