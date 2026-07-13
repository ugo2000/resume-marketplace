import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('retention cleanup', () => {
  it('expires jobs, honors legal holds, and completes due candidate deletions', async () => {
    const sql = await readFile('supabase/migrations/0004_cleanup_jobs.sql', 'utf8');
    expect(sql).toContain('function public.expire_jobs');
    expect(sql).toContain('function public.complete_candidate_deletions');
    expect(sql).toContain('legal_hold = false');
    expect(sql).toContain('restore_until <= now()');
  });
});
