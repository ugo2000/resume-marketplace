# Candidate Registration Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal candidate sign-up form with an accessible three-step wizard that creates the Auth user and complete candidate profile only on final submission, then routes confirmed new candidates directly to identity verification.

**Architecture:** Keep one progressively enhanced HTML form at `/register/candidate`; browser JavaScript manages step visibility, validation, review text, and focus without persistent storage. A dedicated candidate-registration service owns validation, normalization, public-row creation, and compensating Auth-user deletion. The Auth route remains responsible for rate limiting, Turnstile, request/response negotiation, and confirmation-session cookies.

**Tech Stack:** TypeScript, Hono JSX, Zod, Supabase JS 2.110.2, Cloudflare Turnstile, Vitest, Playwright, vanilla browser JavaScript, CSS.

## Global Constraints

- Do not create an Auth user, public user row, candidate profile, or temporary record before the final form submission.
- Do not use localStorage, sessionStorage, a temporary registration table, or a paid Supabase email-template feature.
- Password length is 12–128 characters and passwords must never appear in the review summary, logs, URLs, or success HTML.
- Candidate country values stored in the database are exactly `US` or `CA`.
- Years of experience is an integer from 0 through 80.
- Candidate profiles created by this flow must have `searchable=false`, `identity_status='not_started'`, `date_of_birth_confirmed=true`, and `summary=''`.
- Employer registration behavior and endpoint contract remain unchanged.
- Browser submissions receive branded HTML; explicit JSON submissions retain stable JSON error codes.
- New candidates with profiles route to `/candidate/verification`; legacy candidates without profiles route to `/candidate/onboarding`.
- Use test-first development and run type checking, all Vitest tests, and the production build before delivery.

---

## File Structure

- Create `src/services/candidate-registration-service.ts`: input schema, normalization, account/profile bootstrap, and compensation cleanup.
- Create `tests/unit/candidate-registration.test.ts`: schema and service behavior tests using narrow fake dependencies.
- Modify `src/routes/auth.tsx`: dedicated candidate registration handler, browser/JSON response selection, and profile-aware confirmation destination.
- Create `tests/unit/candidate-registration-route.test.ts`: route helper and destination behavior tests.
- Modify `src/routes/public.tsx`: render the three-step candidate wizard while preserving the employer form.
- Create `public/candidate-registration.js`: progressive enhancement for steps, review, focus, password matching, and duplicate-submit protection.
- Modify `public/styles.css`: wizard, progress, review, validation, disclosure, action row, responsive, and reduced-motion styles.
- Create `tests/unit/candidate-registration-page.test.ts`: rendered HTML and static script safety/behavior contract tests.
- Modify `tests/e2e/candidate-registration.spec.ts`: browser navigation, value preservation, validation, review, keyboard, and mobile coverage.
- Modify `docs/superpowers/specs/2026-07-14-candidate-registration-wizard-design.md`: mark the approved design as approved.

---

### Task 1: Candidate Registration Schema and Bootstrap Service

**Files:**
- Create: `src/services/candidate-registration-service.ts`
- Create: `tests/unit/candidate-registration.test.ts`

**Interfaces:**
- Produces: `candidateRegistrationSchema`, `parseCandidateRegistration(input: unknown): CandidateRegistrationInput | null`, and `createCandidateRegistration(deps, input): Promise<CandidateRegistrationResult>`.
- `CandidateRegistrationInput` contains normalized `email`, `password`, `fullName`, `country`, `stateProvince`, `city`, `headline`, `yearsExperience`, and `workAuthorization`.
- `CandidateRegistrationDependencies` exposes `signUp`, `upsertUser`, `insertCandidateProfile`, `deleteAuthUser`, and `logCleanupFailure` so tests do not need network mocks.

- [ ] **Step 1: Write failing schema tests**

Create tests that use this valid payload and explicit invalid variants:

```ts
const validPayload = {
  email: ' Candidate@Example.com ',
  password: 'correct horse battery staple',
  confirmPassword: 'correct horse battery staple',
  fullName: ' Avery Chen ',
  country: 'CA',
  stateProvince: 'Ontario',
  city: 'Toronto',
  headline: 'Operations Coordinator',
  yearsExperience: '6',
  workAuthorization: 'authorized_without_sponsorship',
  age18: 'on',
  termsAccepted: 'on',
  privacyAccepted: 'on',
};
```

Assert normalization to lowercase email, trimmed text, numeric years, and rejection of mismatch, unsupported country, `81`, missing confirmations, and unsupported work authorization.

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
pnpm vitest run tests/unit/candidate-registration.test.ts
```

Expected: FAIL because `candidate-registration-service.ts` does not exist.

- [ ] **Step 3: Implement the Zod schema and parser**

Implement:

```ts
const acceptedConfirmation = z.literal('on');
const workAuthorizationSchema = z.enum([
  'authorized_without_sponsorship',
  'future_sponsorship_may_be_required',
  'sponsorship_required',
]);

export const candidateRegistrationSchema = z.object({
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
}).superRefine((value, context) => {
  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmPassword'],
      message: 'Passwords must match',
    });
  }
});
```

Return only normalized fields needed by the creation service, excluding `confirmPassword` and checkbox strings.

- [ ] **Step 4: Run schema tests and verify GREEN**

Run the same Vitest command. Expected: schema tests PASS.

- [ ] **Step 5: Write failing service compensation tests**

Use fake dependency functions to assert:

- successful sign-up calls `upsertUser` with country and then inserts a non-searchable candidate profile;
- failed public user upsert calls `deleteAuthUser` once;
- failed candidate profile insert calls `deleteAuthUser` once;
- failed cleanup calls `logCleanupFailure` and still returns `profile_bootstrap_failed`;
- sign-up failure returns `registration_failed` and never writes public rows.

- [ ] **Step 6: Run service tests and verify RED**

Run the same targeted test command. Expected: FAIL because `createCandidateRegistration` is not implemented.

- [ ] **Step 7: Implement minimal bootstrap orchestration**

Use this narrow result union:

```ts
export type CandidateRegistrationResult =
  | { ok: true; verificationEmailSent: boolean; userId: string }
  | { ok: false; code: 'registration_failed' | 'profile_bootstrap_failed' };
```

Creation order:

```ts
const signUpResult = await deps.signUp(input);
if (!signUpResult.ok) return { ok: false, code: 'registration_failed' };

const userResult = await deps.upsertUser({
  id: signUpResult.userId,
  email: input.email,
  role: 'candidate',
  status: 'active',
  country: input.country,
});
if (!userResult.ok) return cleanupAndFail(...);

const profileResult = await deps.insertCandidateProfile({
  user_id: signUpResult.userId,
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
```

If cleanup throws or returns an error, call `logCleanupFailure(userId, error)` without including email, password, or profile text.

- [ ] **Step 8: Run targeted tests and verify GREEN**

Expected: all candidate-registration unit tests PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/services/candidate-registration-service.ts tests/unit/candidate-registration.test.ts
git commit -m "feat: add candidate registration service"
```

---

### Task 2: Dedicated Candidate Registration HTTP Flow

**Files:**
- Modify: `src/routes/auth.tsx`
- Create: `tests/unit/candidate-registration-route.test.ts`

**Interfaces:**
- Consumes: `parseCandidateRegistration` and `createCandidateRegistration` from Task 1.
- Produces: `wantsJsonResponse(request: Request): boolean`, `confirmationDestination(role, hasCandidateProfile): string`, and dedicated `POST /auth/register/candidate` behavior.

- [ ] **Step 1: Write failing response-negotiation and destination tests**

Test:

```ts
expect(wantsJsonResponse(new Request('https://example.test', {
  headers: { accept: 'application/json' },
}))).toBe(true);
expect(wantsJsonResponse(new Request('https://example.test', {
  headers: { accept: 'text/html,application/xhtml+xml' },
}))).toBe(false);

expect(confirmationDestination('employer', false)).toBe('/employer/onboarding');
expect(confirmationDestination('candidate', true)).toBe('/candidate/verification');
expect(confirmationDestination('candidate', false)).toBe('/candidate/onboarding');
```

Also request `GET /register/candidate` later in Task 3; keep this task focused on Auth behavior.

- [ ] **Step 2: Run route helper tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/candidate-registration-route.test.ts
```

Expected: FAIL because the helpers are not exported.

- [ ] **Step 3: Split candidate and employer POST handlers**

Replace the generic `POST /register/:role` candidate path with:

```ts
authRoutes.post('/register/candidate', async (c) => {
  const body = await c.req.parseBody();
  const json = wantsJsonResponse(c.req.raw);

  if (!(await verifyTurnstile(c, String(body['cf-turnstile-response'] ?? '')))) {
    return candidateRegistrationFailure(c, json, 'bot_check_failed', 400);
  }

  const input = parseCandidateRegistration(body);
  if (!input) {
    return candidateRegistrationFailure(c, json, 'invalid_registration', 400);
  }

  const userClient = getUserClient(c);
  const serviceClient = getServiceClient(c);
  const result = await createCandidateRegistration({
    signUp: async (value) => {
      const { data, error } = await userClient.auth.signUp({
        email: value.email,
        password: value.password,
        options: {
          data: { role: 'candidate' },
          emailRedirectTo: `${c.env.APP_ORIGIN}/auth/callback`,
        },
      });
      return error || !data.user
        ? { ok: false as const }
        : {
            ok: true as const,
            userId: data.user.id,
            verificationEmailSent: !data.session,
          };
    },
    upsertUser: async (row) => ({ ok: !(await serviceClient.from('users').upsert(row)).error }),
    insertCandidateProfile: async (row) => ({ ok: !(await serviceClient.from('candidate_profiles').insert(row)).error }),
    deleteAuthUser: async (userId) => ({ ok: !(await serviceClient.auth.admin.deleteUser(userId)).error }),
    logCleanupFailure: (userId, error) => console.error('candidate_registration_cleanup_failed', { userId, error: String(error) }),
  }, input);

  if (!result.ok) return candidateRegistrationFailure(c, json, result.code, result.code === 'registration_failed' ? 400 : 500);
  return json
    ? c.json({ ok: true, verificationEmailSent: result.verificationEmailSent }, 201)
    : c.html(<CheckEmailPage />, 201);
});
```

Keep employer registration on `POST /register/employer` with the existing credential-only behavior and unchanged response contract.

- [ ] **Step 4: Add branded browser response components**

Add focused JSX helpers inside `auth.tsx`:

```tsx
const CheckEmailPage = () => (
  <Layout title="Check your email">
    <section class="card auth-result" aria-live="polite">
      <p class="eyebrow">Almost finished</p>
      <h1>Check your email</h1>
      <p>We accepted your candidate account request and sent a verification email.</p>
      <p>Open the message to confirm your address. Check spam or junk folders if it does not arrive.</p>
      <div class="action-row">
        <a class="button" href="/login">Sign in</a>
        <a href="/">Return home</a>
      </div>
    </section>
  </Layout>
);
```

Failure HTML must contain a generic message, `/register/candidate` link, no submitted values, and no distinction between duplicate account and other Auth failure.

- [ ] **Step 5: Implement profile-aware confirmation destination**

Replace `onboardingPathForUser` with a query that selects the user role; for candidates, query `candidate_profiles` by `user_id`, then call the pure `confirmationDestination` helper. Use it in both callback handlers.

- [ ] **Step 6: Run targeted route tests and verify GREEN**

Run:

```bash
pnpm vitest run tests/unit/candidate-registration-route.test.ts tests/unit/auth-callback.test.ts
```

Expected: all tests PASS and existing free default Supabase callback tests remain green.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/routes/auth.tsx tests/unit/candidate-registration-route.test.ts
git commit -m "feat: add candidate registration HTTP flow"
```

---

### Task 3: Three-Step Candidate Registration Page

**Files:**
- Modify: `src/routes/public.tsx`
- Create: `public/candidate-registration.js`
- Modify: `public/styles.css`
- Create: `tests/unit/candidate-registration-page.test.ts`

**Interfaces:**
- Form action: `POST /auth/register/candidate`.
- Field names must exactly match Task 1 schema.
- Script root selector: `[data-candidate-registration]`.
- Step selector: `[data-registration-step]` with integer `data-registration-step` values `1`, `2`, and `3`.
- Review output selector: `[data-review-field="<fieldName>"]`.

- [ ] **Step 1: Write failing page-contract tests**

Request `/register/candidate` with a test environment and assert:

- three fieldsets and three progress items;
- all required field names and Turnstile;
- Terms and Privacy links;
- one-time `$2.49 USD` disclosure;
- `/candidate-registration.js` script;
- employer page still contains only the existing email/password registration form.

Read `public/candidate-registration.js` and assert it does not contain `localStorage`, `sessionStorage`, `password` review output assignment, or network requests before form submission.

- [ ] **Step 2: Run page tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/candidate-registration-page.test.ts
```

Expected: FAIL because the wizard and script do not exist.

- [ ] **Step 3: Render semantic progressive-enhancement markup**

Create a `CandidateRegisterForm` component with:

```tsx
<section class="registration-shell">
  <header class="registration-intro">
    <p class="eyebrow">Private candidate account</p>
    <h1>Create your candidate account</h1>
    <p>Complete all three steps. Your account is created only after the final submission.</p>
  </header>
  <ol class="registration-progress" aria-label="Registration progress">
    <li data-progress-step="1" aria-current="step"><span>1</span>Account</li>
    <li data-progress-step="2"><span>2</span>Job profile</li>
    <li data-progress-step="3"><span>3</span>Review</li>
  </ol>
  <form method="post" action="/auth/register/candidate" class="card registration-form" data-candidate-registration noValidate={false}>
    ...three fieldsets...
  </form>
  <p>Already registered? <a href="/login">Sign in</a>.</p>
</section>
```

All fieldsets are visible by default; the script adds a `registration-enhanced` class before hiding inactive steps. Use `fieldset`, `legend`, explicit labels, descriptions with `aria-describedby`, native required/min/max/minlength/maxlength, and `autocomplete` values.

- [ ] **Step 4: Add vanilla JavaScript behavior**

On `DOMContentLoaded`:

1. Locate the form and add `registration-enhanced` to the root.
2. Maintain `currentStep` only in memory.
3. On Continue, run `reportValidity()` for fields in the active fieldset and separately call `confirmPassword.setCustomValidity(...)`.
4. Focus the first invalid control or the next step legend.
5. On Back, switch steps without clearing values.
6. Entering step 3 fills text-only review nodes from current values; map country and work-authorization codes to readable labels; never read passwords for review.
7. Update `aria-current` and a polite `aria-live` status.
8. On final submit, validate all steps, set `aria-busy="true"`, and disable the final button.
9. Do not call fetch, write storage, or alter the form action.

- [ ] **Step 5: Add responsive and accessible CSS**

Add classes for:

- `.registration-shell`, `.registration-intro`, `.registration-progress`, `.registration-form`;
- `.registration-enhanced [data-registration-step][hidden] { display: none; }`;
- `.form-grid`, `.review-list`, `.registration-disclosure`, `.registration-actions`, `.secondary-button`, `.form-note`, `.field-error`, `.auth-result`;
- visible `:focus-visible` outlines;
- mobile one-column layout at 720px;
- `@media (prefers-reduced-motion: reduce)` to remove optional transitions.

- [ ] **Step 6: Run page tests and verify GREEN**

Run the targeted Vitest file. Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/routes/public.tsx public/candidate-registration.js public/styles.css tests/unit/candidate-registration-page.test.ts
git commit -m "feat: build candidate registration wizard"
```

---

### Task 4: Browser Acceptance Coverage

**Files:**
- Create: `tests/e2e/candidate-registration.spec.ts`

**Interfaces:**
- Consumes the DOM hooks from Task 3.
- Does not require a successful external Supabase or Turnstile request for navigation/review tests.

- [ ] **Step 1: Write browser interaction tests**

Add tests that:

- open `/register/candidate`, fill step 1, continue, fill step 2, go back, and confirm values persist;
- verify mismatched passwords prevent step advancement and focus Confirm password;
- enter step 3 and assert review text contains email/name/location/title/experience/work authorization but not either password;
- operate Back/Continue with keyboard controls;
- run the same render/navigation assertions at a 390×844 viewport.

For final-submission UI without external network dependencies, intercept `POST /auth/register/candidate` and fulfill a small `Check your email` HTML response, then assert the page title/text.

- [ ] **Step 2: List Playwright tests**

Run:

```bash
pnpm test:e2e:list
```

Expected: the new candidate registration tests are discovered with no configuration or syntax errors.

- [ ] **Step 3: Run local browser tests when the configured dev server is available**

Run:

```bash
pnpm test:e2e -- tests/e2e/candidate-registration.spec.ts
```

Expected: PASS. If the environment lacks browser binaries or a configured local Supabase/Worker server, record the exact infrastructure limitation; do not claim execution success.

- [ ] **Step 4: Commit Task 4**

```bash
git add tests/e2e/candidate-registration.spec.ts
git commit -m "test: cover candidate registration wizard"
```

---

### Task 5: Documentation Status and Full Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-candidate-registration-wizard-design.md`

**Interfaces:**
- No runtime interface changes.

- [ ] **Step 1: Mark the approved design**

Change:

```md
**Status:** Draft for user review
```

to:

```md
**Status:** Approved for implementation
```

- [ ] **Step 2: Run formatting-neutral type validation**

```bash
pnpm typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run the complete Vitest suite**

```bash
pnpm test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 4: Run the production build**

```bash
pnpm build
```

Expected: exit code 0 and a successful Cloudflare Worker production bundle.

- [ ] **Step 5: Verify the built output and Git diff**

```bash
git status --short
git diff --check
```

Expected: only the intended design-status change remains before commit; `git diff --check` produces no output.

- [ ] **Step 6: Commit documentation and verification state**

```bash
git add docs/superpowers/specs/2026-07-14-candidate-registration-wizard-design.md
git commit -m "docs: approve candidate registration design"
```

- [ ] **Step 7: Package the implementation for GitHub handoff**

Create a Git bundle containing the implementation branch and a Windows PowerShell helper that clones the bundle, adds the GitHub remote, pushes the feature branch, and opens the Pull Request URL. The helper must tolerate a missing pre-existing remote by checking before removal.

- [ ] **Step 8: Verify the handoff package**

Extract the ZIP into a fresh directory, run bundle verification, clone the bundle, check out the feature branch, and run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit 0 before reporting the package as ready.
