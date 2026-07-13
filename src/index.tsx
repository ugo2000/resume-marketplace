import { Hono } from 'hono';
import type { Bindings } from './env';
import { authMiddleware } from './middleware/auth';
import { csrfMiddleware } from './middleware/csrf';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { candidateRoutes } from './routes/candidate';
import { employerRoutes } from './routes/employer';
import { publicRoutes } from './routes/public';
import { testSupportRoutes } from './routes/test-support';
import { webhookRoutes } from './routes/webhooks';
import { runDailyCleanup } from './services/cleanup-service';
import type { AppVariables } from './types/app';

export const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com; form-action 'self' https://checkout.stripe.com; base-uri 'self'; frame-ancestors 'none'",
  );
});

app.get('/health', (c) =>
  c.json({ ok: true, service: 'resume-marketplace' as const }),
);
app.route('/webhooks', webhookRoutes);
app.route('/test-support', testSupportRoutes);
app.use('*', authMiddleware);
app.use('*', csrfMiddleware);
app.route('/auth', authRoutes);
app.route('/candidate', candidateRoutes);
app.route('/employer', employerRoutes);
app.route('/admin', adminRoutes);
app.route('/', publicRoutes);

const worker: ExportedHandler<Bindings> = {
  fetch: app.fetch,
  scheduled: async (_controller, env, ctx) => {
    ctx.waitUntil(runDailyCleanup(env));
  },
};

export default worker;
