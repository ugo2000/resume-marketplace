import { Hono } from 'hono';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { getStripe } from '../lib/stripe';
import { getServiceClient } from '../lib/supabase';
import { requireRole } from '../middleware/role';
import { decideEmployerReview } from '../services/employer-service';
import type { AppVariables } from '../types/app';

export const adminRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

adminRoutes.use('*', requireRole(['admin']));

adminRoutes.get('/', (c) => c.html(<Layout title="Administration"><h1>Administration</h1><a href="/admin/employers">Employer reviews</a></Layout>));

adminRoutes.get('/employers', async (c) => {
  const { data } = await getServiceClient(c)
    .from('employer_profiles')
    .select('user_id,company_name,country,review_status,created_at')
    .order('created_at', { ascending: false });
  return c.html(
    <Layout title="Employer reviews">
      <h1>Employer reviews</h1>
      <ul class="job-list">{(data ?? []).map((employer) => <li class="card"><a href={`/admin/employers/${employer.user_id}`}>{employer.company_name}</a><span>{employer.country} · {employer.review_status}</span></li>)}</ul>
    </Layout>,
  );
});

adminRoutes.get('/employers/:id', async (c) => {
  const service = getServiceClient(c);
  const employerId = c.req.param('id');
  const [{ data: employer }, { data: documents }] = await Promise.all([
    service.from('employer_profiles').select('*').eq('user_id', employerId).maybeSingle(),
    service.from('employer_documents').select('id,storage_path,original_filename,mime_type,file_sha256,uploaded_at').eq('employer_id', employerId),
  ]);
  if (!employer) return c.notFound();
  const signedDocuments = await Promise.all(
    (documents ?? []).map(async (document) => {
      const { data, error } = await service.storage
        .from('employer-documents')
        .createSignedUrl(document.storage_path, 300);
      if (error) throw error;
      return { ...document, signedUrl: data.signedUrl };
    }),
  );
  return c.json({ employer, documents: signedDocuments });
});

adminRoutes.post('/employers/:id/decision', async (c) => {
  const body = await c.req.parseBody();
  const decision = body.decision === 'approved'
    ? 'approved'
    : body.decision === 'rejected'
      ? 'rejected'
      : null;
  if (!decision) return c.json({ error: 'invalid_decision' }, 400);
  try {
    await decideEmployerReview(
      c,
      c.get('sessionUser')!.id,
      c.req.param('id'),
      decision,
      String(body.reason ?? ''),
    );
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'review_decision_failed' }, 409);
  }
});


type RefundReason =
  | 'duplicate_charge'
  | 'technical_failure'
  | 'credits_not_delivered'
  | 'legal_requirement';

const refundReasons = new Set<RefundReason>([
  'duplicate_charge',
  'technical_failure',
  'credits_not_delivered',
  'legal_requirement',
]);

adminRoutes.post('/payments/:id/refund', async (c) => {
  const paymentId = c.req.param('id');
  const body = await c.req.parseBody();
  const reason = String(body.reason ?? '') as RefundReason;
  if (!refundReasons.has(reason)) {
    return c.json({ error: 'invalid_refund_reason' }, 400);
  }

  const service = getServiceClient(c);
  const { data: payment, error: paymentError } = await service
    .from('payments')
    .select('id,purpose,status,stripe_payment_intent_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (paymentError || !payment) return c.json({ error: 'payment_not_found' }, 404);
  if (payment.purpose !== 'credit_pack_10' && payment.purpose !== 'credit_pack_25') {
    return c.json({ error: 'payment_not_refundable_by_credit_policy' }, 409);
  }
  if (payment.status === 'refunded') return c.json({ ok: true, duplicate: true });
  if (!payment.stripe_payment_intent_id) {
    return c.json({ error: 'payment_intent_missing' }, 400);
  }

  const { error: reserveError } = await service.rpc('reserve_credit_refund', {
    p_payment_id: paymentId,
  });
  if (reserveError) {
    return c.json(
      {
        error: reserveError.message.includes('used_credits_non_refundable')
          ? 'used_credits_non_refundable'
          : 'credit_refund_reservation_failed',
      },
      409,
    );
  }

  let refund;
  try {
    refund = await getStripe(c).refunds.create(
      {
        payment_intent: payment.stripe_payment_intent_id,
        metadata: {
          paymentId,
          reason,
          initiatedBy: c.get('sessionUser')!.id,
        },
      },
      { idempotencyKey: `admin-credit-refund:${paymentId}` },
    );
  } catch {
    await service.rpc('cancel_credit_refund', { p_payment_id: paymentId });
    return c.json({ error: 'stripe_refund_failed' }, 502);
  }

  const { error: finalizeError } = await service.rpc('refund_credit_purchase', {
    p_payment_id: paymentId,
  });
  if (finalizeError) {
    // Stripe has already accepted the refund. Keep the reservation in place and
    // let the signed charge.refunded webhook retry reconciliation.
    return c.json({ error: 'refund_reconciliation_pending', refundId: refund.id }, 202);
  }

  return c.json({ ok: true, refundId: refund.id, status: refund.status });
});
