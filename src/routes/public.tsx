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

const EmployerRegisterForm = ({ siteKey }: { siteKey: string }) => (
  <form method="post" action="/auth/register/employer" class="card form-stack">
    <Field label="Email" name="email"><input id="email" name="email" type="email" autocomplete="email" required /></Field>
    <Field label="Password" name="password"><input id="password" name="password" type="password" autocomplete="new-password" minlength={12} required /></Field>
    <div class="cf-turnstile" data-sitekey={siteKey}></div>
    <button>Create employer account</button>
  </form>
);

const CandidateRegisterForm = ({ siteKey }: { siteKey: string }) => (
  <section class="registration-shell">
    <header class="registration-intro">
      <p class="eyebrow">Private candidate account</p>
      <h1>Create your candidate account</h1>
      <p>
        Complete all three steps. Your account is created only after the final
        submission.
      </p>
    </header>

    <ol class="registration-progress" aria-label="Registration progress">
      <li data-progress-step="1" aria-current="step"><span>1</span>Account</li>
      <li data-progress-step="2"><span>2</span>Job profile</li>
      <li data-progress-step="3"><span>3</span>Review</li>
    </ol>

    <form
      method="post"
      action="/auth/register/candidate"
      class="card registration-form"
      data-candidate-registration
    >
      <p class="form-status" data-registration-status aria-live="polite">
        Step 1 of 3: Account
      </p>

      <fieldset data-registration-step="1">
        <legend tabindex={-1}>Step 1: Create account</legend>
        <p class="form-note" id="account-step-note">
          Nothing is submitted and no account is created until you finish Step 3.
        </p>
        <div class="form-grid">
          <Field label="Email address" name="email">
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              maxlength={320}
              aria-describedby="account-step-note"
              required
            />
          </Field>
          <Field label="Password" name="password">
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="new-password"
              minlength={12}
              maxlength={128}
              aria-describedby="password-note"
              required
            />
          </Field>
          <p class="form-note field-span" id="password-note">
            Use 12–128 characters. A password manager is recommended.
          </p>
          <Field label="Confirm password" name="confirmPassword">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autocomplete="new-password"
              minlength={12}
              maxlength={128}
              required
            />
          </Field>
        </div>
        <div class="registration-actions">
          <button type="button" data-next-step="2">Continue</button>
        </div>
      </fieldset>

      <fieldset data-registration-step="2">
        <legend tabindex={-1}>Step 2: Job profile</legend>
        <p class="form-note">
          This information creates your private candidate profile after final submission.
        </p>
        <div class="form-grid">
          <Field label="Legal name" name="fullName">
            <input id="fullName" name="fullName" autocomplete="name" minlength={2} maxlength={160} required />
          </Field>
          <Field label="Country" name="country">
            <select id="country" name="country" autocomplete="country" required>
              <option value="">Select a country</option>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </Field>
          <Field label="State or province" name="stateProvince">
            <input id="stateProvince" name="stateProvince" autocomplete="address-level1" maxlength={120} required />
          </Field>
          <Field label="City" name="city">
            <input id="city" name="city" autocomplete="address-level2" maxlength={120} required />
          </Field>
          <Field label="Desired job title" name="headline">
            <input id="headline" name="headline" autocomplete="organization-title" minlength={2} maxlength={160} required />
          </Field>
          <Field label="Years of experience" name="yearsExperience">
            <input id="yearsExperience" name="yearsExperience" type="number" inputmode="numeric" min={0} max={80} step={1} required />
          </Field>
          <Field label="Work authorization" name="workAuthorization">
            <select id="workAuthorization" name="workAuthorization" required>
              <option value="">Select your status</option>
              <option value="authorized_without_sponsorship">Authorized without sponsorship</option>
              <option value="future_sponsorship_may_be_required">May require sponsorship in the future</option>
              <option value="sponsorship_required">Requires sponsorship</option>
            </select>
          </Field>
        </div>
        <div class="registration-actions">
          <button type="button" class="secondary-button" data-back-step="1">Back</button>
          <button type="button" data-next-step="3">Continue</button>
        </div>
      </fieldset>

      <fieldset data-registration-step="3">
        <legend tabindex={-1}>Step 3: Review and confirm</legend>
        <p class="form-note">Review your non-sensitive details before creating the account.</p>
        <dl class="review-list">
          <div><dt>Email</dt><dd data-review-field="email">—</dd></div>
          <div><dt>Legal name</dt><dd data-review-field="fullName">—</dd></div>
          <div><dt>Location</dt><dd data-review-field="location">—</dd></div>
          <div><dt>Desired job title</dt><dd data-review-field="headline">—</dd></div>
          <div><dt>Experience</dt><dd data-review-field="yearsExperience">—</dd></div>
          <div><dt>Work authorization</dt><dd data-review-field="workAuthorization">—</dd></div>
        </dl>

        <section class="registration-disclosure" aria-labelledby="privacy-disclosure-title">
          <h2 id="privacy-disclosure-title">Privacy and verification</h2>
          <ul>
            <li>Registration is free.</li>
            <li>Your candidate profile is not published on the open web.</li>
            <li>Only approved employers can access eligible profiles under platform rules.</li>
            <li>A one-time $2.49 USD identity-verification fee is required before publishing a resume or applying for jobs.</li>
            <li>Government ID and selfie media are handled by the identity provider and are not stored by this application.</li>
          </ul>
        </section>

        <div class="confirmation-list">
          <label class="checkbox-field">
            <input name="age18" type="checkbox" required />
            <span>I confirm that I am at least 18 years old.</span>
          </label>
          <label class="checkbox-field">
            <input name="termsAccepted" type="checkbox" required />
            <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a>.</span>
          </label>
          <label class="checkbox-field">
            <input name="privacyAccepted" type="checkbox" required />
            <span>I acknowledge the <a href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a>.</span>
          </label>
        </div>

        <div class="cf-turnstile" data-sitekey={siteKey}></div>
        <div class="registration-actions">
          <button type="button" class="secondary-button" data-back-step="2">Back</button>
          <button type="submit" data-final-submit>Create candidate account</button>
        </div>
      </fieldset>
    </form>

    <p>Already registered? <a href="/login">Sign in</a>.</p>
    <script src="/candidate-registration.js" defer></script>
  </section>
);

publicRoutes.get('/register/candidate', (c) => c.html(
  <Layout title="Create candidate account">
    <CandidateRegisterForm siteKey={c.env.TURNSTILE_SITE_KEY} />
  </Layout>,
));
publicRoutes.get('/register/employer', (c) => c.html(
  <Layout title="Create employer account">
    <h1>Create employer account</h1>
    <EmployerRegisterForm siteKey={c.env.TURNSTILE_SITE_KEY} />
  </Layout>,
));

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
