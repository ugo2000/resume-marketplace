import type { AppContext } from '../lib/supabase';
import { createResumeSignedUrl } from '../lib/signed-files';
import { getServiceClient, getUserClient } from '../lib/supabase';

export const anonymizedName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'C.';
  const first = parts[0]![0]!.toUpperCase();
  if (parts.length === 1) return `${first}.`;
  const last = parts.at(-1)![0]!.toUpperCase();
  return `${first}. ${last}.`;
};

export const unlockCandidate = async (c: AppContext, candidateId: string) => {
  const { data, error } = await getUserClient(c).rpc('unlock_candidate', {
    p_candidate_id: candidateId,
  });
  if (error) throw error;
  const result = data[0];
  if (!result) throw new Error('unlock_result_missing');
  return result;
};

export const getAuthorizedCandidate = async (
  c: AppContext,
  employerId: string,
  candidateId: string,
) => {
  const service = getServiceClient(c);
  const { data: unlock, error: unlockError } = await service
    .from('contact_unlocks')
    .select('source')
    .eq('employer_id', employerId)
    .eq('candidate_id', candidateId)
    .maybeSingle();
  if (unlockError) throw unlockError;
  if (!unlock) return null;

  const [profileResult, userResult, skillsResult, experienceResult, educationResult, fileResult] =
    await Promise.all([
      service
        .from('candidate_profiles')
        .select('user_id,full_name,phone,headline,summary,city,state_province,country,years_experience,work_authorization')
        .eq('user_id', candidateId)
        .maybeSingle(),
      service.from('users').select('email,status').eq('id', candidateId).maybeSingle(),
      service
        .from('candidate_skills')
        .select('skill_name,years_experience')
        .eq('candidate_id', candidateId)
        .order('skill_name'),
      service
        .from('candidate_experience')
        .select('company,job_title,start_date,end_date,description')
        .eq('candidate_id', candidateId)
        .order('start_date', { ascending: false }),
      service
        .from('candidate_education')
        .select('school,qualification,field,graduation_year')
        .eq('candidate_id', candidateId)
        .order('graduation_year', { ascending: false }),
      service
        .from('resume_files')
        .select('storage_path,original_filename')
        .eq('candidate_id', candidateId)
        .maybeSingle(),
    ]);

  if (profileResult.error) throw profileResult.error;
  if (userResult.error) throw userResult.error;
  if (!profileResult.data || !userResult.data || userResult.data.status !== 'active') return null;

  return {
    ...profileResult.data,
    email: userResult.data.email,
    unlockSource: unlock.source,
    skills: skillsResult.data ?? [],
    experience: experienceResult.data ?? [],
    education: educationResult.data ?? [],
    resumeFilename: fileResult.data?.original_filename ?? null,
    pdfUrl: fileResult.data
      ? await createResumeSignedUrl(c, fileResult.data.storage_path)
      : null,
  };
};
