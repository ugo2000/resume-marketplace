import { createClient } from '@supabase/supabase-js';
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import type { AppVariables, SessionUser } from '../types/app';

const ACCESS_COOKIE = 'sb-access-token';
const REFRESH_COOKIE = 'sb-refresh-token';

const cookieOptions = (origin: string, maxAge: number) => ({
  httpOnly: true,
  secure: new URL(origin).protocol === 'https:',
  sameSite: 'Lax' as const,
  path: '/',
  maxAge,
});

export const authMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: AppVariables;
}> = async (c, next) => {
  let accessToken = getCookie(c, ACCESS_COOKIE) ?? null;
  const refreshToken = getCookie(c, REFRESH_COOKIE) ?? null;
  c.set('sessionUser', null);
  c.set('accessToken', accessToken);

  const service = getServiceClient(c);
  let authUser = accessToken
    ? (await service.auth.getUser(accessToken)).data.user
    : null;

  if (!authUser && refreshToken) {
    const anon = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session && data.user) {
      accessToken = data.session.access_token;
      authUser = data.user;
      c.set('accessToken', accessToken);
      setCookie(c, ACCESS_COOKIE, accessToken, cookieOptions(c.env.APP_ORIGIN, 3600));
      setCookie(
        c,
        REFRESH_COOKIE,
        data.session.refresh_token,
        cookieOptions(c.env.APP_ORIGIN, 2_592_000),
      );
    }
  }

  if (authUser) {
    const { data: profile } = await service
      .from('users')
      .select('id,email,role,status')
      .eq('id', authUser.id)
      .maybeSingle();
    if (profile) c.set('sessionUser', profile as SessionUser);
  }

  await next();
};
