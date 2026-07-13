import { Hono } from 'hono';
import { Field } from '../components/forms';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { getServiceClient, getUserClient } from '../lib/supabase';
import { requireRole } from '../middleware/role';
import { submitEmployerReview } from '../services/employer-service';
import { createJobSlug, jobDraftSchema } from '../services/job-service';
import type { AppVariables } from '../types/app';

export const employerRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

employerRoutes.use('*', requireRole(['employer']));

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
