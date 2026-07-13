import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('candidate search privacy', () => {
  it('returns anonymous fields only and requires an approved employer', async () => {
    const sql = await readFile('supabase/migrations/0003_business_functions.sql', 'utf8');
    expect(sql).toContain('function public.search_candidates');
    expect(sql).toContain('employer_not_approved');
    expect(sql).toContain('initials text');
    expect(sql).not.toContain('returns table (full_name');
  });
});
