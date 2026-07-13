import type { Bindings } from '../env';
import type { AppContext } from '../lib/supabase';
import { getServiceClient, getServiceClientFromEnv } from '../lib/supabase';

const DAY_MS = 86_400_000;

export const restoreDeadline = (requestedAt: Date) =>
  new Date(requestedAt.getTime() + 30 * DAY_MS);

export const requestCandidateDeletion = async (c: AppContext, userId: string) => {
  const service = getServiceClient(c);
  const now = new Date();
  const deadline = restoreDeadline(now);

  const { error: userError } = await service
    .from('users')
    .update({ status: 'disabled', updated_at: now.toISOString() })
    .eq('id', userId)
    .eq('role', 'candidate');
  if (userError) throw userError;

  const { error: profileError } = await service
    .from('candidate_profiles')
    .update({ searchable: false, updated_at: now.toISOString() })
    .eq('user_id', userId);
  if (profileError) throw profileError;

  const { error: requestError } = await service
    .from('account_deletion_requests')
    .upsert({
      user_id: userId,
      requested_at: now.toISOString(),
      restore_until: deadline.toISOString(),
      completed_at: null,
    });
  if (requestError) throw requestError;
  return deadline;
};

export const restoreCandidateAccount = async (c: AppContext, userId: string) => {
  const service = getServiceClient(c);
  const { data, error } = await service
    .from('account_deletion_requests')
    .select('restore_until,completed_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.completed_at || new Date(data.restore_until) <= new Date()) {
    throw new Error('restoration_window_closed');
  }

  const { error: userError } = await service
    .from('users')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('role', 'candidate');
  if (userError) throw userError;

  const { error: requestError } = await service
    .from('account_deletion_requests')
    .delete()
    .eq('user_id', userId);
  if (requestError) throw requestError;
};

export const runDailyCleanup = async (env: Bindings) => {
  const service = getServiceClientFromEnv(env);

  const { data: documents, error: documentError } = await service.rpc(
    'documents_due_for_deletion',
  );
  if (documentError) throw documentError;
  for (const document of documents ?? []) {
    const { error: storageError } = await service.storage
      .from('employer-documents')
      .remove([document.storage_path]);
    if (storageError) throw storageError;
    const { error: rowError } = await service
      .from('employer_documents')
      .delete()
      .eq('id', document.document_id)
      .eq('legal_hold', false);
    if (rowError) throw rowError;
  }

  const { data: candidates, error: candidateError } = await service.rpc(
    'complete_candidate_deletions',
  );
  if (candidateError) throw candidateError;
  for (const candidate of candidates ?? []) {
    if (candidate.resume_path) {
      const { error } = await service.storage
        .from('resume-pdfs')
        .remove([candidate.resume_path]);
      if (error) throw error;
    }

    const anonymizedEmail = `deleted+${candidate.user_id}@invalid.example`;
    const { error: userError } = await service
      .from('users')
      .update({
        email: anonymizedEmail,
        status: 'disabled',
        country: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.user_id);
    if (userError) throw userError;

    const { error: authError } = await service.auth.admin.updateUserById(
      candidate.user_id,
      {
        email: anonymizedEmail,
        user_metadata: {},
        ban_duration: '876000h',
      },
    );
    if (authError) throw authError;
  }

  const { data: expiredCount, error: expiryError } = await service.rpc('expire_jobs');
  if (expiryError) throw expiryError;

  return {
    deletedEmployerDocuments: documents?.length ?? 0,
    completedCandidateDeletions: candidates?.length ?? 0,
    expiredJobs: expiredCount ?? 0,
  };
};
