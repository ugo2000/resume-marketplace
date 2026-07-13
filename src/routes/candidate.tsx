import { Hono } from 'hono';
import { Field } from '../components/forms';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import { requireRole } from '../middleware/role';
import {
  addCandidateEducation,
  addCandidateExperience,
  addCandidateSkill,
  candidateCanPublish,
  deleteCandidateSectionRow,
  replaceResumePdf,
  saveCandidateResume,
} from '../services/candidate-service';
import type { AppVariables } from '../types/app';

export const candidateRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

candidateRoutes.use('*', requireRole(['candidate']));

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

candidateRoutes.get('/settings', (c) => c.html(<Layout title="Candidate settings"><h1>Candidate settings</h1><a href="/candidate/delete-account">Delete account</a></Layout>));
