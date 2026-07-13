import type Stripe from 'stripe';
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';
import { creditQuantityForPurpose, getStripe } from '../lib/stripe';
import type { Database } from '../types/database';

export const shouldProcessWebhook = async (
  eventId: string,
  claim: (eventId: string) => Promise<boolean>,
) => claim(eventId);

export const identityStatusForEvent = (
  eventType: string,
): 'verified' | 'requires_input' | null => {
  if (eventType === 'identity.verification_session.verified') return 'verified';
  if (eventType === 'identity.verification_session.requires_input') return 'requires_input';
  return null;
};

export const claimWebhook = async (
  c: AppContext,
  provider: string,
  event: Stripe.Event,
) => {
  const { error } = await getServiceClient(c).from('webhook_events').insert({
    provider,
    event_id: event.id,
    event_type: event.type,
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
};

export const releaseWebhookClaim = async (
  c: AppContext,
  provider: string,
  eventId: string,
) => {
  await getServiceClient(c)
    .from('webhook_events')
    .delete()
    .eq('provider', provider)
    .eq('event_id', eventId);
};

export const createIdentityCheckout = async (c: AppContext, candidateId: string) =>
  getStripe(c).checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [{ price: c.env.STRIPE_IDENTITY_PRICE_ID, quantity: 1 }],
      success_url: `${c.env.APP_ORIGIN}/candidate/verification?paid=1`,
      cancel_url: `${c.env.APP_ORIGIN}/candidate/verification?cancelled=1`,
      client_reference_id: candidateId,
      metadata: { purpose: 'identity_fee', userId: candidateId },
    },
    { idempotencyKey: `identity-checkout:${candidateId}` },
  );

export const grantPurchasedCredits = async (
  c: AppContext,
  userId: string,
  purpose: 'credit_pack_10' | 'credit_pack_25',
  paymentId: string,
) => {
  const { error } = await getServiceClient(c).rpc('grant_credit_purchase', {
    p_employer_id: userId,
    p_quantity: creditQuantityForPurpose(purpose),
    p_payment_id: paymentId,
  });
  if (error) throw error;
};
