import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('application unlock transaction', () => {
  it('creates the application and free unlock in one database function', async () => {
    const sql = await readFile('supabase/migrations/0003_business_functions.sql', 'utf8');
    expect(sql).toContain('function public.apply_to_job');
    expect(sql).toContain("insert into public.applications");
    expect(sql).toContain("insert into public.contact_unlocks");
    expect(sql).toContain("'application'");
  });
});
