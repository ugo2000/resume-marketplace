import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import type { AppVariables } from '../types/app';
import type { Database } from '../types/database';

export const testSupportRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

type Fixture = 'verified-candidate' | 'approved-employer-with-10-credits';

const isFixture = (value: unknown): value is Fixture =>
  value === 'verified-candidate' || value === 'approved-employer-with-10-credits';

testSupportRoutes.post('/session', async (c) => {
  if (
    !c.env.E2E_TEST_TOKEN ||
    c.req.header('x-e2e-test-token') !== c.env.E2E_TEST_TOKEN
  ) {
    return c.notFound();
  }

  const body = await c.req.json<{ fixture?: unknown }>();
  if (!isFixture(body.fixture)) return c.json({ error: 'invalid_fixture' }, 400);

  const service = getServiceClient(c);
  const password = 'Long-test-password-123!';
  const email = `${body.fixture}-${crypto.randomUUID()}@example.test`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return c.json({ error: 'fixture_user_failed' }, 500);
  }

  const userId = created.user.id;
  const role = body.fixture === 'verified-candidate' ? 'candidate' : 'employer';
  const { error: profileError } = await service.from('users').insert({
    id: userId,
    email,
    role,
    status: 'active',
    country: 'US',
  });
  if (profileError) return c.json({ error: 'fixture_profile_failed' }, 500);

  if (role === 'candidate') {
    const { error: candidateError } = await service.from('candidate_profiles').insert({
      user_id: userId,
      full_name: 'Emma Carter',
      city: 'Seattle',
      state_province: 'WA',
      country: 'US',
      headline: 'Operations Coordinator',
      summary: 'Experienced operations professional.',
      years_experience: 5,
      work_authorization: 'Authorized to work in the United States',
      searchable: true,
      identity_status: 'verified',
      identity_verified_at: new Date().toISOString(),
      date_of_birth_confirmed: true,
    });
    if (candidateError) return c.json({ error: 'fixture_candidate_failed' }, 500);

    const ownerEmail = `job-owner-${crypto.randomUUID()}@example.test`;
    const { data: owner, error: ownerError } = await service.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    if (ownerError || !owner.user) {
      return c.json({ error: 'fixture_job_owner_failed' }, 500);
    }
    await service.from('users').insert({
      id: owner.user.id,
      email: ownerEmail,
      role: 'employer',
      status: 'active',
      country: 'US',
    });
    await service.from('employer_profiles').insert({
      user_id: owner.user.id,
      company_name: 'Job Fixture Company',
      website: 'https://example.test',
      company_email: ownerEmail,
      registration_number: 'TEST-JOB',
      country: 'US',
      review_status: 'approved',
      reviewed_at: new Date().toISOString(),
    });
    await service.from('credit_wallets').insert({ employer_id: owner.user.id });
    await service.from('jobs').insert({
      employer_id: owner.user.id,
      slug: `operations-assistant-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Operations Assistant',
      description: 'Coordinate daily operations.',
      city: 'Seattle',
      state_province: 'WA',
      country: 'US',
      employment_type: 'Full time',
      workplace_type: 'On site',
      status: 'published',
      published_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
  } else {
    await service.from('employer_profiles').insert({
      user_id: userId,
      company_name: 'Fixture Company',
      website: 'https://example.test',
      company_email: email,
      registration_number: 'TEST-1',
      country: 'US',
      review_status: 'approved',
      reviewed_at: new Date().toISOString(),
    });
    await service.from('credit_wallets').insert({
      employer_id: userId,
      available_credits: 10,
      purchased_credits: 10,
      used_credits: 0,
    });

    const candidateEmail = `searchable-candidate-${crypto.randomUUID()}@example.test`;
    const { data: candidate, error: candidateError } = await service.auth.admin.createUser({
      email: candidateEmail,
      password,
      email_confirm: true,
    });
    if (candidateError || !candidate.user) {
      return c.json({ error: 'fixture_candidate_failed' }, 500);
    }
    await service.from('users').insert({
      id: candidate.user.id,
      email: candidateEmail,
      role: 'candidate',
      status: 'active',
      country: 'US',
    });
    await service.from('candidate_profiles').insert({
      user_id: candidate.user.id,
      full_name: 'Emma Carter',
      city: 'Seattle',
      state_province: 'WA',
      country: 'US',
      headline: 'Operations Coordinator',
      summary: 'Experienced operations professional.',
      years_experience: 5,
      work_authorization: 'Authorized to work in the United States',
      searchable: true,
      identity_status: 'verified',
      identity_verified_at: new Date().toISOString(),
      date_of_birth_confirmed: true,
    });
    await service.from('candidate_skills').insert({
      candidate_id: candidate.user.id,
      skill_name: 'Operations',
      years_experience: 5,
    });
  }

  const anon = createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !sessionData.session) {
    return c.json({ error: 'fixture_sign_in_failed' }, 500);
  }

  const secure = new URL(c.env.APP_ORIGIN).protocol === 'https:';
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: 3600,
  };
  setCookie(c, 'sb-access-token', sessionData.session.access_token, cookieOptions);
  setCookie(c, 'sb-refresh-token', sessionData.session.refresh_token, cookieOptions);
  return c.json({ ok: true, userId, email });
});
