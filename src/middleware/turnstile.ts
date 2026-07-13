import type { AppContext } from '../lib/supabase';

export const verifyTurnstile = async (c: AppContext, token: string) => {
  if (!token) return false;
  const body = new URLSearchParams({
    secret: c.env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: c.req.header('cf-connecting-ip') ?? '',
  });
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
  );
  if (!response.ok) return false;
  const result = await response.json<{ success: boolean }>();
  return result.success;
};
