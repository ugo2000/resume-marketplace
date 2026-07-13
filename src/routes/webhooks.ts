import { Hono } from 'hono';
import type Stripe from 'stripe';
import type { Bindings } from '../env';
import { getStripe } from '../lib/stripe';
import { getServiceClient } from '../lib/supabase';
import {
  claimWebhook,
  grantPurchasedCredits,
  identityStatusForEvent,
  releaseWebhookClaim,
} from '../services/payment-service';
import type { AppVariables } from '../types/app';
import type { Database } from '../types/database';

export const webhookRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

const processCheckout = async (
  c: Parameters<typeof getServiceClient>[0],
  session: Stripe.Checkout.Session,
) => {
  const userId = session.metadata?.userId;
  const purpose = session.metadata?.purpose as
    | Database['public']['Enums']['payment_purpose']
    | undefined;
  if (!userId || !purpose) throw new Error('missing_checkout_metadata');

  const service = getServiceClient(c);
  const { data: payment, error } = await service
    .from('payments')
    .upsert(
      {
        user_id: userId,
        purpose,
        amount_cents: session.amount_total ?? 0,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
        status: 'paid',
      },
      { onConflict: 'stripe_checkout_session_id' },
    )
    .select('id')
    .single();
  if (error || !payment) throw error ?? new Error('payment_persistence_failed');

  if (purpose === 'identity_fee') {
    const { data: profile } = await service
      .from('candidate_profiles')
      .select('country')
      .eq('user_id', userId)
      .single();
    if (!profile) throw new Error('candidate_profile_missing');
    await service.from('identity_verifications').upsert(
      {
        candidate_id: userId,
        payment_id: payment.id,
        status: 'payment_pending',
        country: profile.country,
      },
      { onConflict: 'candidate_id' },
    );
    await service
      .from('candidate_profiles')
      .update({ identity_status: 'payment_pending' })
      .eq('user_id', userId);
  } else {
    await grantPurchasedCredits(c, userId, purpose, payment.id);
  }
};

webhookRoutes.post('/stripe', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.text('missing signature', 400);

  const stripe = getStripe(c);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return c.text('invalid signature', 400);
  }

  if (!(await claimWebhook(c, 'stripe', event))) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await processCheckout(c, event.data.object);
    }
    return c.json({ received: true });
  } catch {
    await releaseWebhookClaim(c, 'stripe', event.id);
    return c.text('webhook processing failed', 500);
  }
});

webhookRoutes.post('/stripe-identity', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.text('missing signature', 400);

  const stripe = getStripe(c);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_IDENTITY_WEBHOOK_SECRET,
    );
  } catch {
    return c.text('invalid signature', 400);
  }

  if (!(await claimWebhook(c, 'stripe_identity', event))) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    const status = identityStatusForEvent(event.type);
    if (status) {
      const session = event.data.object as Stripe.Identity.VerificationSession;
      const candidateId = session.metadata.candidateId;
      if (!candidateId) throw new Error('candidate_metadata_missing');
      const verifiedAt = status === 'verified' ? new Date().toISOString() : null;
      const service = getServiceClient(c);
      await service
        .from('identity_verifications')
        .update({ status, verified_at: verifiedAt })
        .eq('provider_reference_id', session.id);
      await service
        .from('candidate_profiles')
        .update({ identity_status: status, identity_verified_at: verifiedAt })
        .eq('user_id', candidateId);
    }
    return c.json({ received: true });
  } catch {
    await releaseWebhookClaim(c, 'stripe_identity', event.id);
    return c.text('webhook processing failed', 500);
  }
});
