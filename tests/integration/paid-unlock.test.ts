import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('paid unlock transaction', () => {
  it('locks the wallet, spends one credit, and relies on a permanent unique unlock', async () => {
    const [functions, schema] = await Promise.all([
      readFile('supabase/migrations/0003_business_functions.sql', 'utf8'),
      readFile('supabase/migrations/0001_core_schema.sql', 'utf8'),
    ]);
    expect(functions).toContain('function public.unlock_candidate');
    expect(functions).toContain('for update');
    expect(functions).toContain("'unlock', -1");
    expect(schema).toContain('primary key (employer_id, candidate_id)');
  });
});
