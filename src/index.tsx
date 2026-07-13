import { Hono } from 'hono';
import type { Bindings } from './env';
import { authMiddleware } from './middleware/auth';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { candidateRoutes } from './routes/candidate';
import { employerRoutes } from './routes/employer';
import { publicRoutes } from './routes/public';
import { webhookRoutes } from './routes/webhooks';
import { runDailyCleanup } from './services/cleanup-service';
import type { AppVariables } from './types/app';

export const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

app.get('/health', (c) =>
  c.json({ ok: true, service: 'resume-marketplace' as const }),
);
app.route('/webhooks', webhookRoutes);
app.use('*', authMiddleware);
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
