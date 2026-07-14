# Candidate Registration Wizard Design

**Date:** 2026-07-14
**Status:** Approved for implementation
**Project:** Resume Marketplace MVP

## 1. Goal

Replace the current minimal candidate sign-up form with a three-step candidate registration wizard that collects account and core job-profile information before creating any account.

The account is created only after the candidate reaches the final step, accepts the required confirmations, completes Turnstile, and submits the full form. Successful email confirmation sends the candidate directly to identity verification instead of repeating the old onboarding form.

## 2. Scope

### Included

- A three-step candidate registration page at `/register/candidate`.
- Browser-side step navigation and validation as progressive enhancement.
- Full server-side validation of every submitted field.
- Candidate account, `users` row, and `candidate_profiles` row creation from one final submission.
- Compensation cleanup if database profile creation fails after Supabase Auth creates the user.
- A friendly “check your email” result page instead of raw JSON for browser submissions.
- Email-confirmation routing that skips candidate onboarding when a candidate profile already exists.
- Responsive and accessible UI behavior.
- Automated unit, integration, and end-to-end coverage.

### Excluded

- Saving incomplete registration progress.
- `localStorage`, session storage, temporary registration tables, or cross-device resume.
- Phone number, salary expectations, work-type preferences, or resume upload during registration.
- Changes to employer registration.
- Changes to the $2.49 identity-verification payment or Stripe flow.
- Paid Supabase email-template features.

## 3. Selected Approach

Use one HTML form containing all candidate registration fields. JavaScript divides the form into three visible steps, but the server receives the complete payload only once on final submission.

This approach was selected because it:

- creates no partial account or temporary database record;
- avoids storing the password outside the page;
- requires no new infrastructure or paid service;
- supports a simple mobile experience;
- can degrade safely when JavaScript is unavailable.

Without JavaScript, all sections remain visible in one form and can still be submitted.

## 4. User Flow

### Step 1 — Create account

Fields:

- Email address
- Password
- Confirm password

Requirements:

- Password must be 12–128 characters.
- Confirm password must match.
- Password controls support browser password managers.
- A show/hide password control may be included, but passwords are never displayed in the final review.
- Copy explains that the account is not created until the final step.

### Step 2 — Job profile

Fields:

- Legal name
- Country: United States or Canada
- State or province
- City
- Desired job title
- Years of experience
- Work authorization

Work-authorization options:

- Authorized without sponsorship
- May require sponsorship in the future
- Requires sponsorship

Requirements:

- Years of experience must be an integer from 0 through 80.
- Location and title fields are required.
- Country values stored in the database remain `US` and `CA`.

### Step 3 — Review, privacy, and consent

The page displays a non-sensitive summary of:

- Email
- Legal name
- Location
- Desired job title
- Years of experience
- Work authorization

It does not display either password field.

Required confirmations:

- Candidate confirms they are at least 18 years old.
- Candidate agrees to the Terms.
- Candidate acknowledges the Privacy policy.

Required disclosure:

- Registration is free.
- Candidate profiles are not public on the open web.
- Only approved employers can access eligible profiles under platform rules.
- A one-time $2.49 USD identity-verification fee is required before publishing a resume or applying for jobs.
- Government ID and selfie media are handled by the identity provider and are not stored by this application.

Turnstile appears only on this step. The final action is labeled `Create candidate account`.

## 5. Page Structure and Interaction

The page uses a centered registration container wider than the current simple form, with:

- page title and short privacy-oriented introduction;
- a three-part progress indicator: `Account`, `Job profile`, `Review`;
- one card containing the form steps;
- `Back` and `Continue` controls for steps 1 and 2;
- a final submit button on step 3;
- inline validation messages and an `aria-live` status region;
- a sign-in link for existing users.

JavaScript behavior:

1. Only the active fieldset is shown.
2. `Continue` validates the current step using native form validity plus password-match logic.
3. `Back` preserves entered values in the live form.
4. The review summary is generated from current form values when entering step 3.
5. The submit button is disabled after submission to reduce duplicate requests.
6. No form data is written to persistent browser storage.

Accessibility requirements:

- Each step is a semantic `fieldset` with a `legend`.
- Progress state uses `aria-current="step"`.
- Focus moves to the step heading or first invalid field after navigation.
- Validation is not communicated by color alone.
- All interactive controls are keyboard accessible.

## 6. Server-Side Validation

A dedicated candidate-registration schema validates the final payload independently of browser checks.

Validation rules:

- `email`: trimmed, normalized to lowercase, valid email, maximum 320 characters.
- `password`: 12–128 characters.
- `confirmPassword`: must match `password`.
- `fullName`: trimmed, 2–160 characters.
- `country`: `US` or `CA`.
- `stateProvince`: trimmed, 1–120 characters.
- `city`: trimmed, 1–120 characters.
- `headline`: trimmed, 2–160 characters.
- `yearsExperience`: integer, 0–80.
- `workAuthorization`: one of the three approved values.
- `age18`: explicit confirmation.
- `termsAccepted`: explicit confirmation.
- `privacyAccepted`: explicit confirmation.
- Turnstile token: required and verified server-side.

Invalid input returns a friendly registration error page for ordinary browser form submissions. Explicit JSON clients continue to receive structured error codes.

## 7. Account-Creation Data Flow

The final submission performs the following sequence:

1. Apply the existing registration IP rate limit.
2. Parse the complete request body.
3. Verify Turnstile.
4. Validate and normalize all candidate fields.
5. Call Supabase Auth `signUp` with role metadata set to `candidate` and the existing email callback URL.
6. Upsert the corresponding `public.users` row with role `candidate`, status `active`, and the selected country.
7. Insert the complete `public.candidate_profiles` row with:
   - `full_name`
   - `city`
   - `state_province`
   - `country`
   - `headline`
   - `years_experience`
   - `work_authorization`
   - `date_of_birth_confirmed = true`
   - `summary = ''`
   - `searchable = false`
   - `identity_status = 'not_started'`
8. Return a human-readable check-email page when successful.

Supabase Auth and Postgres cannot participate in one cross-service transaction. Therefore, the handler uses compensation cleanup:

- If the `users` or `candidate_profiles` write fails after Auth user creation, call the Supabase admin API to delete the new Auth user.
- The existing foreign-key cascades remove dependent public rows.
- Log the cleanup failure if deletion also fails, but never report successful registration to the candidate.
- A confirmation email may already have been sent before compensation; deleting the Auth user makes that link unusable.

Duplicate-email failures remain generic and do not reveal whether an account exists.

## 8. Email Confirmation and Routing

The free default Supabase email flow remains supported. No paid email-template customization is required.

After a valid confirmation session is established, routing changes from unconditional candidate onboarding to profile-aware routing:

- Employer users continue to `/employer/onboarding`.
- Candidate users with an existing `candidate_profiles` row go to `/candidate/verification`.
- Older candidate accounts without a `candidate_profiles` row continue to `/candidate/onboarding` as a backward-compatible recovery path.

The legacy candidate onboarding route remains available for old or incomplete accounts, but new wizard registrations do not use it.

## 9. Browser and API Responses

### Browser form submission

Success response:

- Page title: `Check your email`
- Message confirms that the account request was accepted and a verification email was sent.
- Message instructs the candidate to check spam or junk folders.
- Provides links to sign in and return home.
- Does not echo the password or full submitted profile.

Failure response:

- Returns a branded page with a concise message and a link back to candidate registration.
- Uses generic messages for account-existence and Supabase Auth failures.

### Explicit JSON requests

The endpoint retains structured responses for automated tests and programmatic clients, including stable codes such as:

- `bot_check_failed`
- `invalid_registration`
- `registration_failed`
- `profile_bootstrap_failed`

## 10. Code Organization

Planned components and modules:

- `src/routes/public.tsx`
  - render the candidate wizard page;
  - keep employer registration unchanged.
- `src/routes/auth.tsx`
  - add dedicated candidate registration parsing and creation flow;
  - preserve employer registration behavior;
  - update post-confirmation destination selection.
- `src/services/candidate-registration-service.ts`
  - normalize candidate input;
  - create public profile rows;
  - perform compensation cleanup;
  - keep the route handler focused on HTTP concerns.
- `public/candidate-registration.js`
  - step navigation, client validation, summary generation, focus management, and duplicate-submit protection.
- `public/styles.css`
  - wizard, progress indicator, review list, action row, validation, and mobile styles.

The registration service should expose a narrow result type so that route code does not depend on internal Supabase response details.

## 11. Error Handling and Security

- All checks are repeated server-side.
- The password is never logged, placed in URLs, persisted in browser storage, or rendered in the review summary.
- Existing CSRF middleware protects the form submission.
- Existing Turnstile verification and registration rate limiting remain mandatory.
- Error responses do not disclose whether an email address already exists.
- User-provided text is rendered through JSX escaping.
- The success page must not include tokens or sensitive profile information.
- The registration handler must not mark a candidate profile searchable.
- Identity verification remains required before resume publishing or application actions.

## 12. Testing Strategy

### Unit tests

- Candidate schema accepts a valid US payload.
- Candidate schema accepts a valid Canadian payload.
- Password mismatch is rejected.
- Unsupported country is rejected.
- Invalid years of experience is rejected.
- Missing age, Terms, or Privacy confirmation is rejected.
- Work authorization outside the approved set is rejected.
- Destination routing sends a completed candidate to verification.
- Destination routing preserves onboarding for legacy candidates without profiles.

### Integration tests

- Final candidate submission creates both `users` and `candidate_profiles` records.
- Candidate profile contains every selected field and remains non-searchable.
- Turnstile failure creates no account.
- Profile insertion failure triggers Auth-user compensation deletion.
- Employer registration behavior is unchanged.
- Successful browser submission returns the check-email experience.
- Explicit JSON submission returns the expected JSON contract.

### End-to-end tests

- Candidate can move forward and backward through all three steps without losing values.
- Invalid step data prevents progression and focuses the invalid field.
- Review summary reflects edits and omits passwords.
- Final submission reaches the check-email page.
- Confirmed new candidate is routed to `/candidate/verification`.
- Layout works at desktop and mobile viewport sizes.
- Keyboard-only navigation completes the wizard.

## 13. Acceptance Criteria

The feature is accepted when:

1. `/register/candidate` presents a clear three-step registration experience.
2. No Auth user or database record is created before final submission.
3. A valid final submission creates a candidate Auth user, `users` row, and complete `candidate_profiles` row.
4. A failed profile bootstrap does not intentionally leave a usable partial Auth account.
5. The candidate sees a branded check-email page instead of raw JSON.
6. Email confirmation sends new candidates directly to `/candidate/verification`.
7. Older candidate accounts without profiles can still use `/candidate/onboarding`.
8. Employer registration is unchanged.
9. No paid Supabase email-template feature is required.
10. Type checking, automated tests, and production build pass before delivery.
