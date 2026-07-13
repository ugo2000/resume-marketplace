import { describe, expect, it } from 'vitest';
import { shouldProcessWebhook } from '../../src/services/payment-service';

describe('shouldProcessWebhook', () => {
  it('processes only previously unseen event ids', async () => {
    const seen = new Set<string>();
    const claim = async (id: string) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    };
    await expect(shouldProcessWebhook('evt_1', claim)).resolves.toBe(true);
    await expect(shouldProcessWebhook('evt_1', claim)).resolves.toBe(false);
  });
});
