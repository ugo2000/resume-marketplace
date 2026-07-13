import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../env';
import type { AppRole, AppStatus, AppVariables } from '../types/app';

export type AuthorizationDecision =
  | { allowed: true; status: 200 }
  | { allowed: false; status: 401 | 403 };

export const authorizeRole = (
  user: { role: AppRole; status: AppStatus } | null,
  allowedRoles: readonly AppRole[],
): AuthorizationDecision => {
  if (!user) return { allowed: false, status: 401 };
  if (user.status !== 'active') return { allowed: false, status: 403 };
  return allowedRoles.includes(user.role)
    ? { allowed: true, status: 200 }
    : { allowed: false, status: 403 };
};

export const requireRole = (
  allowedRoles: readonly AppRole[],
): MiddlewareHandler<{ Bindings: Bindings; Variables: AppVariables }> =>
  async (c, next) => {
    const decision = authorizeRole(c.get('sessionUser'), allowedRoles);
    if (!decision.allowed) {
      return c.json(
        { error: decision.status === 401 ? 'authentication_required' : 'forbidden' },
        decision.status,
      );
    }
    await next();
  };
