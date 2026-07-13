import { Hono } from 'hono';
import { Field } from '../components/forms';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { createResumeSignedUrl } from '../lib/signed-files';
import { getServiceClient, getUserClient } from '../lib/supabase';
import { rateLimit } from '../middleware/rate-limit';
import { requireRole } from '../middleware/role';
import { verifyTurnstile } from '../middleware/turnstile';
import { createCreditCheckout } from '../services/credit-service';
import { submitEmployerReview } from '../services/employer-service';
import { createJobSlug, jobDraftSchema } from '../services/job-service';
import { getAuthorizedCandidate, unlockCandidate } from '../services/unlock-service';
import type { AppVariables } from '../types/app';

export const employerRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

employerRoutes.use('*', requireRole(['employer']));
employerRoutes.use('/onboarding', rateLimit('employer_submission', 3, 86400, 'user'));
employerRoutes.use('/jobs', rateLimit('job_write', 30, 3600, 'user'));
employerRoutes.use('/candidates', rateLimit('candidate_search', 120, 3600, 'user'));
employerRoutes.use('/candidates/*/unlock', rateLimit('candidate_unlock', 60, 3600, 'user'));
employerRoutes.use('/credits/checkout/*', rateLimit('credit_checkout', 10, 3600, 'user'));

const requireApprovedEmployer = async (c: Parameters<typeof getServiceClient>[0], next: () => Promise<void>) => {
  const { data } = await getServiceClient(c)
    .from('employer_profiles')
    .select('review_status')
    .eq('user_id', c.get('sessionUser')!.id)
    .maybeSingle();
  if (data?.review_status !== 'approved') {
    return c.json({ error: 'employer_not_approved' }, 403);
  }
  await next();
};

employerRoutes.use('/jobs*', requireApprovedEmployer);
employerRoutes.use('/credits*', requireApprovedEmployer);
employerRoutes.use('/candidates*', requireApprovedEmployer);
employerRoutes.use('/unlocked*', requireApprovedEmployer);

employerRoutes.get('/onboarding', (c) =>
  c.html(
    <Layout title="Employer verification">
      <h1>Verify your business</h1>
      <p>Employer accounts are reviewed manually before jobs or candidate search become available.</p>
      <form method="post" action="/employer/onboarding" enctype="multipart/form-data" class="card form-stack">
        <Field label="Company name" name="companyName"><input id="companyName" name="companyName" required /></Field>
        <Field label="Website" name="website"><input id="website" name="website" type="url" required /></Field>
        <Field label="Company email" name="companyEmail"><input id="companyEmail" name="companyEmail" type="email" required /></Field>
        <Field label="Registration number" name="registrationNumber"><input id="registrationNumber" name="registrationNumber" required /></Field>
        <Field label="Country" name="country"><select id="country" name="country"><option value="US">United States</option><option value="CA">Canada</option></select></Field>
        <Field label="Registration proof" name="document"><input id="document" name="document" type="file" accept="application/pdf,image/png,image/jpeg" required /></Field>
        <div class="cf-turnstile" data-sitekey={c.env.TURNSTILE_SITE_KEY}></div>
        <button>Submit for review</button>
      </form>
    </Layout>,
  ),
);

employerRoutes.post('/onboarding', async (c) => {
  const body = await c.req.parseBody();
  if (!(body.document instanceof File)) {
    return c.json({ error: 'registration_document_required' }, 400);
  }
  if (!(await verifyTurnstile(c, String(body['cf-turnstile-response'] ?? '')))) {
    return c.json({ error: 'bot_check_failed' }, 400);
  }
  try {
    await submitEmployerReview(c, c.get('sessionUser')!.id, body, body.document);
    return c.redirect('/employer/review-status', 303);
  } catch {
    return c.json({ error: 'employer_review_submission_failed' }, 400);
  }
});

employerRoutes.get('/review-status', async (c) => {
  const { data } = await getServiceClient(c)
    .from('employer_profiles')
    .select('company_name,review_status,rejection_reason,reviewed_at')
    .eq('user_id', c.get('sessionUser')!.id)
    .maybeSingle();
  return c.html(
    <Layout title="Employer review status">
      <h1>Employer review</h1>
      <div class="card">
        <p>Company: {data?.company_name ?? 'Not submitted'}</p>
        <p>Status: {data?.review_status ?? 'draft'}</p>
        {data?.rejection_reason ? <p>Reason: {data.rejection_reason}</p> : null}
      </div>
    </Layout>,
  );
});


employerRoutes.get('/jobs', async (c) => {
  const { data } = await getServiceClient(c)
    .from('jobs')
    .select('id,title,status,expires_at')
    .eq('employer_id', c.get('sessionUser')!.id)
    .order('created_at', { ascending: false });
  return c.html(
    <Layout title="Employer jobs">
      <h1>Jobs</h1>
      <a class="button" href="/employer/jobs/new">New job</a>
      <ul class="job-list">{(data ?? []).map((job) => <li class="card"><strong>{job.title}</strong><span>{job.status}</span>{job.expires_at ? <span>Expires {job.expires_at.slice(0, 10)}</span> : null}<form method="post" action={`/employer/jobs/${job.id}/publish`}><button>Publish</button></form></li>)}</ul>
    </Layout>,
  );
});

employerRoutes.get('/jobs/new', (c) => c.html(
  <Layout title="New job">
    <h1>New job</h1>
    <form method="post" action="/employer/jobs" class="card form-stack">
      <Field label="Title" name="title"><input id="title" name="title" required /></Field>
      <Field label="Description" name="description"><textarea id="description" name="description" required /></Field>
      <Field label="City" name="city"><input id="city" name="city" required /></Field>
      <Field label="State or province" name="stateProvince"><input id="stateProvince" name="stateProvince" required /></Field>
      <Field label="Country" name="country"><select id="country" name="country"><option value="US">United States</option><option value="CA">Canada</option></select></Field>
      <Field label="Employment type" name="employmentType"><input id="employmentType" name="employmentType" required /></Field>
      <Field label="Workplace type" name="workplaceType"><input id="workplaceType" name="workplaceType" required /></Field>
      <Field label="Minimum salary (USD, optional)" name="salaryMin"><input id="salaryMin" name="salaryMin" type="number" min="0" /></Field>
      <Field label="Maximum salary (USD, optional)" name="salaryMax"><input id="salaryMax" name="salaryMax" type="number" min="0" /></Field>
      <button>Save draft</button>
    </form>
  </Layout>,
));

employerRoutes.post('/jobs', async (c) => {
  const parsed = jobDraftSchema.safeParse(await c.req.parseBody());
  if (!parsed.success) return c.json({ error: 'job_invalid' }, 400);
  const input = parsed.data;
  const { data, error } = await getServiceClient(c).from('jobs').insert({
    employer_id: c.get('sessionUser')!.id,
    slug: createJobSlug(input.title),
    title: input.title,
    description: input.description,
    city: input.city,
    state_province: input.stateProvince,
    country: input.country,
    employment_type: input.employmentType,
    workplace_type: input.workplaceType,
    salary_min: input.salaryMin,
    salary_max: input.salaryMax,
  }).select('id').single();
  return error || !data
    ? c.json({ error: 'job_create_failed' }, 400)
    : c.json({ jobId: data.id }, 201);
});

employerRoutes.post('/jobs/:id/update', async (c) => {
  const parsed = jobDraftSchema.safeParse(await c.req.parseBody());
  if (!parsed.success) return c.json({ error: 'job_invalid' }, 400);
  const input = parsed.data;
  const { error } = await getServiceClient(c).from('jobs').update({
    title: input.title,
    description: input.description,
    city: input.city,
    state_province: input.stateProvince,
    country: input.country,
    employment_type: input.employmentType,
    workplace_type: input.workplaceType,
    salary_min: input.salaryMin,
    salary_max: input.salaryMax,
    updated_at: new Date().toISOString(),
  }).eq('id', c.req.param('id')).eq('employer_id', c.get('sessionUser')!.id);
  return error ? c.json({ error: 'job_update_failed' }, 400) : c.json({ ok: true });
});

employerRoutes.post('/jobs/:id/close', async (c) => {
  const { error } = await getServiceClient(c).from('jobs').update({
    status: 'closed',
    updated_at: new Date().toISOString(),
  }).eq('id', c.req.param('id')).eq('employer_id', c.get('sessionUser')!.id);
  return error ? c.json({ error: 'job_close_failed' }, 400) : c.json({ ok: true });
});

employerRoutes.post('/jobs/:id/publish', async (c) => {
  const { data, error } = await getUserClient(c).rpc('publish_job', { p_job_id: c.req.param('id') });
  return error ? c.json({ error: error.message }, 400) : c.json({ job: data });
});

employerRoutes.post('/jobs/:id/renew', async (c) => {
  const { data, error } = await getUserClient(c).rpc('renew_job', { p_job_id: c.req.param('id') });
  return error ? c.json({ error: error.message }, 400) : c.json({ job: data });
});


employerRoutes.get('/applications', async (c) => {
  const employerId = c.get('sessionUser')!.id;
  const service = getServiceClient(c);
  const { data: jobs } = await service
    .from('jobs')
    .select('id,title')
    .eq('employer_id', employerId);
  const jobIds = (jobs ?? []).map((job) => job.id);
  if (jobIds.length === 0) return c.json({ applications: [] });

  const { data: applications, error } = await service
    .from('applications')
    .select('id,job_id,candidate_id,status,cover_note,applied_at')
    .in('job_id', jobIds)
    .order('applied_at', { ascending: false });
  if (error) return c.json({ error: 'applications_unavailable' }, 500);

  const candidateIds = [...new Set((applications ?? []).map((item) => item.candidate_id))];
  const [{ data: profiles }, { data: users }, { data: files }] = await Promise.all([
    service.from('candidate_profiles').select('user_id,full_name,phone,headline').in('user_id', candidateIds),
    service.from('users').select('id,email').in('id', candidateIds),
    service.from('resume_files').select('candidate_id,storage_path').in('candidate_id', candidateIds),
  ]);
  const jobsById = new Map((jobs ?? []).map((job) => [job.id, job]));
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const usersById = new Map((users ?? []).map((user) => [user.id, user]));
  const filesById = new Map((files ?? []).map((file) => [file.candidate_id, file]));

  const output = await Promise.all((applications ?? []).map(async (application) => {
    const file = filesById.get(application.candidate_id);
    return {
      ...application,
      job: jobsById.get(application.job_id) ?? null,
      candidate: profilesById.get(application.candidate_id) ?? null,
      email: usersById.get(application.candidate_id)?.email ?? null,
      resumeUrl: file ? await createResumeSignedUrl(c, file.storage_path) : null,
    };
  }));
  return c.json({ applications: output });
});


employerRoutes.get('/credits', async (c) => {
  const employerId = c.get('sessionUser')!.id;
  const service = getServiceClient(c);
  const [{ data: wallet }, { data: ledger }] = await Promise.all([
    service
      .from('credit_wallets')
      .select('available_credits,purchased_credits,used_credits,updated_at')
      .eq('employer_id', employerId)
      .maybeSingle(),
    service
      .from('credit_transactions')
      .select('id,type,quantity,created_at,metadata')
      .eq('employer_id', employerId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return c.html(
    <Layout title="Employer credits">
      <h1>Candidate lookup credits</h1>
      <div class="card">
        <p><strong>{wallet?.available_credits ?? 0}</strong> credits available</p>
        <p>Credits never expire. One credit permanently unlocks one candidate.</p>
      </div>
      <div class="grid">
        <form method="post" action="/employer/credits/checkout/10" class="card">
          <h2>10 lookups</h2>
          <p>USD $30.00</p>
          <div class="cf-turnstile" data-sitekey={c.env.TURNSTILE_SITE_KEY}></div>
          <button>Buy 10 credits</button>
        </form>
        <form method="post" action="/employer/credits/checkout/25" class="card">
          <h2>25 lookups</h2>
          <p>USD $75.00</p>
          <div class="cf-turnstile" data-sitekey={c.env.TURNSTILE_SITE_KEY}></div>
          <button>Buy 25 credits</button>
        </form>
      </div>
      <h2>Ledger</h2>
      <ul class="job-list">
        {(ledger ?? []).map((entry) => (
          <li class="card">
            <strong>{entry.type}</strong>
            <span>{entry.quantity > 0 ? '+' : ''}{entry.quantity} credits</span>
            <span>{entry.created_at.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </Layout>,
  );
});

employerRoutes.post('/credits/checkout/:pack', async (c) => {
  const body = await c.req.parseBody();
  if (!(await verifyTurnstile(c, String(body['cf-turnstile-response'] ?? '')))) {
    return c.json({ error: 'bot_check_failed' }, 400);
  }
  try {
    const session = await createCreditCheckout(
      c,
      c.get('sessionUser')!.id,
      c.req.param('pack'),
    );
    if (!session.url) return c.json({ error: 'checkout_url_missing' }, 502);
    return c.redirect(session.url, 303);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'credit_checkout_failed' },
      400,
    );
  }
});


employerRoutes.get('/candidates', async (c) => {
  const countryQuery = c.req.query('country');
  const country = countryQuery === 'US' || countryQuery === 'CA' ? countryQuery : null;
  const minimumYears = Number.parseInt(c.req.query('minYears') ?? '', 10);
  const { data, error } = await getUserClient(c).rpc('search_candidates', {
    p_query: c.req.query('q') || null,
    p_country: country,
    p_state: c.req.query('state') || null,
    p_city: c.req.query('city') || null,
    p_min_years: Number.isFinite(minimumYears) ? minimumYears : null,
    p_limit: 20,
    p_offset: 0,
  });
  if (error) return c.json({ error: error.message }, 403);

  return c.html(
    <Layout title="Candidate search">
      <h1>Candidate search</h1>
      <form method="get" action="/employer/candidates" class="card form-stack">
        <Field label="Keywords" name="q"><input id="q" name="q" value={c.req.query('q') ?? ''} /></Field>
        <Field label="Country" name="country">
          <select id="country" name="country">
            <option value="">Any</option>
            <option value="US" selected={country === 'US'}>United States</option>
            <option value="CA" selected={country === 'CA'}>Canada</option>
          </select>
        </Field>
        <Field label="State or province" name="state"><input id="state" name="state" value={c.req.query('state') ?? ''} /></Field>
        <Field label="City" name="city"><input id="city" name="city" value={c.req.query('city') ?? ''} /></Field>
        <Field label="Minimum years of experience" name="minYears"><input id="minYears" name="minYears" type="number" min="0" value={c.req.query('minYears') ?? ''} /></Field>
        <button>Search</button>
      </form>
      <p>Names and contact details stay hidden until the candidate is unlocked.</p>
      <ul class="job-list">
        {(data ?? []).map((candidate) => (
          <li class="card">
            <h2>{candidate.initials} — {candidate.headline}</h2>
            <p>{candidate.city}, {candidate.state_province}, {candidate.country}</p>
            <p>{candidate.years_experience} years experience</p>
            <p>{candidate.summary}</p>
            <p>{candidate.skills.join(' · ')}</p>
            <form method="post" action={`/employer/candidates/${candidate.candidate_id}/unlock`}>
              <button>Unlock contact — 1 credit</button>
            </form>
          </li>
        ))}
      </ul>
    </Layout>,
  );
});

employerRoutes.post('/candidates/:id/unlock', async (c) => {
  try {
    const result = await unlockCandidate(c, c.req.param('id'));
    return c.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unlock_failed';
    return c.json(
      { error: message },
      message.includes('insufficient_credits') ? 402 : 400,
    );
  }
});

employerRoutes.get('/candidates/:id', async (c) => {
  try {
    const candidate = await getAuthorizedCandidate(
      c,
      c.get('sessionUser')!.id,
      c.req.param('id'),
    );
    return candidate
      ? c.json({ candidate })
      : c.json({ error: 'candidate_locked' }, 403);
  } catch {
    return c.json({ error: 'candidate_unavailable' }, 500);
  }
});

employerRoutes.get('/unlocked', async (c) => {
  const employerId = c.get('sessionUser')!.id;
  const service = getServiceClient(c);
  const { data: unlocks, error } = await service
    .from('contact_unlocks')
    .select('candidate_id,source,unlocked_at')
    .eq('employer_id', employerId)
    .order('unlocked_at', { ascending: false });
  if (error) return c.json({ error: 'unlocked_candidates_unavailable' }, 500);

  const candidates = await Promise.all(
    (unlocks ?? []).map(async (unlock) => {
      const candidate = await getAuthorizedCandidate(c, employerId, unlock.candidate_id);
      return candidate
        ? {
            candidateId: unlock.candidate_id,
            source: unlock.source,
            unlockedAt: unlock.unlocked_at,
            fullName: candidate.full_name,
            headline: candidate.headline,
            email: candidate.email,
          }
        : null;
    }),
  );
  return c.json({ candidates: candidates.filter(Boolean) });
});
