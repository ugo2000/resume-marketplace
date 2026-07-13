import type { AppContext } from '../lib/supabase';
import { getStripe } from '../lib/stripe';

export const creditPack = (pack: string) => {
  if (pack === '10') {
    return { purpose: 'credit_pack_10' as const, credits: 10, amountCents: 3000 };
  }
  if (pack === '25') {
    return { purpose: 'credit_pack_25' as const, credits: 25, amountCents: 7500 };
  }
  throw new Error('invalid_credit_pack');
};

export const createCreditCheckout = async (
  c: AppContext,
  employerId: string,
  packId: string,
) => {
  const pack = creditPack(packId);
  const price = packId === '10'
    ? c.env.STRIPE_CREDITS_10_PRICE_ID
    : c.env.STRIPE_CREDITS_25_PRICE_ID;

  return getStripe(c).checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: employerId,
      success_url: `${c.env.APP_ORIGIN}/employer/credits?success=1`,
      cancel_url: `${c.env.APP_ORIGIN}/employer/credits?cancelled=1`,
      metadata: {
        purpose: pack.purpose,
        userId: employerId,
        credits: String(pack.credits),
      },
    },
    {
      idempotencyKey: `credit-checkout:${employerId}:${packId}:${new Date()
        .toISOString()
        .slice(0, 10)}`,
    },
  );
};
