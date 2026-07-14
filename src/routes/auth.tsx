import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { getServiceClient, getUserClient } from '../lib/supabase';
import type { AppContext } from '../lib/supabase';
import { rateLimit } from '../middleware/rate-limit';
import { verifyTurnstile } from '../middleware/turnstile';
import {
  createCandidateRegistration,
  parseCandidateRegistration,
} from '../services/candidate-registration-service';
import { restoreCandidateAccount } from '../services/cleanup-service';
import type { AppRole, AppVariables } from '../types/app';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
});

const implicitSessionSchema = z.object({
  accessToken: z.string().min(20).max(8192),
  refreshToken: z.string().min(20).max(8192),
});

export type ImplicitSessionPayload = z.infer<typeof implicitSessionSchema>;

export const parseImplicitSessionPayload = (
  input: unknown,
): ImplicitSessionPayload | null => {
  const result = implicitSessionSchema.safeParse(input);
  return result.success ? result.data : null;
};

const cookieOptions = (origin: string, maxAge: number) => ({
  httpOnly: true,
  secure: new URL(origin).protocol === 'https:',
  sameSite: 'Lax' as const,
  path: '/',
  maxAge,
});

export type AuthCallbackInput =
  | { kind: 'otp'; tokenHash: string; type: 'email' }
  | { kind: 'code'; code: string };

export const parseAuthCallback = (params: URLSearchParams): AuthCallbackInput | null => {
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash && type === 'email') {
    return { kind: 'otp', tokenHash, type: 'email' };
  }

  const code = params.get('code');
  if (code) return { kind: 'code', code };

  return null;
};

export const wantsJsonResponse = (request: Request) => {
  const accept = request.headers.get('accept')?.toLowerCase() ?? '';
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  return accept
    .split(',')
    .some((value) => value.trim().startsWith('application/json'))
    || contentType.startsWith('application/json');
};

export const confirmationDestination = (
  role: AppRole | null,
  hasCandidateProfile: boolean,
) => {
  if (role === 'employer') return '/employer/onboarding';
  if (role === 'candidate' && hasCandidateProfile) return '/candidate/verification';
  if (role === 'admin') return '/admin/employers';
  return '/candidate/onboarding';
};

const CheckEmailPage = () => (
  <Layout title="Check your email">
    <section class="card auth-result" aria-live="polite">
      <p class="eyebrow">Almost finished</p>
      <h1>Check your email</h1>
      <p>We accepted your candidate account request and sent a verification email.</p>
      <p>
        Open the message to confirm your address. Check your spam or junk folder if it
        does not arrive.
      </p>
      <div class="action-row">
        <a class="button" href="/login">Sign in</a>
        <a href="/">Return home</a>
      </div>
    </section>
  </Layout>
);

type CandidateRegistrationError =
  | 'bot_check_failed'
  | 'invalid_registration'
  | 'registration_failed'
  | 'profile_bootstrap_failed';

const candidateRegistrationFailureMessage = (code: CandidateRegistrationError) => {
  if (code === 'bot_check_failed') {
    return 'We could not complete the security check. Please return to the form and try again.';
  }
  if (code === 'invalid_registration') {
    return 'Some registration details were incomplete or invalid. Please review the form and try again.';
  }
  return 'We could not create the account. Please try again later.';
};

const candidateRegistrationFailure = (
  c: AppContext,
  json: boolean,
  code: CandidateRegistrationError,
  status: 400 | 500,
) => json
  ? c.json({ error: code }, status)
  : c.html(
      <Layout title="Candidate registration problem">
        <section class="card auth-result" role="alert">
          <h1>We could not finish registration</h1>
          <p>{candidateRegistrationFailureMessage(code)}</p>
          <div class="action-row">
            <a class="button" href="/register/candidate">Return to registration</a>
            <a href="/login">Sign in</a>
          </div>
        </section>
      </Layout>,
      status,
    );

const parseRegistrationBody = async (c: AppContext): Promise<unknown> => {
  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  return contentType.startsWith('application/json')
    ? c.req.json().catch(() => null)
    : c.req.parseBody();
};

export const authRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

authRoutes.use('/login', rateLimit('login', 10, 60, 'ip'));
authRoutes.use('/register/*', rateLimit('registration', 5, 3600, 'ip'));

authRoutes.post('/register/candidate', async (c) => {
  const json = wantsJsonResponse(c.req.raw);
  const body = await parseRegistrationBody(c);
  const turnstileToken = body && typeof body === 'object'
    ? String((body as Record<string, unknown>)['cf-turnstile-response'] ?? '')
    : '';

  if (!(await verifyTurnstile(c, turnstileToken))) {
    return candidateRegistrationFailure(c, json, 'bot_check_failed', 400);
  }

  const input = parseCandidateRegistration(body);
  if (!input) {
    return candidateRegistrationFailure(c, json, 'invalid_registration', 400);
  }

  const userClient = getUserClient(c);
  const serviceClient = getServiceClient(c);
  const result = await createCandidateRegistration(
    {
      signUp: async (value) => {
        const { data, error } = await userClient.auth.signUp({
          email: value.email,
          password: value.password,
          options: {
            data: { role: 'candidate' },
            emailRedirectTo: `${c.env.APP_ORIGIN}/auth/callback`,
          },
        });
        return error || !data.user
          ? { ok: false as const }
          : {
              ok: true as const,
              userId: data.user.id,
              verificationEmailSent: !data.session,
            };
      },
      upsertUser: async (row) => {
        const { error } = await serviceClient.from('users').upsert(row);
        return error ? { ok: false as const, error } : { ok: true as const };
      },
      insertCandidateProfile: async (row) => {
        const { error } = await serviceClient.from('candidate_profiles').insert(row);
        return error ? { ok: false as const, error } : { ok: true as const };
      },
      deleteAuthUser: async (userId) => {
        const { error } = await serviceClient.auth.admin.deleteUser(userId);
        return error ? { ok: false as const, error } : { ok: true as const };
      },
      logCleanupFailure: (userId, error) => {
        console.error('candidate_registration_cleanup_failed', {
          userId,
          error: String(error),
        });
      },
    },
    input,
  );

  if (!result.ok) {
    return result.code === 'registration_failed'
      ? candidateRegistrationFailure(c, json, result.code, 400)
      : candidateRegistrationFailure(c, json, result.code, 500);
  }

  return json
    ? c.json({ ok: true, verificationEmailSent: result.verificationEmailSent }, 201)
    : c.html(<CheckEmailPage />, 201);
});

authRoutes.post('/register/employer', async (c) => {
  const body = await c.req.parseBody();
  if (!(await verifyTurnstile(c, String(body['cf-turnstile-response'] ?? '')))) {
    return c.json({ error: 'bot_check_failed' }, 400);
  }
  const inputResult = credentialsSchema.safeParse(body);
  if (!inputResult.success) {
    return c.json({ error: 'invalid_registration' }, 400);
  }

  const input = inputResult.data;
  const client = getUserClient(c);
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { role: 'employer' },
      emailRedirectTo: `${c.env.APP_ORIGIN}/auth/callback`,
    },
  });
  if (error || !data.user) return c.json({ error: 'registration_failed' }, 400);

  const service = getServiceClient(c);
  const { error: profileError } = await service.from('users').upsert({
    id: data.user.id,
    email: input.email,
    role: 'employer',
    status: 'active',
  });
  if (profileError) return c.json({ error: 'profile_bootstrap_failed' }, 500);

  return c.json({ ok: true, verificationEmailSent: !data.session }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.parseBody();
  if (!(await verifyTurnstile(c, String(body['cf-turnstile-response'] ?? '')))) {
    return c.json({ error: 'bot_check_failed' }, 400);
  }
  const inputResult = credentialsSchema.safeParse(body);
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

const onboardingPathForUser = async (c: AppContext, userId: string) => {
  const service = getServiceClient(c);
  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role !== 'candidate') {
    return confirmationDestination(profile?.role ?? null, false);
  }

  const { data: candidateProfile } = await service
    .from('candidate_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  return confirmationDestination(profile.role, Boolean(candidateProfile));
};

const setSessionCookies = (
  c: AppContext,
  session: { access_token: string; refresh_token: string },
) => {
  setCookie(
    c,
    'sb-access-token',
    session.access_token,
    cookieOptions(c.env.APP_ORIGIN, 3600),
  );
  setCookie(
    c,
    'sb-refresh-token',
    session.refresh_token,
    cookieOptions(c.env.APP_ORIGIN, 2_592_000),
  );
};

authRoutes.get('/callback', async (c) => {
  const callback = parseAuthCallback(new URL(c.req.url).searchParams);
  if (!callback) {
    return c.html(
      <Layout title="Confirming your email">
        <section class="card" aria-live="polite">
          <h1>Confirming your email</h1>
          <p id="auth-callback-status">Please wait while we finish signing you in.</p>
          <noscript>JavaScript is required to finish email confirmation.</noscript>
          <script src="/auth-callback.js" defer></script>
        </section>
      </Layout>,
    );
  }

  const client = getUserClient(c);
  const { data, error } = callback.kind === 'otp'
    ? await client.auth.verifyOtp({
        token_hash: callback.tokenHash,
        type: callback.type,
      })
    : await client.auth.exchangeCodeForSession(callback.code);
  if (error || !data.session || !data.user) {
    return c.json({ error: 'email_verification_failed' }, 400);
  }

  setSessionCookies(c, data.session);
  return c.redirect(await onboardingPathForUser(c, data.user.id));
});

authRoutes.post('/callback/session', async (c) => {
  const payload = parseImplicitSessionPayload(await c.req.json().catch(() => null));
  if (!payload) return c.json({ error: 'invalid_session_tokens' }, 400);

  const client = getUserClient(c);
  const { data, error } = await client.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  if (error || !data.session || !data.user) {
    return c.json({ error: 'email_verification_failed' }, 400);
  }

  setSessionCookies(c, data.session);
  return c.json({
    ok: true,
    next: await onboardingPathForUser(c, data.user.id),
  });
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
