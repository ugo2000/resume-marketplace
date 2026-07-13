# Security Model

## Trust boundaries

The browser receives only the Supabase publishable key. The Supabase service-role key, Stripe secret, webhook secrets, email key, Turnstile secret, cron secret, and E2E fixture token are server-only Cloudflare secrets.

The Worker is the privileged application boundary. Supabase Row Level Security remains enabled on every exposed table as defense in depth.

## Authorization

- Visitors can read published, unexpired jobs only.
- Candidates can maintain only their own profile, resume sections, applications, and deletion request.
- Unapproved employers cannot publish jobs, search candidates, buy/use credits, or view applications.
- Approved employers can operate only their own jobs, wallet, applications, searches, and unlocks.
- Candidate contact details and PDF paths are unavailable until a unique permanent unlock exists for that employer, either through a paid lookup or a candidate application.
- Administrative actions require the `admin` role and are written to immutable audit records.

Authorization decisions must use server-controlled database values or authenticated app metadata, never user-editable profile metadata.

## Candidate privacy

Before unlock, employers receive an anonymous alias/initials and structured professional data only. Full name, required email, optional phone, and resume PDF become available only after authorization.

Identity documents and selfies are processed by Stripe Identity and are not stored by this platform. The database stores only status, provider reference, country, and timestamps.

Candidate location is limited to city, state/province, and country. The application must not collect or expose a street address in the MVP.

## Private file storage

`candidate-resumes` and `employer-documents` are private Supabase Storage buckets. Access is through short-lived signed URLs created by the Worker after authorization checks.

Uploads are checked by extension, MIME type, size, and magic bytes. This reduces obvious abuse but does not replace malware scanning. Production launch requires either a malware-scanning control or a documented risk acceptance and compensating controls.

## Payment integrity

- Stripe webhook signatures are verified before processing.
- Provider event IDs are claimed idempotently in `webhook_events`.
- Credit purchase, use, reservation, refund, and adjustment operations use database transactions/RPCs.
- `contact_unlocks` is unique per employer/candidate pair, preventing repeat deductions.
- Candidate applications create their free unlock in the same database transaction.
- Used credits are not refundable. Exceptional refunds require an administrator and an allowed reason.

Never infer payment success from a browser redirect; only verified Stripe events may finalize payments or credits.

## Request protections

- Unsafe authenticated requests require a same-origin `Origin` header.
- Turnstile protects high-abuse onboarding and checkout actions.
- Shared database-backed rate limits apply across Worker instances.
- Security headers include CSP, clickjacking protection, MIME sniffing protection, a restrictive permissions policy, and a strict referrer policy.
- Session cookies are HTTP-only, SameSite=Lax, and Secure on HTTPS origins.

## Test-support route

`POST /test-support/session` exists solely for acceptance testing. It returns 404 unless `E2E_TEST_TOKEN` is configured and the request carries the matching header.

Production must not contain `E2E_TEST_TOKEN`. Launch validation must prove the route returns 404.

## Retention and deletion

- Candidate deletion immediately disables the account.
- A candidate may restore during the 30-day recovery window.
- After the window, profile, contact data, resume sections, and PDF are deleted.
- Necessary payment, anti-fraud, and audit records remain under data-minimization rules.
- Employer proof documents are scheduled for deletion 30 days after review.
- Legal hold pauses relevant document deletion.

## Logging rules

Never log:

- access or refresh tokens;
- service-role or provider secrets;
- complete payment method data;
- identity document images or extracted identity fields;
- resume file contents;
- candidate phone/email in generic request logs.

Use opaque user, payment, event, and audit identifiers when correlating incidents.

## Security verification

Before each release:

```bash
pnpm check
pnpm test:e2e
```

Also run Supabase security/performance advisors, inspect all `SECURITY DEFINER` functions, verify explicit execution grants, confirm storage buckets are private, and confirm anonymous database access cannot enumerate candidates.
