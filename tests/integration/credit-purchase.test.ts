import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('credit purchase transaction', () => {
  it('uses an idempotent database function and unique payment ledger key', async () => {
    const sql = await readFile('supabase/migrations/0003_business_functions.sql', 'utf8');
    expect(sql).toContain('grant_credit_purchase');
    expect(sql).toContain('credit_transactions_payment_type_unique');
  });
});
