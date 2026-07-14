import { z } from 'zod';
import type { Database } from '../types/database';

const acceptedConfirmation = z.literal('on');

export const workAuthorizationSchema = z.enum([
  'authorized_without_sponsorship',
  'future_sponsorship_may_be_required',
  'sponsorship_required',
]);

export type CandidateWorkAuthorization = z.infer<typeof workAuthorizationSchema>;

export const candidateRegistrationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(12).max(128),
    confirmPassword: z.string().min(12).max(128),
    fullName: z.string().trim().min(2).max(160),
    country: z.enum(['US', 'CA']),
    stateProvince: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    headline: z.string().trim().min(2).max(160),
    yearsExperience: z.coerce.number().int().min(0).max(80),
    workAuthorization: workAuthorizationSchema,
    age18: acceptedConfirmation,
    termsAccepted: acceptedConfirmation,
    privacyAccepted: acceptedConfirmation,
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords must match',
      });
    }
  })
  .transform((value) => ({
    email: value.email,
    password: value.password,
    fullName: value.fullName,
    country: value.country,
    stateProvince: value.stateProvince,
    city: value.city,
    headline: value.headline,
    yearsExperience: value.yearsExperience,
    workAuthorization: value.workAuthorization,
  }));

export type CandidateRegistrationInput = z.output<typeof candidateRegistrationSchema>;

type PublicUserInsert = Database['public']['Tables']['users']['Insert'];
type CandidateProfileInsert = Database['public']['Tables']['candidate_profiles']['Insert'];

type MutationResult =
  | { ok: true }
  | { ok: false; error?: unknown };

type SignUpResult =
  | { ok: true; userId: string; verificationEmailSent: boolean }
  | { ok: false };

export type CandidateRegistrationDependencies = {
  signUp(input: CandidateRegistrationInput): Promise<SignUpResult>;
  upsertUser(row: PublicUserInsert): Promise<MutationResult>;
  insertCandidateProfile(row: CandidateProfileInsert): Promise<MutationResult>;
  deleteAuthUser(userId: string): Promise<MutationResult>;
  logCleanupFailure(userId: string, error: unknown): void;
};

export type CandidateRegistrationResult =
  | { ok: true; verificationEmailSent: boolean; userId: string }
  | { ok: false; code: 'registration_failed' | 'profile_bootstrap_failed' };

export const parseCandidateRegistration = (
  input: unknown,
): CandidateRegistrationInput | null => {
  const result = candidateRegistrationSchema.safeParse(input);
  return result.success ? result.data : null;
};

const cleanupAndFail = async (
  dependencies: CandidateRegistrationDependencies,
  userId: string,
): Promise<CandidateRegistrationResult> => {
  try {
    const cleanup = await dependencies.deleteAuthUser(userId);
    if (!cleanup.ok) {
      dependencies.logCleanupFailure(userId, cleanup.error ?? 'auth_user_cleanup_failed');
    }
  } catch (error) {
    dependencies.logCleanupFailure(userId, error);
  }

  return { ok: false, code: 'profile_bootstrap_failed' };
};

export const createCandidateRegistration = async (
  dependencies: CandidateRegistrationDependencies,
  input: CandidateRegistrationInput,
): Promise<CandidateRegistrationResult> => {
  const signup = await dependencies.signUp(input);
  if (!signup.ok) return { ok: false, code: 'registration_failed' };

  const userResult = await dependencies.upsertUser({
    id: signup.userId,
    email: input.email,
    role: 'candidate',
    status: 'active',
    country: input.country,
  });
  if (!userResult.ok) return cleanupAndFail(dependencies, signup.userId);

  const profileResult = await dependencies.insertCandidateProfile({
    user_id: signup.userId,
    full_name: input.fullName,
    city: input.city,
    state_province: input.stateProvince,
    country: input.country,
    phone: null,
    headline: input.headline,
    summary: '',
    years_experience: input.yearsExperience,
    work_authorization: input.workAuthorization,
    searchable: false,
    identity_status: 'not_started',
    identity_reference_id: null,
    identity_verified_at: null,
    date_of_birth_confirmed: true,
  });
  if (!profileResult.ok) return cleanupAndFail(dependencies, signup.userId);

  return {
    ok: true,
    userId: signup.userId,
    verificationEmailSent: signup.verificationEmailSent,
  };
};
