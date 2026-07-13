import { Hono } from 'hono';
import type { Bindings } from './env';
import { authMiddleware } from './middleware/auth';
import { authRoutes } from './routes/auth';
import type { AppVariables } from './types/app';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

app.get('/health', (c) =>
  c.json({ ok: true, service: 'resume-marketplace' as const }),
);
app.use('*', authMiddleware);
app.route('/auth', authRoutes);

export default app;
