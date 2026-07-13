import { Hono } from 'hono';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import { requireRole } from '../middleware/role';
import { decideEmployerReview } from '../services/employer-service';
import type { AppVariables } from '../types/app';

export const adminRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

adminRoutes.use('*', requireRole(['admin']));

adminRoutes.get('/', (c) => c.html(<Layout title="Administration"><h1>Administration</h1><a href="/admin/employers">Employer reviews</a></Layout>));

adminRoutes.get('/employers', async (c) => {
  const { data } = await getServiceClient(c)
    .from('employer_profiles')
    .select('user_id,company_name,country,review_status,created_at')
    .order('created_at', { ascending: false });
  return c.html(
    <Layout title="Employer reviews">
      <h1>Employer reviews</h1>
      <ul class="job-list">{(data ?? []).map((employer) => <li class="card"><a href={`/admin/employers/${employer.user_id}`}>{employer.company_name}</a><span>{employer.country} · {employer.review_status}</span></li>)}</ul>
    </Layout>,
  );
});

adminRoutes.get('/employers/:id', async (c) => {
  const service = getServiceClient(c);
  const employerId = c.req.param('id');
  const [{ data: employer }, { data: documents }] = await Promise.all([
    service.from('employer_profiles').select('*').eq('user_id', employerId).maybeSingle(),
    service.from('employer_documents').select('id,storage_path,original_filename,mime_type,file_sha256,uploaded_at').eq('employer_id', employerId),
  ]);
  if (!employer) return c.notFound();
  const signedDocuments = await Promise.all(
    (documents ?? []).map(async (document) => {
      const { data, error } = await service.storage
        .from('employer-documents')
        .createSignedUrl(document.storage_path, 300);
      if (error) throw error;
      return { ...document, signedUrl: data.signedUrl };
    }),
  );
  return c.json({ employer, documents: signedDocuments });
});

adminRoutes.post('/employers/:id/decision', async (c) => {
  const body = await c.req.parseBody();
  const decision = body.decision === 'approved'
    ? 'approved'
    : body.decision === 'rejected'
      ? 'rejected'
      : null;
  if (!decision) return c.json({ error: 'invalid_decision' }, 400);
  try {
    await decideEmployerReview(
      c,
      c.get('sessionUser')!.id,
      c.req.param('id'),
      decision,
      String(body.reason ?? ''),
    );
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'review_decision_failed' }, 409);
  }
});
