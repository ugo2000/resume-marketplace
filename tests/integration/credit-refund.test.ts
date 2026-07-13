import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('credit refund transaction', () => {
  it('locks the wallet and rejects refunds after any package credits were spent', async () => {
    const sql = await readFile('supabase/migrations/0003_business_functions.sql', 'utf8');
    expect(sql).toContain('function public.reserve_credit_refund');
    expect(sql).toContain('for update');
    expect(sql).toContain('used_credits_non_refundable');
  });
});
