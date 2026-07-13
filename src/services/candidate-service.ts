import { z } from 'zod';
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';
import { validateResumePdf } from '../lib/file-validation';

export const candidateCanPublish = (profile: {
  date_of_birth_confirmed: boolean;
  identity_status: string;
}) => profile.date_of_birth_confirmed && profile.identity_status === 'verified';

const checkboxBoolean = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on' || value === 'yes',
  z.boolean(),
);

export const resumeSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(1).max(100),
  stateProvince: z.string().trim().min(1).max(100),
  country: z.enum(['US', 'CA']),
  phone: z.string().trim().max(30).optional(),
  headline: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(4000),
  yearsExperience: z.coerce.number().int().min(0).max(80),
  workAuthorization: z.string().trim().min(2).max(200),
  searchable: checkboxBoolean.default(false),
});

export const saveCandidateResume = async (
  c: AppContext,
  candidateId: string,
  raw: unknown,
) => {
  const input = resumeSchema.parse(raw);
  return getServiceClient(c).from('candidate_profiles').upsert({
    user_id: candidateId,
    full_name: input.fullName,
    city: input.city,
    state_province: input.stateProvince,
    country: input.country,
    phone: input.phone || null,
    headline: input.headline,
    summary: input.summary,
    years_experience: input.yearsExperience,
    work_authorization: input.workAuthorization,
    searchable: input.searchable,
  });
};

const skillSchema = z.object({
  skillName: z.string().trim().min(1).max(100),
  yearsExperience: z.coerce.number().int().min(0).max(80),
});
const experienceSchema = z.object({
  company: z.string().trim().min(1).max(200),
  jobTitle: z.string().trim().min(1).max(200),
  startDate: z.iso.date(),
  endDate: z.preprocess((v) => (v === '' ? undefined : v), z.iso.date().optional()),
  description: z.string().trim().max(4000),
});
const educationSchema = z.object({
  school: z.string().trim().min(1).max(200),
  qualification: z.string().trim().min(1).max(200),
  field: z.string().trim().max(200),
  graduationYear: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.coerce.number().int().min(1900).max(2200).optional(),
  ),
});

export const addCandidateSkill = async (
  c: AppContext,
  candidateId: string,
  raw: unknown,
) => {
  const input = skillSchema.parse(raw);
  return getServiceClient(c).from('candidate_skills').upsert(
    {
      candidate_id: candidateId,
      skill_name: input.skillName,
      years_experience: input.yearsExperience,
    },
    { onConflict: 'candidate_id,skill_name' },
  );
};

export const addCandidateExperience = async (
  c: AppContext,
  candidateId: string,
  raw: unknown,
) => {
  const input = experienceSchema.parse(raw);
  return getServiceClient(c).from('candidate_experience').insert({
    candidate_id: candidateId,
    company: input.company,
    job_title: input.jobTitle,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    description: input.description,
  });
};

export const addCandidateEducation = async (
  c: AppContext,
  candidateId: string,
  raw: unknown,
) => {
  const input = educationSchema.parse(raw);
  return getServiceClient(c).from('candidate_education').insert({
    candidate_id: candidateId,
    school: input.school,
    qualification: input.qualification,
    field: input.field,
    graduation_year: input.graduationYear ?? null,
  });
};

export const deleteCandidateSectionRow = async (
  c: AppContext,
  candidateId: string,
  section: 'candidate_skills' | 'candidate_experience' | 'candidate_education',
  rowId: string,
) => getServiceClient(c).from(section).delete().eq('id', rowId).eq('candidate_id', candidateId);

export const validatePdf = async (file: File) => {
  try {
    return await validateResumePdf(file);
  } catch (error) {
    if (error instanceof Error && error.message === 'unsupported_file_signature') {
      throw new Error('invalid_pdf_signature');
    }
    throw error;
  }
};

export const replaceResumePdf = async (
  c: AppContext,
  candidateId: string,
  file: File,
) => {
  const bytes = await validatePdf(file);
  const service = getServiceClient(c);
  const path = `${candidateId}/resume.pdf`;
  const { error: uploadError } = await service.storage
    .from('resume-pdfs')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;
  return service.from('resume_files').upsert({
    candidate_id: candidateId,
    storage_path: path,
    original_filename: file.name,
    mime_type: 'application/pdf',
    size_bytes: file.size,
  });
};
