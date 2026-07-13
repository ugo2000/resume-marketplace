import { z } from 'zod';
import { employerSubmissionEmail, queueEmail, reviewEmail } from '../lib/email';
import { validateEmployerDocument } from '../lib/file-validation';
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';
import type { Database } from '../types/database';

type ReviewStatus = Database['public']['Enums']['employer_review_status'];

export const canTransitionReview = (from: ReviewStatus, to: ReviewStatus) =>
  (from === 'pending' && (to === 'approved' || to === 'rejected')) ||
  (from === 'approved' && to === 'suspended') ||
  (from === 'suspended' && to === 'approved') ||
  (from === 'rejected' && to === 'pending');

export const documentDeleteAfter = (reviewedAt: Date) =>
  new Date(reviewedAt.getTime() + 30 * 86_400_000);

const employerSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  website: z.url().refine((value) => value.startsWith('https://') || value.startsWith('http://')),
  companyEmail: z.email(),
  registrationNumber: z.string().trim().min(2).max(100),
  country: z.enum(['US', 'CA']),
});

export const submitEmployerReview = async (
  c: AppContext,
  employerId: string,
  raw: unknown,
  file: File,
) => {
  const input = employerSchema.parse(raw);
  const { bytes, detectedType } = await validateEmployerDocument(file);

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const service = getServiceClient(c);
  const path = `${employerId}/${crypto.randomUUID()}`;
  const { error: uploadError } = await service.storage
    .from('employer-documents')
    .upload(path, bytes, { contentType: detectedType });
  if (uploadError) throw uploadError;

  const { error: profileError } = await service.from('employer_profiles').upsert({
    user_id: employerId,
    company_name: input.companyName,
    website: input.website,
    company_email: input.companyEmail,
    registration_number: input.registrationNumber,
    country: input.country,
    review_status: 'pending',
    rejection_reason: null,
  });
  if (profileError) {
    await service.storage.from('employer-documents').remove([path]);
    throw profileError;
  }

  const { error: documentError } = await service.from('employer_documents').insert({
    employer_id: employerId,
    storage_path: path,
    original_filename: file.name,
    mime_type: detectedType,
    size_bytes: file.size,
    document_type: 'registration_proof',
    file_sha256: sha256,
  });
  if (documentError) {
    await service.storage.from('employer-documents').remove([path]);
    throw documentError;
  }
  queueEmail(c, employerSubmissionEmail(input.companyEmail));
};

export const decideEmployerReview = async (
  c: AppContext,
  adminId: string,
  employerId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
) => {
  const service = getServiceClient(c);
  const { data: current } = await service
    .from('employer_profiles')
    .select('review_status')
    .eq('user_id', employerId)
    .maybeSingle();
  if (!current || !canTransitionReview(current.review_status, decision)) {
    throw new Error('invalid_review_transition');
  }

  const reviewedAt = new Date();
  const rejectionReason = decision === 'rejected'
    ? (reason?.trim() || 'Registration could not be verified.')
    : null;
  const { error: updateError } = await service
    .from('employer_profiles')
    .update({
      review_status: decision,
      reviewed_by: adminId,
      reviewed_at: reviewedAt.toISOString(),
      rejection_reason: rejectionReason,
    })
    .eq('user_id', employerId)
    .eq('review_status', current.review_status);
  if (updateError) throw updateError;

  await service
    .from('employer_documents')
    .update({ delete_after: documentDeleteAfter(reviewedAt).toISOString() })
    .eq('employer_id', employerId)
    .eq('legal_hold', false);

  if (decision === 'approved') {
    const { error: walletError } = await service.from('credit_wallets').insert({
      employer_id: employerId,
      available_credits: 0,
      purchased_credits: 0,
      used_credits: 0,
    });
    if (walletError && walletError.code !== '23505') throw walletError;
  }

  const { data: employer } = await service
    .from('employer_profiles')
    .select('company_email')
    .eq('user_id', employerId)
    .maybeSingle();
  if (employer) {
    queueEmail(c, reviewEmail(employer.company_email, decision, rejectionReason ?? undefined));
  }
};
