import type { AppContext } from '../lib/supabase';
import { getUserClient } from '../lib/supabase';

export const canApply = (
  identityStatus: string,
  jobStatus: string,
  expiresAt: Date,
  now: Date,
) => identityStatus === 'verified' && jobStatus === 'published' && expiresAt > now;

export const applyToJob = async (
  c: AppContext,
  jobId: string,
  coverNote?: string,
) => {
  const note = coverNote?.trim() || null;
  if (note && note.length > 4000) throw new Error('cover_note_too_long');
  const { data, error } = await getUserClient(c).rpc('apply_to_job', {
    p_job_id: jobId,
    p_cover_note: note,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('application_not_created');
  return result;
};
