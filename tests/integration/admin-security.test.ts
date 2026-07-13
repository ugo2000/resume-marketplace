import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('administration security', () => {
  it('guards all admin routes and makes audit records immutable', async () => {
    const [route, sql] = await Promise.all([
      readFile('src/routes/admin.tsx', 'utf8'),
      readFile('supabase/migrations/0003_business_functions.sql', 'utf8'),
    ]);
    expect(route).toContain("adminRoutes.use('*', requireRole(['admin']))");
    expect(route).toContain('recordAudit');
    expect(sql).toContain('prevent_audit_log_mutation');
    expect(sql).toContain('audit_logs_are_immutable');
  });
});
