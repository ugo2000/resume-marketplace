import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../env';
import type { AppVariables } from '../types/app';

export const originAllowed = (origin: string | undefined, appOrigin: string) => {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
};

export const csrfMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: AppVariables;
}> = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  if (c.req.path.startsWith('/webhooks/')) return next();
  if (!originAllowed(c.req.header('origin'), c.env.APP_ORIGIN)) {
    return c.json({ error: 'invalid_origin' }, 403);
  }
  await next();
};
