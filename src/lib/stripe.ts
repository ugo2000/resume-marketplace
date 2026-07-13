import Stripe from 'stripe';
import type { AppContext } from './supabase';

export const getStripe = (c: AppContext) =>
  new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

export const creditQuantityForPurpose = (
  purpose: 'credit_pack_10' | 'credit_pack_25',
) => (purpose === 'credit_pack_10' ? 10 : 25);
