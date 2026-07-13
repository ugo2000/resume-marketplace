import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import type { AppVariables } from '../types/app';

export const fixedWindowStart = (now: Date, seconds: number) =>
  new Date(Math.floor(now.getTime() / 1000 / seconds) * seconds * 1000);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const rateLimit = (
  scope: string,
  maxRequests: number,
  windowSeconds: number,
  subject: 'ip' | 'user',
): MiddlewareHandler<{ Bindings: Bindings; Variables: AppVariables }> =>
  async (c, next) => {
    const rawSubject = subject === 'user'
      ? c.get('sessionUser')?.id ?? 'anonymous'
      : c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const { data, error } = await getServiceClient(c).rpc('consume_rate_limit', {
      p_scope: scope,
      p_subject_hash: await sha256(rawSubject),
      p_window_start: fixedWindowStart(new Date(), windowSeconds).toISOString(),
      p_window_seconds: windowSeconds,
      p_max_requests: maxRequests,
    });
    if (error) return c.json({ error: 'rate_limit_unavailable' }, 503);
    if (!data) return c.json({ error: 'rate_limit_exceeded' }, 429);
    await next();
  };
