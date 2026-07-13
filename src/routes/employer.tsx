import { Hono } from 'hono';
import { Field } from '../components/forms';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import { requireRole } from '../middleware/role';
import { submitEmployerReview } from '../services/employer-service';
import type { AppVariables } from '../types/app';

export const employerRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables;
}>();

employerRoutes.use('*', requireRole(['employer']));

employerRoutes.get('/onboarding', (c) =>
  c.html(
    <Layout title="Employer verification">
      <h1>Verify your business</h1>
      <p>Employer accounts are reviewed manually before jobs or candidate search become available.</p>
      <form method="post" action="/employer/onboarding" enctype="multipart/form-data" class="card form-stack">
        <Field label="Company name" name="companyName"><input id="companyName" name="companyName" required /></Field>
        <Field label="Website" name="website"><input id="website" name="website" type="url" required /></Field>
        <Field label="Company email" name="companyEmail"><input id="companyEmail" name="companyEmail" type="email" required /></Field>
        <Field label="Registration number" name="registrationNumber"><input id="registrationNumber" name="registrationNumber" required /></Field>
        <Field label="Country" name="country"><select id="country" name="country"><option value="US">United States</option><option value="CA">Canada</option></select></Field>
        <Field label="Registration proof" name="document"><input id="document" name="document" type="file" accept="application/pdf,image/png,image/jpeg" required /></Field>
        <button>Submit for review</button>
      </form>
    </Layout>,
  ),
);

employerRoutes.post('/onboarding', async (c) => {
  const body = await c.req.parseBody();
  if (!(body.document instanceof File)) {
    return c.json({ error: 'registration_document_required' }, 400);
  }
  try {
    await submitEmployerReview(c, c.get('sessionUser')!.id, body, body.document);
    return c.redirect('/employer/review-status', 303);
  } catch {
    return c.json({ error: 'employer_review_submission_failed' }, 400);
  }
});

employerRoutes.get('/review-status', async (c) => {
  const { data } = await getServiceClient(c)
    .from('employer_profiles')
    .select('company_name,review_status,rejection_reason,reviewed_at')
    .eq('user_id', c.get('sessionUser')!.id)
    .maybeSingle();
  return c.html(
    <Layout title="Employer review status">
      <h1>Employer review</h1>
      <div class="card">
        <p>Company: {data?.company_name ?? 'Not submitted'}</p>
        <p>Status: {data?.review_status ?? 'draft'}</p>
        {data?.rejection_reason ? <p>Reason: {data.rejection_reason}</p> : null}
      </div>
    </Layout>,
  );
});
