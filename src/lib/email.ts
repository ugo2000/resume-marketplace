import type { Bindings } from '../env';
import type { AppContext } from './supabase';

export type EmailMessage = { to: string; subject: string; text: string };

export const sendEmailWithEnv = async (env: Bindings, message: EmailMessage) => {
  const response = await fetch(env.EMAIL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
  });
  if (!response.ok) throw new Error(`email_failed:${response.status}`);
};

export const sendEmail = async (c: AppContext, message: EmailMessage) =>
  sendEmailWithEnv(c.env, message);

export const queueEmail = (c: AppContext, message: EmailMessage) => {
  const task = sendEmail(c, message).catch((error) =>
    console.error('transactional_email_failed', error),
  );
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    void task;
  }
};

export const applicationEmail = (to: string, jobTitle: string): EmailMessage => ({
  to,
  subject: `New application for ${jobTitle}`,
  text: `A verified candidate applied to ${jobTitle}. Sign in to view the application and contact details.`,
});
export const reviewEmail = (to: string, status: 'approved' | 'rejected', reason?: string): EmailMessage => ({
  to,
  subject: `Employer account ${status}`,
  text: status === 'approved'
    ? 'Your employer account is approved. You may now publish jobs and search candidates.'
    : `Your employer submission was rejected. Reason: ${reason ?? 'Registration could not be verified.'}`,
});
export const identityEmail = (to: string, status: 'verified' | 'requires_input'): EmailMessage => ({
  to,
  subject: status === 'verified' ? 'Identity verified' : 'Identity verification needs attention',
  text: status === 'verified'
    ? 'Your identity is verified. You may now publish your resume and apply to jobs.'
    : 'Your identity verification needs more information. Sign in to resume the same verification session.',
});
export const creditReceiptEmail = (to: string, credits: number): EmailMessage => ({
  to,
  subject: `${credits} lookup credits added`,
  text: `${credits} lookup credits were added to your employer account. Credits do not expire.`,
});
export const employerSubmissionEmail = (to: string): EmailMessage => ({
  to,
  subject: 'Employer review submitted',
  text: 'Your employer verification documents were received. An administrator will review the submission.',
});
export const identityFeeReceiptEmail = (to: string): EmailMessage => ({
  to,
  subject: 'Identity verification payment received',
  text: 'Your $2.49 USD identity-verification payment was received.',
});
export const jobExpiryEmail = (to: string, title: string, expiresAt: string): EmailMessage => ({
  to,
  subject: `${title} expires soon`,
  text: `Your job post ${title} expires at ${expiresAt}. Renew it free from the employer dashboard.`,
});
export const deletionEmail = (to: string, restoreUntil: string): EmailMessage => ({
  to,
  subject: 'Account deletion requested',
  text: `Your account is disabled. You may restore it until ${restoreUntil}.`,
});
