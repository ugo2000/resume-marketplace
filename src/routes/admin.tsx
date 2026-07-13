import { Hono } from 'hono';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { recordAudit } from '../lib/audit';
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
    const adminId = c.get('sessionUser')!.id;
    const employerId = c.req.param('id');
    const reason = String(body.reason ?? '');
    await decideEmployerReview(c, adminId, employerId, decision, reason);
    await recordAudit(
      c,
      adminId,
      `employer.${decision}`,
      'employer',
      employerId,
      reason ? { reason } : {},
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

  await recordAudit(
    c,
    c.get('sessionUser')!.id,
    'payment.refund_initiated',
    'payment',
    paymentId,
    { reason, stripeRefundId: refund.id },
  );

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


adminRoutes.post('/users/:id/suspend', async (c) => {
  const adminId = c.get('sessionUser')!.id;
  const userId = c.req.param('id');
  if (userId === adminId) return c.json({ error: 'cannot_suspend_self' }, 409);
  const body = await c.req.parseBody();
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 3 || reason.length > 1000) {
    return c.json({ error: 'suspension_reason_required' }, 400);
  }

  const service = getServiceClient(c);
  const { data: user, error: userError } = await service
    .from('users')
    .select('id,role,status')
    .eq('id', userId)
    .maybeSingle();
  if (userError || !user) return c.json({ error: 'user_not_found' }, 404);

  const { error } = await service
    .from('users')
    .update({ status: 'suspended', updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return c.json({ error: 'suspension_failed' }, 500);
  if (user.role === 'employer') {
    await service
      .from('employer_profiles')
      .update({ review_status: 'suspended', updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }
  await recordAudit(c, adminId, 'user.suspended', 'user', userId, {
    reason,
    previousStatus: user.status,
  });
  return c.json({ ok: true });
});

adminRoutes.post('/users/:id/restore', async (c) => {
  const adminId = c.get('sessionUser')!.id;
  const userId = c.req.param('id');
  const service = getServiceClient(c);
  const { data: user, error: userError } = await service
    .from('users')
    .select('id,role,status')
    .eq('id', userId)
    .maybeSingle();
  if (userError || !user) return c.json({ error: 'user_not_found' }, 404);

  const { error } = await service
    .from('users')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return c.json({ error: 'restoration_failed' }, 500);
  if (user.role === 'employer') {
    await service
      .from('employer_profiles')
      .update({ review_status: 'approved', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('review_status', 'suspended');
  }
  await recordAudit(c, adminId, 'user.restored', 'user', userId, {
    previousStatus: user.status,
  });
  return c.json({ ok: true });
});

adminRoutes.post('/jobs/:id/remove', async (c) => {
  const adminId = c.get('sessionUser')!.id;
  const jobId = c.req.param('id');
  const body = await c.req.parseBody();
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 3 || reason.length > 1000) {
    return c.json({ error: 'removal_reason_required' }, 400);
  }
  const { error } = await getServiceClient(c)
    .from('jobs')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) return c.json({ error: 'job_remove_failed' }, 500);
  await recordAudit(c, adminId, 'job.removed', 'job', jobId, { reason });
  return c.json({ ok: true });
});

adminRoutes.get('/reports', async (c) => {
  const { data, error } = await getServiceClient(c)
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  return error
    ? c.json({ error: 'reports_unavailable' }, 500)
    : c.json({ reports: data });
});

adminRoutes.post('/reports/:id/resolve', async (c) => {
  const adminId = c.get('sessionUser')!.id;
  const reportId = c.req.param('id');
  const body = await c.req.parseBody();
  const status = body.status === 'dismissed' ? 'dismissed' : 'resolved';
  const { error } = await getServiceClient(c)
    .from('reports')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) return c.json({ error: 'report_update_failed' }, 500);
  await recordAudit(c, adminId, `report.${status}`, 'report', reportId, {});
  return c.json({ ok: true });
});
