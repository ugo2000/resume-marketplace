import { Hono } from 'hono';
import { Field } from '../components/forms';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { deletionEmail, queueEmail } from '../lib/email';
import { getStripe } from '../lib/stripe';
import { getServiceClient } from '../lib/supabase';
import { rateLimit } from '../middleware/rate-limit';
import { requireRole } from '../middleware/role';
import { verifyTurnstile } from '../middleware/turnstile';
import {
  addCandidateEducation,
  addCandidateExperience,
  addCandidateSkill,
  candidateCanPublish,
  deleteCandidateSectionRow,
  replaceResumePdf,
  saveCandidateResume,
} from '../services/candidate-service';
import { applyToJob } from '../services/application-service';
import { requestCandidateDeletion } from '../services/cleanup-service';
import { createIdentityCheckout } from '../services/payment-service';
import type { AppVariables } from '../types/app';

export const candidateRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

candidateRoutes.use('*', requireRole(['candidate']));
candidateRoutes.use('/verification/checkout', rateLimit('identity_checkout', 5, 3600, 'user'));

candidateRoutes.use('/resume*', async (c, next) => {
  const { data } = await getServiceClient(c)
    .from('candidate_profiles')
    .select('date_of_birth_confirmed,identity_status')
    .eq('user_id', c.get('sessionUser')!.id)
    .maybeSingle();
  if (!data || !candidateCanPublish(data)) {
    return c.json({ error: 'identity_verification_required' }, 403);
  }
  await next();
});

candidateRoutes.get('/onboarding', (c) =>
  c.html(
    <Layout title="Candidate onboarding">
      <h1>Candidate onboarding</h1>
      <form method="post" action="/candidate/onboarding" class="card form-stack">
        <Field label="Legal name" name="fullName"><input id="fullName" name="fullName" required /></Field>
        <Field label="City" name="city"><input id="city" name="city" required /></Field>
        <Field label="State or province" name="stateProvince"><input id="stateProvince" name="stateProvince" required /></Field>
        <Field label="Country" name="country"><select id="country" name="country"><option value="US">United States</option><option value="CA">Canada</option></select></Field>
        <label><input type="checkbox" name="age18" value="yes" required /> I am at least 18 years old.</label>
        <button>Continue</button>
      </form>
    </Layout>,
  ),
);

candidateRoutes.post('/onboarding', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  const country = String(body.country);
  if (body.age18 !== 'yes' || (country !== 'US' && country !== 'CA')) {
    return c.json({ error: 'ineligible' }, 400);
  }
  const service = getServiceClient(c);
  const { error } = await service.from('candidate_profiles').upsert({
    user_id: user.id,
    full_name: String(body.fullName ?? '').trim(),
    city: String(body.city ?? '').trim(),
    state_province: String(body.stateProvince ?? '').trim(),
    country,
    headline: 'Candidate profile',
    summary: '',
    work_authorization: 'Not specified',
    date_of_birth_confirmed: true,
  });
  if (error) return c.json({ error: 'onboarding_failed' }, 400);
  await service.from('users').update({ country }).eq('id', user.id);
  return c.redirect('/candidate/verification');
});

candidateRoutes.get('/verification', async (c) => {
  const { data } = await getServiceClient(c)
    .from('candidate_profiles')
    .select('identity_status')
    .eq('user_id', c.get('sessionUser')!.id)
    .maybeSingle();
  return c.html(
    <Layout title="Identity verification">
      <h1>Identity verification</h1>
      <p>Status: {data?.identity_status ?? 'not_started'}</p>
      <p>The one-time verification fee is $2.49 USD.</p>
      <form method="post" action="/candidate/verification/checkout"><div class="cf-turnstile" data-sitekey={c.env.TURNSTILE_SITE_KEY}></div><button>Pay and verify</button></form>
      <form method="post" action="/candidate/verification/session"><button>Continue verification</button></form>
    </Layout>,
  );
});

candidateRoutes.post('/verification/checkout', async (c) => {
  const body = await c.req.parseBody();
  if (!(await verifyTurnstile(c, String(body['cf-turnstile-response'] ?? '')))) {
    return c.json({ error: 'bot_check_failed' }, 400);
  }
  const checkout = await createIdentityCheckout(c, c.get('sessionUser')!.id);
  return checkout.url ? c.redirect(checkout.url, 303) : c.json({ error: 'checkout_unavailable' }, 502);
});

candidateRoutes.post('/verification/session', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data: verification } = await service
    .from('identity_verifications')
    .select('id,payment_id,provider_reference_id,status')
    .eq('candidate_id', user.id)
    .maybeSingle();
  if (!verification) return c.json({ error: 'identity_payment_required' }, 402);

  const stripe = getStripe(c);
  if (verification.provider_reference_id) {
    const existing = await stripe.identity.verificationSessions.retrieve(
      verification.provider_reference_id,
    );
    return existing.url
      ? c.redirect(existing.url, 303)
      : c.json({ status: verification.status, error: 'identity_session_unavailable' }, 409);
  }

  try {
    const session = await stripe.identity.verificationSessions.create(
      {
        type: 'document',
        metadata: { candidateId: user.id, verificationId: verification.id },
        return_url: `${c.env.APP_ORIGIN}/candidate/verification`,
        options: { document: { require_matching_selfie: true } },
      },
      { idempotencyKey: `identity-session:${verification.id}` },
    );
    await service
      .from('identity_verifications')
      .update({
        provider_reference_id: session.id,
        status: 'requires_input',
        started_at: new Date().toISOString(),
      })
      .eq('id', verification.id);
    return session.url
      ? c.redirect(session.url, 303)
      : c.json({ error: 'identity_session_unavailable' }, 502);
  } catch {
    const { data: payment } = await service
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('id', verification.payment_id)
      .maybeSingle();
    if (payment?.stripe_payment_intent_id) {
      await stripe.refunds.create(
        { payment_intent: payment.stripe_payment_intent_id },
        { idempotencyKey: `identity-session-failure-refund:${verification.payment_id}` },
      );
    }
    await service.from('payments').update({ status: 'refunded' }).eq('id', verification.payment_id);
    await service.from('identity_verifications').update({ status: 'not_started' }).eq('id', verification.id);
    await service.from('candidate_profiles').update({ identity_status: 'not_started' }).eq('user_id', user.id);
    return c.json({ error: 'verification_session_creation_failed_refunded' }, 502);
  }
});

candidateRoutes.post('/verification/appeal', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 10 || reason.length > 2000) {
    return c.json({ error: 'appeal_reason_invalid' }, 400);
  }
  const { error } = await getServiceClient(c).from('reports').insert({
    reporter_user_id: user.id,
    target_type: 'identity_verification',
    target_id: user.id,
    reason,
  });
  return error
    ? c.json({ error: 'appeal_submission_failed' }, 400)
    : c.json({ ok: true }, 201);
});

candidateRoutes.get('/resume', async (c) => {
  const user = c.get('sessionUser')!;
  const { data } = await getServiceClient(c)
    .from('candidate_profiles')
    .select('full_name,city,state_province,country,phone,headline,summary,years_experience,work_authorization,searchable')
    .eq('user_id', user.id)
    .maybeSingle();
  return c.html(
    <Layout title="Your resume">
      <h1>Your private resume</h1>
      <form method="post" action="/candidate/resume" class="card form-stack">
        <Field label="Full name" name="fullName"><input id="fullName" name="fullName" value={data?.full_name ?? ''} required /></Field>
        <Field label="Headline" name="headline"><input id="headline" name="headline" value={data?.headline ?? ''} required /></Field>
        <Field label="City" name="city"><input id="city" name="city" value={data?.city ?? ''} required /></Field>
        <Field label="State or province" name="stateProvince"><input id="stateProvince" name="stateProvince" value={data?.state_province ?? ''} required /></Field>
        <Field label="Country" name="country"><select id="country" name="country"><option value="US" selected={data?.country === 'US'}>United States</option><option value="CA" selected={data?.country === 'CA'}>Canada</option></select></Field>
        <Field label="Phone (optional)" name="phone"><input id="phone" name="phone" value={data?.phone ?? ''} /></Field>
        <Field label="Summary" name="summary"><textarea id="summary" name="summary">{data?.summary ?? ''}</textarea></Field>
        <Field label="Years of experience" name="yearsExperience"><input id="yearsExperience" name="yearsExperience" type="number" min="0" max="80" value={data?.years_experience ?? 0} /></Field>
        <Field label="Work authorization" name="workAuthorization"><input id="workAuthorization" name="workAuthorization" value={data?.work_authorization ?? ''} required /></Field>
        <label><input name="searchable" type="checkbox" checked={data?.searchable ?? false} /> Searchable by approved employers</label>
        <button>Save resume</button>
      </form>
      <form method="post" action="/candidate/resume/pdf" enctype="multipart/form-data" class="card form-stack">
        <Field label="Optional PDF resume (maximum 5 MB)" name="resume"><input id="resume" name="resume" type="file" accept="application/pdf" /></Field>
        <button>Upload PDF</button>
      </form>
    </Layout>,
  );
});

candidateRoutes.post('/resume', async (c) => {
  const result = await saveCandidateResume(c, c.get('sessionUser')!.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'resume_save_failed' }, 400) : c.json({ ok: true });
});

candidateRoutes.post('/resume/skills', async (c) => {
  const result = await addCandidateSkill(c, c.get('sessionUser')!.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'skill_save_failed' }, 400) : c.json({ ok: true }, 201);
});

candidateRoutes.post('/resume/experience', async (c) => {
  const result = await addCandidateExperience(c, c.get('sessionUser')!.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'experience_save_failed' }, 400) : c.json({ ok: true }, 201);
});

candidateRoutes.post('/resume/education', async (c) => {
  const result = await addCandidateEducation(c, c.get('sessionUser')!.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'education_save_failed' }, 400) : c.json({ ok: true }, 201);
});

candidateRoutes.delete('/resume/:section/:id', async (c) => {
  const sectionMap = {
    skills: 'candidate_skills',
    experience: 'candidate_experience',
    education: 'candidate_education',
  } as const;
  const section = sectionMap[c.req.param('section') as keyof typeof sectionMap];
  if (!section) return c.json({ error: 'invalid_resume_section' }, 400);
  const result = await deleteCandidateSectionRow(
    c,
    c.get('sessionUser')!.id,
    section,
    c.req.param('id'),
  );
  return result.error
    ? c.json({ error: 'resume_section_delete_failed' }, 400)
    : c.json({ ok: true });
});

candidateRoutes.post('/resume/pdf', async (c) => {
  const body = await c.req.parseBody();
  if (!(body.resume instanceof File)) return c.json({ error: 'pdf_required' }, 400);
  await replaceResumePdf(c, c.get('sessionUser')!.id, body.resume);
  return c.json({ ok: true });
});

candidateRoutes.post('/apply/:jobId', async (c) => {
  const body = await c.req.parseBody();
  try {
    const result = await applyToJob(c, c.req.param('jobId'), String(body.coverNote ?? ''));
    return c.json({ ok: true, ...result }, 201);
  } catch {
    return c.json({ error: 'application_not_allowed_or_duplicate' }, 400);
  }
});

candidateRoutes.get('/applications', async (c) => {
  const { data, error } = await getServiceClient(c)
    .from('applications')
    .select('id,status,applied_at,jobs(title,slug)')
    .eq('candidate_id', c.get('sessionUser')!.id)
    .order('applied_at', { ascending: false });
  return error
    ? c.json({ error: 'applications_unavailable' }, 500)
    : c.json({ applications: data });
});

candidateRoutes.get('/settings', (c) => c.html(
  <Layout title="Candidate settings">
    <h1>Candidate settings</h1>
    <section class="card">
      <h2>Delete account</h2>
      <p>Your account is disabled immediately. You may restore it for 30 days before personal resume data is deleted.</p>
      <form method="post" action="/candidate/delete-account">
        <button>Start account deletion</button>
      </form>
    </section>
  </Layout>,
));

candidateRoutes.post('/delete-account', async (c) => {
  try {
    const user = c.get('sessionUser')!;
    const restoreUntil = await requestCandidateDeletion(c, user.id);
    queueEmail(c, deletionEmail(user.email, restoreUntil.toISOString()));
    return c.json({ ok: true, restoreDays: 30, restoreUntil: restoreUntil.toISOString() });
  } catch {
    return c.json({ error: 'account_deletion_request_failed' }, 500);
  }
});
