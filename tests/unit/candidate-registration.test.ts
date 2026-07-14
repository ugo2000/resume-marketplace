import { describe, expect, it, vi } from 'vitest';
import {
  createCandidateRegistration,
  parseCandidateRegistration,
  type CandidateRegistrationDependencies,
} from '../../src/services/candidate-registration-service';

const validPayload = {
  email: ' Candidate@Example.com ',
  password: 'correct horse battery staple',
  confirmPassword: 'correct horse battery staple',
  fullName: ' Avery Chen ',
  country: 'CA',
  stateProvince: ' Ontario ',
  city: ' Toronto ',
  headline: ' Operations Coordinator ',
  yearsExperience: '6',
  workAuthorization: 'authorized_without_sponsorship',
  age18: 'on',
  termsAccepted: 'on',
  privacyAccepted: 'on',
};

const validInput = () => {
  const parsed = parseCandidateRegistration(validPayload);
  if (!parsed) throw new Error('expected valid candidate payload');
  return parsed;
};

const createDependencies = (): CandidateRegistrationDependencies => ({
  signUp: vi.fn(async () => ({
    ok: true as const,
    userId: 'candidate-user-id',
    verificationEmailSent: true,
  })),
  upsertUser: vi.fn(async () => ({ ok: true as const })),
  insertCandidateProfile: vi.fn(async () => ({ ok: true as const })),
  deleteAuthUser: vi.fn(async () => ({ ok: true as const })),
  logCleanupFailure: vi.fn(),
});

describe('parseCandidateRegistration', () => {
  it('normalizes a valid Canadian payload', () => {
    expect(parseCandidateRegistration(validPayload)).toEqual({
      email: 'candidate@example.com',
      password: 'correct horse battery staple',
      fullName: 'Avery Chen',
      country: 'CA',
      stateProvince: 'Ontario',
      city: 'Toronto',
      headline: 'Operations Coordinator',
      yearsExperience: 6,
      workAuthorization: 'authorized_without_sponsorship',
    });
  });

  it('accepts a valid United States payload', () => {
    expect(parseCandidateRegistration({ ...validPayload, country: 'US' })?.country).toBe('US');
  });

  it.each([
    ['password mismatch', { confirmPassword: 'different password value' }],
    ['unsupported country', { country: 'GB' }],
    ['years above maximum', { yearsExperience: '81' }],
    ['negative years', { yearsExperience: '-1' }],
    ['missing age confirmation', { age18: undefined }],
    ['missing terms confirmation', { termsAccepted: undefined }],
    ['missing privacy confirmation', { privacyAccepted: undefined }],
    ['unsupported work authorization', { workAuthorization: 'other' }],
  ])('rejects %s', (_name, replacement) => {
    expect(parseCandidateRegistration({ ...validPayload, ...replacement })).toBeNull();
  });
});

describe('createCandidateRegistration', () => {
  it('creates the public user and complete private candidate profile', async () => {
    const dependencies = createDependencies();

    await expect(createCandidateRegistration(dependencies, validInput())).resolves.toEqual({
      ok: true,
      userId: 'candidate-user-id',
      verificationEmailSent: true,
    });

    expect(dependencies.upsertUser).toHaveBeenCalledWith({
      id: 'candidate-user-id',
      email: 'candidate@example.com',
      role: 'candidate',
      status: 'active',
      country: 'CA',
    });
    expect(dependencies.insertCandidateProfile).toHaveBeenCalledWith({
      user_id: 'candidate-user-id',
      full_name: 'Avery Chen',
      city: 'Toronto',
      state_province: 'Ontario',
      country: 'CA',
      phone: null,
      headline: 'Operations Coordinator',
      summary: '',
      years_experience: 6,
      work_authorization: 'authorized_without_sponsorship',
      searchable: false,
      identity_status: 'not_started',
      identity_reference_id: null,
      identity_verified_at: null,
      date_of_birth_confirmed: true,
    });
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('returns a generic registration failure without public writes when auth signup fails', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.signUp).mockResolvedValue({ ok: false });

    await expect(createCandidateRegistration(dependencies, validInput())).resolves.toEqual({
      ok: false,
      code: 'registration_failed',
    });
    expect(dependencies.upsertUser).not.toHaveBeenCalled();
    expect(dependencies.insertCandidateProfile).not.toHaveBeenCalled();
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('deletes the auth user when public user bootstrap fails', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.upsertUser).mockResolvedValue({
      ok: false,
      error: new Error('users write failed'),
    });

    await expect(createCandidateRegistration(dependencies, validInput())).resolves.toEqual({
      ok: false,
      code: 'profile_bootstrap_failed',
    });
    expect(dependencies.deleteAuthUser).toHaveBeenCalledWith('candidate-user-id');
    expect(dependencies.insertCandidateProfile).not.toHaveBeenCalled();
  });

  it('deletes the auth user when candidate profile bootstrap fails', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.insertCandidateProfile).mockResolvedValue({
      ok: false,
      error: new Error('profile write failed'),
    });

    await expect(createCandidateRegistration(dependencies, validInput())).resolves.toEqual({
      ok: false,
      code: 'profile_bootstrap_failed',
    });
    expect(dependencies.deleteAuthUser).toHaveBeenCalledWith('candidate-user-id');
  });

  it('logs cleanup failure without changing the public error contract', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.insertCandidateProfile).mockResolvedValue({ ok: false, error: 'insert' });
    vi.mocked(dependencies.deleteAuthUser).mockResolvedValue({ ok: false, error: 'delete' });

    await expect(createCandidateRegistration(dependencies, validInput())).resolves.toEqual({
      ok: false,
      code: 'profile_bootstrap_failed',
    });
    expect(dependencies.logCleanupFailure).toHaveBeenCalledWith('candidate-user-id', 'delete');
  });
});
