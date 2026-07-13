# Launch Checklist

## Legal and policy

- [ ] Qualified US/Canada legal review is complete.
- [ ] Privacy Policy, Terms, identity-verification consent, refund policy, retention schedule, and deletion language are approved.
- [ ] Employer terms prohibit fraudulent, discriminatory, illegal, or misleading job postings.
- [ ] Candidate search does not expose protected-class filters or data.
- [ ] Geographic marketing and language obligations, including any Quebec launch decision, are reviewed.

## Infrastructure

- [ ] Production uses a dedicated Supabase project and Stripe live mode.
- [ ] All migrations are applied and generated TypeScript types match production.
- [ ] Supabase security advisors contain no unexplained findings.
- [ ] Supabase backup and recovery procedures are documented and tested.
- [ ] Cloudflare custom domain, TLS, observability, and scheduled trigger are verified.
- [ ] Production secrets are stored only in provider/Cloudflare secret stores.
- [ ] Staging and production credentials are distinct.

## Authentication and authorization

- [ ] Anonymous users can read only published, unexpired jobs.
- [ ] Anonymous and candidate accounts cannot search the resume database.
- [ ] Unapproved employers cannot publish, search, unlock, or spend credits.
- [ ] Approved employers cannot access another employer's jobs, applicants, wallet, or unlocks.
- [ ] Public candidate lookup returns no private data.
- [ ] Session cookie settings are correct on the production HTTPS origin.

## Data and files

- [ ] `candidate-resumes` and `employer-documents` buckets are private.
- [ ] Signed resume URLs are short-lived and require a valid unlock/application.
- [ ] Employer document deletion runs 30 days after review and honors legal hold.
- [ ] Candidate deletion disables immediately, restores within 30 days, and wipes eligible data afterward.
- [ ] Malware scanning is enabled, or a documented launch risk decision and compensating controls are approved.

## Payments and identity

- [ ] Live prices are exactly USD $2.49, $30.00, and $75.00.
- [ ] Checkout and Identity webhook signatures are verified with separate live secrets.
- [ ] Duplicate webhook delivery does not duplicate payments, credits, unlocks, or refunds.
- [ ] Repeated viewing of an unlocked candidate does not deduct another credit.
- [ ] Candidate applications grant a free permanent unlock.
- [ ] Stripe Identity test and live workflows have been completed successfully.
- [ ] Platform logs and storage contain no identity document or selfie data.

## Abuse prevention and operations

- [ ] Turnstile works on protected forms using production keys.
- [ ] Shared rate limiting is active across Worker instances.
- [ ] CSRF/same-origin enforcement is verified for unsafe authenticated requests.
- [ ] Security headers are present on public and authenticated responses.
- [ ] Transactional email sender/domain is verified.
- [ ] Incident contacts and escalation steps are assigned.
- [ ] Daily cleanup job has completed successfully in staging.
- [ ] Audit logs cannot be updated or deleted by application roles.

## Acceptance and release

- [ ] `pnpm check` passes from a clean checkout.
- [ ] All three Playwright acceptance tests pass against staging.
- [ ] Stripe test webhooks show successful delivery.
- [ ] Health endpoint returns HTTP 200 after deployment.
- [ ] `E2E_TEST_TOKEN` is absent from production.
- [ ] `/test-support/session` returns HTTP 404 in production.
- [ ] A rollback owner and rollback procedure are documented before production deploy.
