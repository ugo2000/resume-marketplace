# Operations Runbook

## Environments

| Environment | Database | Payments | Worker | Test fixture route |
|---|---|---|---|---|
| Local | Supabase CLI stack | Stripe test mode / CLI | `pnpm dev` | Enabled only when `E2E_TEST_TOKEN` is set |
| Staging | Dedicated Supabase project | Stripe test mode | `resume-marketplace-staging` | Enabled with a staging-only token |
| Production | Dedicated Supabase project | Stripe live mode | `resume-marketplace` | Must be disabled; do not configure `E2E_TEST_TOKEN` |

Never use production customer data in local or staging environments.

## Runtime requirements

- Node.js 22 or newer.
- pnpm 10.15.1 through Corepack or a package-manager installation.
- Supabase CLI for migrations and generated database types.
- Wrangler for Cloudflare Worker deployment.
- Playwright Chromium for browser acceptance tests.
- Docker only when running the complete Supabase stack locally.

Install dependencies:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

## Configuration

Copy the example only for local development:

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` is local and must never be committed. Cloudflare staging and production values belong in Worker variables and secrets.

### Non-secret variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `STRIPE_IDENTITY_PRICE_ID`
- `STRIPE_CREDITS_10_PRICE_ID`
- `STRIPE_CREDITS_25_PRICE_ID`
- `APP_ORIGIN`
- `EMAIL_API_URL`
- `EMAIL_FROM`
- `TURNSTILE_SITE_KEY`

### Secrets

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_IDENTITY_WEBHOOK_SECRET`
- `EMAIL_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `CRON_SECRET`
- `E2E_TEST_TOKEN` — staging only

Add each secret without placing its value in shell history:

```bash
pnpm wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
pnpm wrangler secret put STRIPE_SECRET_KEY --env staging
```

Repeat for every staging secret. Omit `--env staging` for production.

## Database deployment

Apply migrations before deploying application code that depends on them:

```bash
export SUPABASE_PROJECT_REF='your-project-ref'
pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF"
pnpm exec supabase db push
pnpm exec supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > src/types/database.ts
pnpm check
```

Review generated type changes before committing. Never edit an already-applied migration; add a new migration instead.

## Stripe setup

Create exactly three one-time USD prices:

- Candidate identity verification: 249 cents.
- Employer 10-credit pack: 3000 cents.
- Employer 25-credit pack: 7500 cents.

Configure the payment webhook at `/webhooks/stripe` for checkout completion and refunds. Configure the Identity webhook at `/webhooks/stripe-identity` for verified and requires-input events. Store each endpoint's independent signing secret.

Before live mode, repeat the setup with live products, live prices, live webhook endpoints, and live signing secrets. Test-mode identifiers must never be reused in production.

## Staging deployment

```bash
pnpm check
pnpm deploy:staging
```

After Wrangler returns the staging URL:

```bash
E2E_BASE_URL='https://resume-marketplace-staging.example.workers.dev' \
E2E_TEST_TOKEN='staging-token-from-secret-store' \
pnpm test:e2e
```

The three acceptance journeys must pass before production deployment.

## Production deployment

Before deploying, complete every item in `docs/launch-checklist.md`, verify that `E2E_TEST_TOKEN` is absent, and run:

```bash
pnpm check
pnpm deploy
```

Immediately verify:

```bash
curl -fsS https://your-production-host/health
curl -i -X POST https://your-production-host/test-support/session
```

The health endpoint must return HTTP 200. The test-support endpoint must return HTTP 404.

## Scheduled cleanup

Cloudflare invokes the Worker daily at `03:15 UTC`. The scheduled handler:

- expires jobs whose 30-day window ended;
- deletes reviewed employer documents after 30 days unless `legal_hold` is true;
- permanently deletes candidate resume/profile/contact data after the 30-day recovery window;
- removes expired shared rate-limit buckets.

Review Worker scheduled-event logs after every schema or cleanup change.

## Monitoring

Cloudflare observability is enabled in `wrangler.jsonc`. Monitor:

- elevated 5xx responses;
- Stripe webhook signature failures or repeated retries;
- failed Identity session creation;
- wallet or unlock transaction errors;
- scheduled cleanup failures;
- email delivery failures;
- unusual rate-limit denials.

Supabase logs should be reviewed for database errors, authentication failures, and slow queries. Stripe Dashboard is the source of truth for payment and webhook delivery status.

## Incident response

1. Preserve relevant Cloudflare, Supabase, and Stripe event identifiers.
2. Suspend affected accounts rather than deleting evidence.
3. Apply legal hold to employer proof documents when required.
4. Rotate any exposed secret immediately in its provider and Cloudflare.
5. Replay idempotent Stripe webhooks only after the root cause is understood.
6. Record administrative actions in `audit_logs`.
7. Notify legal/privacy contacts when the incident may involve personal information.

## Backup and recovery

- Confirm Supabase backup coverage before launch and after plan changes.
- Keep migrations and generated types in Git.
- Test restoration to a non-production project before relying on a backup procedure.
- Do not restore production data into staging without a documented redaction process.
