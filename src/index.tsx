import { Hono } from 'hono';
import type { Bindings } from './env';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) =>
  c.json({ ok: true, service: 'resume-marketplace' as const }),
);

export default app;
