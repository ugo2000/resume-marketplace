# Resume Marketplace MVP — Design Specification

**Date:** 2026-07-13  
**Status:** Approved scope / design review pending  
**Target markets:** United States and Canada  
**Language:** English only  
**Currency:** USD only

## 1. Product Summary

A low-cost online recruitment marketplace where:

- Approved employers can publish job posts for free.
- Verified adult candidates can publish structured resumes and optionally upload a PDF.
- Public visitors can browse jobs.
- Candidates can apply to jobs for free.
- Approved employers can search the private candidate database.
- Candidate contact details are hidden until unlocked.
- Employers purchase prepaid lookup credits and spend one credit to unlock one candidate.
- A candidate who applies directly to an employer grants that employer free access to the candidate’s contact details and PDF resume.

The platform must minimize fixed operating cost, avoid storing government ID images, and keep candidate profiles inaccessible to the public.

## 2. Approved Business Rules

### 2.1 Candidate accounts

- Candidates must be at least 18 years old.
- Supported residence countries: United States and Canada.
- Candidate identity verification is required before publishing a resume or applying to jobs.
- Candidate pays a one-time **$2.49 USD identity-verification fee**.
- Identity verification is performed by a third-party provider.
- The platform never stores government ID images or selfie images.
- The platform stores only verification status, provider reference ID, verification timestamp, and country.
- Email is required; phone number is optional.
- Address is limited to city, state/province, and country. Street address is not stored.
- Candidate profiles use a structured online resume and may include an optional private PDF resume.
- Candidate resumes are visible only to approved employers.
- Before unlock, employers see an anonymized name or initials.
- Candidate PDF resumes are inaccessible until the employer unlocks the candidate or receives a direct application.
- Candidate account deletion immediately disables the account, allows a 30-day restoration period, then permanently deletes resume data, contact details, and PDF files. Necessary financial, fraud-prevention, and audit records may be retained.

### 2.2 Employer accounts

- An employer account must be manually reviewed and approved by an administrator.
- Employer review submission includes company name, website, company email, registration number, country, and supporting registration documentation.
- Supporting employer documents are stored privately.
- Original employer documents are deleted 30 days after the review decision, unless a fraud, payment, legal, or dispute hold applies.
- Only approved employers may publish jobs, search candidates, purchase credits, or unlock contact details.
- Each company has one employer administrator account in MVP.
- Approved employers may publish jobs without per-job moderation.
- Each approved employer may have at most 10 active jobs at a time.
- Draft, closed, removed, and expired jobs do not count toward the active-job limit.
- Jobs expire after 30 days and may be renewed for free.

### 2.3 Job posts and applications

- Job posts are publicly searchable and viewable.
- Visitors must sign in as verified candidates to apply.
- Employers publish jobs for free.
- No built-in messaging system in MVP.
- Candidates submit an optional cover note with an application.
- When a candidate applies, the employer receives free permanent access to that candidate’s full name, email, optional phone number, and PDF resume.
- Employers contact candidates directly by email or phone.

### 2.4 Contact unlocks and pricing

- Employers buy prepaid lookup credits:
  - **$30 USD = 10 credits**
  - **$75 USD = 25 credits**
- One paid unlock costs one credit.
- Paid unlock is required only when an approved employer proactively searches for a candidate who has not applied to that employer.
- Unlock access is permanent for that employer.
- Reopening the same candidate does not consume another credit.
- Credits never expire.
- Credits are generally non-refundable.
- Refunds are allowed only for duplicate charges, technical failures, credits not delivered correctly, or legal requirements.
- Used credits are not refundable.

### 2.5 Verification failure policy

- A candidate may resume or retry the same verification flow.
- Once the third-party verification process has started, the $2.49 fee is not automatically refunded.
- If a technical failure prevents creation of the verification session, the payment is automatically refunded.
- Manual appeal is available.
- Payment and verification-session creation use idempotency controls to prevent duplicate billing or duplicate sessions.

## 3. Recommended Architecture

### 3.1 Hosting and application layer

- **Cloudflare Pages / Workers**
  - Public website
  - Candidate portal
  - Employer portal
  - Administrator portal
  - Server-side API routes
  - Public job pages for search-engine indexing

### 3.2 Backend services

- **Supabase**
  - PostgreSQL database
  - Authentication
  - Row-Level Security
  - Private file storage
  - Server-side functions where appropriate
  - Scheduled cleanup jobs

### 3.3 Payments and identity

- **Stripe Checkout**
  - Candidate $2.49 verification payment
  - Employer $30 and $75 credit packages
- **Stripe Identity**
  - Government ID and selfie verification
- **Stripe webhooks**
  - Payment completion
  - Refunds
  - Verification status updates

### 3.4 Email

- Transactional email provider with a free starter tier.
- Required messages:
  - Candidate email verification
  - Employer review submitted / approved / rejected
  - Candidate verification status
  - New job application
  - Job expiration reminder
  - Payment receipt
  - Account deletion confirmation

## 4. User Roles and Permissions

### 4.1 Visitor

- Browse and search public job posts.
- View job details.
- Register as candidate or employer.
- Cannot view candidate profiles.

### 4.2 Candidate

- Register and sign in.
- Confirm age and country eligibility.
- Pay identity-verification fee.
- Complete identity verification.
- Create and manage structured resume.
- Upload or replace private PDF resume.
- Browse public jobs.
- Apply to jobs after verification.
- View application history.
- Request account deletion and restore within 30 days.

### 4.3 Pending employer

- Register and sign in.
- Submit company information and registration proof.
- View review status.
- Cannot publish jobs, buy credits, search candidates, or unlock contacts.

### 4.4 Approved employer

- Publish, renew, close, and manage jobs.
- Maintain up to 10 active jobs.
- View applicants and their full contact information.
- Search anonymized candidate profiles.
- Buy lookup credits.
- Unlock candidate contact details and PDF resume.
- View previously unlocked candidates permanently.

### 4.5 Administrator

- Review employer applications.
- Approve, reject, suspend, or restore employers.
- Suspend users.
- Remove job posts or candidate profiles.
- View payment, credit, unlock, verification-status, and audit records.
- Review reports and refund disputes.
- Never view government ID images or selfie images.

## 5. Pages and Routes

### 5.1 Public

- `/`
- `/jobs`
- `/jobs/:slug`
- `/pricing`
- `/for-employers`
- `/privacy`
- `/terms`
- `/identity-verification`
- `/login`
- `/register/candidate`
- `/register/employer`

### 5.2 Candidate portal

- `/candidate/onboarding`
- `/candidate/verification`
- `/candidate/resume`
- `/candidate/resume/pdf`
- `/candidate/applications`
- `/candidate/settings`
- `/candidate/delete-account`

### 5.3 Employer portal

- `/employer/onboarding`
- `/employer/review-status`
- `/employer/jobs`
- `/employer/jobs/new`
- `/employer/jobs/:id/edit`
- `/employer/applications`
- `/employer/candidates`
- `/employer/candidates/:id`
- `/employer/unlocked`
- `/employer/credits`
- `/employer/settings`

### 5.4 Administrator portal

- `/admin/employers`
- `/admin/employers/:id`
- `/admin/users`
- `/admin/jobs`
- `/admin/reports`
- `/admin/payments`
- `/admin/audit`

## 6. Data Model

### 6.1 Core tables

- `users`
- `candidate_profiles`
- `candidate_skills`
- `candidate_experience`
- `candidate_education`
- `resume_files`
- `employer_profiles`
- `employer_documents`
- `jobs`
- `applications`
- `credit_wallets`
- `credit_transactions`
- `contact_unlocks`
- `payments`
- `identity_verifications`
- `audit_logs`
- `reports`
- `account_deletion_requests`

### 6.2 Important uniqueness constraints

- One candidate profile per candidate user.
- One employer profile per employer user.
- One application per candidate per job.
- One contact unlock per employer-candidate pair.
- One credit wallet per employer.
- Stripe event IDs are unique.
- Stripe checkout session IDs are unique.
- Identity provider reference IDs are unique.

### 6.3 Important indexes

- Public jobs by status, country, state/province, city, employment type, workplace type, and expiration date.
- Candidate search by headline, skills, country, state/province, city, years of experience, and work authorization.
- Applications by employer, job, candidate, and applied timestamp.
- Contact unlocks by employer and candidate.
- Audit logs by actor, target, action, and timestamp.

## 7. Core Workflows

### 7.1 Candidate onboarding and verification

1. Candidate creates account and verifies email.
2. Candidate confirms age 18+ and US/Canada residence.
3. Candidate pays $2.49 through Stripe Checkout.
4. Payment webhook records successful payment.
5. Server creates or reuses an identity-verification session using an idempotency key.
6. Candidate completes verification with the third-party provider.
7. Verification webhook updates status.
8. On success, candidate gains permission to publish resume and apply.
9. On failure or additional-information status, candidate resumes the same verification flow.

### 7.2 Employer approval

1. Employer creates account and verifies email.
2. Employer enters company details and uploads registration proof.
3. Employer status becomes `pending`.
4. Administrator reviews the submission.
5. Administrator approves or rejects with a reason.
6. Approved employer gains access to publishing, search, credits, and unlocks.
7. A scheduled job deletes original review documents 30 days after decision unless held.

### 7.3 Job publishing

1. Approved employer creates a job draft.
2. Server checks active-job count is below 10.
3. Employer publishes the job.
4. Job becomes public and receives a 30-day expiration timestamp.
5. Expired jobs stop accepting applications.
6. Employer may renew for another 30 days at no charge.

### 7.4 Candidate application

1. Verified candidate opens a public job.
2. Candidate submits application and optional cover note.
3. Server creates one application record.
4. Server creates a free permanent contact unlock for that employer-candidate pair.
5. Employer receives email notification.
6. Employer may view full contact details and private PDF resume.

### 7.5 Employer paid unlock

1. Approved employer opens an anonymized candidate profile.
2. Server checks for an existing unlock.
3. If already unlocked, show full details without charging.
4. If candidate already applied to that employer, create or use a free unlock.
5. Otherwise, atomically:
   - lock the employer credit wallet row;
   - verify at least one credit is available;
   - decrement one credit;
   - create one credit transaction;
   - create one permanent contact unlock.
6. Return full name, email, optional phone, and a short-lived signed URL for the PDF resume.

### 7.6 Credit purchase

1. Approved employer selects a credit package.
2. Server creates Stripe Checkout session.
3. Stripe payment webhook is verified.
4. A database transaction adds the package credits exactly once.
5. Receipt and updated balance are shown.

### 7.7 Candidate account deletion

1. Candidate requests deletion.
2. Account becomes disabled immediately.
3. A 30-day restoration deadline is stored.
4. Candidate can restore the account during the grace period.
5. After 30 days, a scheduled job deletes candidate profile data, contact details, resume records, and PDF files.
6. Necessary payment, fraud, legal, and audit records remain with minimized personal data.

## 8. Security and Privacy Design

- Use Supabase Row-Level Security on all private tables.
- Public clients never receive candidate contact fields before authorization.
- Contact unlock logic runs only in trusted server-side code.
- Credit deduction and unlock creation run in one database transaction.
- Stripe webhook signatures must be verified.
- All webhook handlers must be idempotent.
- Employer and resume documents use private storage buckets.
- PDF downloads use short-lived signed URLs.
- Administrator permissions are server-enforced, not UI-only.
- Sensitive actions are written to audit logs.
- Rate limits apply to registration, login, job posting, candidate search, unlock, and report endpoints.
- Use bot protection on registration, login, payment initiation, and employer submission.
- No government ID images or selfie images are stored by the platform.
- No public candidate-directory endpoint exists.
- Candidate search responses exclude full name, email, phone, and private file paths until authorized.

## 9. Abuse Prevention

- Manual employer approval before access to candidate search.
- Corporate email and registration proof required.
- Maximum 10 active jobs per employer.
- Jobs expire after 30 days.
- Administrators may suspend accounts and remove content.
- Users may report fraudulent jobs or abusive employers.
- Suspended employers retain historical records but cannot publish, search, unlock, or use credits.
- Duplicate employer registration patterns and payment anomalies should be flagged for review.

## 10. Error Handling

### 10.1 Payments

- Duplicate webhooks do not add credits twice.
- Failed Checkout sessions do not grant credits or verification access.
- A successful identity-fee payment with failed session creation triggers automatic refund or a retry-safe recovery job.
- Refunds update both payment and credit ledger records.

### 10.2 Unlocks

- Concurrent unlock requests cannot charge twice.
- Existing unlocks return success without credit deduction.
- Insufficient credit returns a clear purchase prompt.
- Database transaction failure leaves wallet and unlock state unchanged.

### 10.3 File handling

- Reject unsupported file types and files above configured size limits.
- Virus or malware scanning should be added before public launch.
- Failed uploads do not replace the prior valid file.
- Signed URLs expire quickly and are never stored in the database.

### 10.4 Employer review

- Missing required fields prevent submission.
- Review status transitions are restricted to administrators.
- Rejected employers may resubmit with new documentation.

## 11. Testing Strategy

### 11.1 Unit tests

- Active-job limit.
- Job expiration and renewal.
- Credit package calculations.
- Unlock authorization.
- Free unlock after application.
- Idempotent webhook processing.
- Account deletion retention dates.

### 11.2 Integration tests

- Candidate payment to verification-session creation.
- Identity webhook to candidate permission update.
- Employer approval to publishing permission.
- Stripe credit purchase to wallet balance.
- Paid unlock transaction under concurrent requests.
- PDF access before and after unlock.

### 11.3 Security tests

- Candidate data inaccessible to visitors.
- Candidate data inaccessible to pending or rejected employers.
- One employer cannot access another employer’s unlock records.
- Direct database/API attempts cannot bypass credit deduction.
- Expired signed URLs fail.
- Administrator routes reject non-admin users.

### 11.4 End-to-end tests

- Candidate registration, payment, verification, resume creation, and application.
- Employer registration, manual approval, job publishing, candidate search, credit purchase, and unlock.
- Candidate account deletion and restoration.
- Job expiration and free renewal.

## 12. Non-Goals for MVP

- No native mobile apps.
- No built-in chat.
- No employer team members or recruiter seats.
- No French localization.
- No CAD pricing.
- No automated employer verification.
- No automated per-job moderation.
- No candidate subscription.
- No employer subscription.
- No AI resume writing or ranking.
- No video resumes.
- No background-check service.
- No salary benchmarking.
- No public candidate profiles.

## 13. Launch and Compliance Readiness

Before public launch, obtain qualified legal review for:

- Privacy policy and terms of service for US and Canada.
- Employment-discrimination and job-posting rules.
- Identity-verification consent and disclosure language.
- Payment, refund, deletion, and data-retention policies.
- Canadian privacy obligations and applicable US state privacy laws.

The technical design reduces exposure but does not by itself guarantee legal compliance.

## 14. MVP Acceptance Criteria

The MVP is complete when:

1. Visitors can browse public jobs.
2. Candidates can register, pay $2.49, complete identity verification, create a structured resume, optionally upload a PDF, and apply to jobs.
3. Employers can register, submit documents, and wait for manual approval.
4. Administrators can approve or reject employers.
5. Approved employers can publish up to 10 active jobs for free.
6. Jobs expire after 30 days and may be renewed for free.
7. Approved employers can search anonymized candidate profiles.
8. Employers can buy 10 or 25 lookup credits.
9. One paid credit permanently unlocks one candidate.
10. Candidate applications grant the receiving employer free permanent contact access.
11. Contact information and PDF resumes remain private before authorization.
12. Account deletion, employer-document deletion, audit logging, refunds, and idempotent webhook handling work as specified.
