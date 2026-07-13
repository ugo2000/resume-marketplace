import { Hono } from 'hono';
import { Field } from '../components/forms';
import { Layout } from '../components/layout';
import { Pagination } from '../components/pagination';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import { rateLimit } from '../middleware/rate-limit';
import { parseJobSearch, searchPublicJobs } from '../services/job-service';
import type { AppVariables } from '../types/app';

export const publicRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

publicRoutes.use('/reports', rateLimit('report', 10, 86400, 'user'));

publicRoutes.get('/', (c) =>
  c.html(
    <Layout title="OpenResume Jobs">
      <section class="hero">
        <p class="eyebrow">United States and Canada</p>
        <h1>Find work without putting your resume on the public web.</h1>
        <p>Browse genuine job opportunities while keeping your profile private to approved employers.</p>
        <a class="button" href="/jobs">Search jobs</a>
      </section>
    </Layout>,
  ),
);

publicRoutes.get('/login', (c) =>
  c.html(
    <Layout title="Sign in">
      <h1>Sign in</h1>
      <form method="post" action="/auth/login" class="card form-stack">
        <Field label="Email" name="email"><input id="email" name="email" type="email" autocomplete="email" required /></Field>
        <Field label="Password" name="password"><input id="password" name="password" type="password" autocomplete="current-password" minlength={12} required /></Field>
        <div class="cf-turnstile" data-sitekey={c.env.TURNSTILE_SITE_KEY}></div>
        <button>Sign in</button>
      </form>
    </Layout>,
  ),
);

const RegisterForm = ({ role, siteKey }: { role: 'candidate' | 'employer'; siteKey: string }) => (
  <form method="post" action={`/auth/register/${role}`} class="card form-stack">
    <Field label="Email" name="email"><input id="email" name="email" type="email" autocomplete="email" required /></Field>
    <Field label="Password" name="password"><input id="password" name="password" type="password" autocomplete="new-password" minlength={12} required /></Field>
    <div class="cf-turnstile" data-sitekey={siteKey}></div>
    <button>Create {role} account</button>
  </form>
);

publicRoutes.get('/register/candidate', (c) => c.html(<Layout title="Create candidate account"><h1>Create candidate account</h1><RegisterForm role="candidate" siteKey={c.env.TURNSTILE_SITE_KEY} /></Layout>));
publicRoutes.get('/register/employer', (c) => c.html(<Layout title="Create employer account"><h1>Create employer account</h1><RegisterForm role="employer" siteKey={c.env.TURNSTILE_SITE_KEY} /></Layout>));

publicRoutes.get('/jobs', async (c) => {
  const parsed = parseJobSearch(c.req.query());
  const { data, count, error } = await searchPublicJobs(c, parsed);
  if (error) return c.text('Unable to load jobs', 500);
  const total = count ?? 0;
  return c.html(
    <Layout title="Jobs">
      <h1>Jobs</h1>
      <form method="get" action="/jobs" class="search-grid">
        <Field label="Keywords" name="q"><input id="q" name="q" value={parsed.q ?? ''} /></Field>
        <Field label="Country" name="country"><select id="country" name="country"><option value="">All</option><option value="US" selected={parsed.country === 'US'}>United States</option><option value="CA" selected={parsed.country === 'CA'}>Canada</option></select></Field>
        <Field label="City" name="city"><input id="city" name="city" value={parsed.city ?? ''} /></Field>
        <button>Search</button>
      </form>
      <p>{total} open roles</p>
      <ul class="job-list">
        {(data ?? []).map((job) => (
          <li class="card">
            <a href={`/jobs/${job.slug}`}><strong>{job.title}</strong></a>
            <span>{job.city}, {job.state_province}, {job.country}</span>
            <span>{job.employment_type} · {job.workplace_type}</span>
          </li>
        ))}
      </ul>
      <Pagination page={parsed.page} total={total} pageSize={parsed.pageSize} baseUrl="/jobs" />
    </Layout>,
  );
});

publicRoutes.get('/jobs/:slug', async (c) => {
  const service = getServiceClient(c);
  const { data } = await service
    .from('jobs')
    .select('id,title,description,city,state_province,country,employment_type,workplace_type,salary_min,salary_max,expires_at')
    .eq('slug', c.req.param('slug'))
    .eq('status', 'published')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!data) return c.notFound();
  return c.html(
    <Layout title={data.title}>
      <article class="card job-detail">
        <h1>{data.title}</h1>
        <p>{data.city}, {data.state_province}, {data.country}</p>
        <p>{data.employment_type} · {data.workplace_type}</p>
        {data.salary_min !== null && data.salary_max !== null ? <p>USD ${data.salary_min}–${data.salary_max}</p> : null}
        <div class="job-description">{data.description}</div>
        <form method="post" action={`/candidate/apply/${data.id}`}><button>Apply</button></form>
      </article>
    </Layout>,
  );
});

publicRoutes.get('/pricing', (c) => c.html(<Layout title="Pricing"><h1>Employer lookup credits</h1><div class="pricing-grid"><section class="card"><h2>10 unlocks</h2><p class="price">$30 USD</p></section><section class="card"><h2>25 unlocks</h2><p class="price">$75 USD</p></section></div><p>Credits never expire. One credit permanently unlocks one candidate for your company.</p></Layout>));
publicRoutes.get('/for-employers', (c) => c.html(<Layout title="For employers"><h1>Hire with verified, private resumes</h1><p>Approved employers publish up to 10 active jobs for free and can search verified candidates.</p><a class="button" href="/register/employer">Apply for an employer account</a></Layout>));
publicRoutes.get('/privacy', (c) => c.html(<Layout title="Privacy"><h1>Privacy</h1><p>Candidate profiles are private and available only to approved employers. Government ID and selfie images are processed by the identity provider and are not stored by this platform.</p></Layout>));
publicRoutes.get('/terms', (c) => c.html(<Layout title="Terms"><h1>Terms</h1><p>Employers must post lawful, genuine employment opportunities. Final public terms require qualified US and Canadian legal review before launch.</p></Layout>));
publicRoutes.get('/identity-verification', (c) => c.html(<Layout title="Identity verification"><h1>Identity verification</h1><p>Candidates pay $2.49 USD once and complete third-party identity verification before publishing a resume or applying.</p></Layout>));


publicRoutes.post('/reports', async (c) => {
  const user = c.get('sessionUser');
  if (!user || user.status !== 'active') {
    return c.json({ error: 'authentication_required' }, 401);
  }
  const body = await c.req.parseBody();
  const targetType = String(body.targetType ?? '').trim();
  const targetId = String(body.targetId ?? '').trim();
  const reason = String(body.reason ?? '').trim();
  if (!['job', 'candidate', 'employer'].includes(targetType)) {
    return c.json({ error: 'invalid_report_target' }, 400);
  }
  if (!targetId || reason.length < 10 || reason.length > 2000) {
    return c.json({ error: 'invalid_report' }, 400);
  }

  const { error } = await getServiceClient(c).from('reports').insert({
    reporter_user_id: user.id,
    target_type: targetType,
    target_id: targetId,
    reason,
  });
  return error
    ? c.json({ error: 'report_failed' }, 400)
    : c.json({ ok: true }, 201);
});
