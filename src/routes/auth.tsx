import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Bindings } from '../env';
import { getServiceClient, getUserClient } from '../lib/supabase';
import { restoreCandidateAccount } from '../services/cleanup-service';
import type { AppVariables } from '../types/app';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
});
const roleSchema = z.enum(['candidate', 'employer']);

const cookieOptions = (origin: string, maxAge: number) => ({
  httpOnly: true,
  secure: new URL(origin).protocol === 'https:',
  sameSite: 'Lax' as const,
  path: '/',
  maxAge,
});

export const authRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

authRoutes.post('/register/:role', async (c) => {
  const roleResult = roleSchema.safeParse(c.req.param('role'));
  const inputResult = credentialsSchema.safeParse(await c.req.parseBody());
  if (!roleResult.success || !inputResult.success) {
    return c.json({ error: 'invalid_registration' }, 400);
  }

  const role = roleResult.data;
  const input = inputResult.data;
  const client = getUserClient(c);
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { role },
      emailRedirectTo: `${c.env.APP_ORIGIN}/auth/callback`,
    },
  });
  if (error || !data.user) return c.json({ error: 'registration_failed' }, 400);

  const service = getServiceClient(c);
  const { error: profileError } = await service.from('users').upsert({
    id: data.user.id,
    email: input.email,
    role,
    status: 'active',
  });
  if (profileError) return c.json({ error: 'profile_bootstrap_failed' }, 500);

  return c.json({ ok: true, verificationEmailSent: !data.session }, 201);
});

authRoutes.post('/login', async (c) => {
  const inputResult = credentialsSchema.safeParse(await c.req.parseBody());
  if (!inputResult.success) return c.json({ error: 'invalid_credentials' }, 401);

  const client = getUserClient(c);
  const { data, error } = await client.auth.signInWithPassword(inputResult.data);
  if (error || !data.session) return c.json({ error: 'invalid_credentials' }, 401);

  setCookie(
    c,
    'sb-access-token',
    data.session.access_token,
    cookieOptions(c.env.APP_ORIGIN, 3600),
  );
  setCookie(
    c,
    'sb-refresh-token',
    data.session.refresh_token,
    cookieOptions(c.env.APP_ORIGIN, 2_592_000),
  );
  return c.json({ ok: true });
});

authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'verification_code_missing' }, 400);

  const client = getUserClient(c);
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session) return c.json({ error: 'email_verification_failed' }, 400);

  setCookie(
    c,
    'sb-access-token',
    data.session.access_token,
    cookieOptions(c.env.APP_ORIGIN, 3600),
  );
  setCookie(
    c,
    'sb-refresh-token',
    data.session.refresh_token,
    cookieOptions(c.env.APP_ORIGIN, 2_592_000),
  );

  const service = getServiceClient(c);
  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
  return c.redirect(
    profile?.role === 'employer' ? '/employer/onboarding' : '/candidate/onboarding',
  );
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'sb-access-token', { path: '/' });
  deleteCookie(c, 'sb-refresh-token', { path: '/' });
  return c.json({ ok: true });
});


authRoutes.post('/restore-account', async (c) => {
  const user = c.get('sessionUser');
  if (!user || user.role !== 'candidate' || user.status !== 'disabled') {
    return c.json({ error: 'disabled_candidate_required' }, 403);
  }
  try {
    await restoreCandidateAccount(c, user.id);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'restoration_window_closed' }, 400);
  }
});
