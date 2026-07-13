import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const requiredTables = [
  'users',
  'candidate_profiles',
  'employer_profiles',
  'jobs',
  'applications',
  'credit_wallets',
  'contact_unlocks',
  'payments',
] as const;

describe('database schema', () => {
  it('defines the core marketplace tables and private storage buckets', async () => {
    const core = await readFile('supabase/migrations/0001_core_schema.sql', 'utf8');
    const rls = await readFile('supabase/migrations/0002_rls_and_storage.sql', 'utf8');

    for (const table of requiredTables) {
      expect(core).toContain(`create table public.${table}`);
      expect(rls).toContain(`alter table public.${table} enable row level security`);
    }
    expect(rls).toContain("'resume-pdfs'");
    expect(rls).toContain("'employer-documents'");
  });

  it.runIf(Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_KEY))(
    'is queryable on the configured remote project',
    async () => {
      const client = createClient(
        process.env.SUPABASE_TEST_URL!,
        process.env.SUPABASE_TEST_SERVICE_KEY!,
      );
      const { error } = await client.from('credit_wallets').select('employer_id').limit(1);
      expect(error).toBeNull();
    },
  );
});
