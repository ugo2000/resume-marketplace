import { Hono } from 'hono';
import type { Bindings } from './env';
import { authMiddleware } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { candidateRoutes } from './routes/candidate';
import { publicRoutes } from './routes/public';
import { webhookRoutes } from './routes/webhooks';
import type { AppVariables } from './types/app';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

app.get('/health', (c) =>
  c.json({ ok: true, service: 'resume-marketplace' as const }),
);
app.route('/webhooks', webhookRoutes);
app.use('*', authMiddleware);
app.route('/auth', authRoutes);
app.route('/candidate', candidateRoutes);
app.route('/', publicRoutes);

export default app;
