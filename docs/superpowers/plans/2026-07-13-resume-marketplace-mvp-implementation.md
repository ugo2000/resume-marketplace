# Resume Marketplace MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and remotely deploy an English-language recruitment marketplace for the United States and Canada where verified candidates publish private resumes, approved employers post jobs for free, and employers buy permanent candidate-contact unlocks.

**Architecture:** A single Cloudflare Worker serves server-rendered Hono JSX pages and trusted API routes. Supabase provides authentication, PostgreSQL, Row-Level Security, private storage, and scheduled data cleanup support; Stripe Checkout and Stripe Identity handle payments and identity verification. Sensitive authorization and credit operations are enforced in PostgreSQL functions and server-only Worker code rather than in the browser.

**Tech Stack:** TypeScript, Hono JSX, Cloudflare Workers, Vite, Supabase Auth/PostgreSQL/Storage, Stripe Checkout/Identity/Webhooks, Zod, Vitest with Cloudflare Workers pool, Playwright, pnpm.

## Global Constraints

- Target markets: United States and Canada.
- Language: English only.
- Currency: USD only.
- Candidate identity verification fee: $2.49 USD, one time.
- Employer credit packs: $30 USD for 10 credits and $75 USD for 25 credits.
- One paid unlock costs one credit and is permanent for the employer-candidate pair.
- Candidate applications create a free permanent unlock for the receiving employer.
- Candidate profiles are never public and are searchable only by approved employers.
- Government ID and selfie images are never stored by the platform.
- Employer proof files are deleted 30 days after a review decision unless a hold applies.
- Candidate deletion disables access immediately, allows 30 days for restoration, then removes profile data and private files.
- An approved employer may have at most 10 active jobs; jobs expire after 30 days and may be renewed free.
- MVP has one employer administrator per company, no team seats, no chat, no subscriptions, no CAD pricing, and no French localization.
- Use pnpm and commit `pnpm-lock.yaml`; use TypeScript strict mode and no `any` in application code.
- Never expose the Supabase service-role key, Stripe secret key, or webhook secrets to browser code.
- Public launch remains blocked until legal review of privacy, identity-consent, employment, refund, retention, and Canadian/US state privacy obligations is documented.

---

## Planned File Structure

```text
resume-marketplace/
├── package.json                         # scripts and dependencies
├── pnpm-lock.yaml                       # reproducible dependency graph
├── tsconfig.json                        # strict TypeScript settings
├── vite.config.ts                       # Cloudflare Worker build
├── vitest.config.ts                     # Worker-unit/integration tests
├── playwright.config.ts                 # browser tests
├── wrangler.jsonc                       # Worker entry, assets, cron triggers
├── .dev.vars.example                    # non-secret environment key names
├── public/
│   └── styles.css                       # minimal responsive UI
├── src/
│   ├── index.tsx                        # Hono application and route registration
│   ├── env.ts                           # typed Worker bindings
│   ├── types/
│   │   ├── app.ts                       # roles, request context, shared DTOs
│   │   └── database.ts                  # generated Supabase types
│   ├── middleware/
│   │   ├── auth.ts                      # Supabase session loading
│   │   ├── role.ts                      # candidate/employer/admin guards
│   │   ├── csrf.ts                      # origin and form-token checks
│   │   └── rate-limit.ts                # per-IP and per-user limits
│   ├── lib/
│   │   ├── supabase.ts                  # user and service clients
│   │   ├── stripe.ts                    # Stripe client and price mapping
│   │   ├── validation.ts                # Zod schemas
│   │   ├── audit.ts                     # audit log helper
│   │   ├── signed-files.ts              # short-lived private-file URLs
│   │   ├── email.ts                     # transactional email adapter
│   │   └── responses.ts                 # consistent errors and redirects
│   ├── components/
│   │   ├── layout.tsx                   # shared HTML shell
│   │   ├── forms.tsx                    # accessible form controls
│   │   ├── nav.tsx                      # role-aware navigation
│   │   └── pagination.tsx               # shared paging controls
│   ├── routes/
│   │   ├── public.tsx                   # home, pricing, jobs, legal pages
│   │   ├── auth.tsx                     # register, login, callback, logout
│   │   ├── candidate.tsx                # verification, resume, applications, settings
│   │   ├── employer.tsx                 # review, jobs, applicants, search, credits
│   │   ├── admin.tsx                    # employer review, moderation, finance, audit
│   │   ├── webhooks.ts                  # Stripe Checkout and Identity webhooks
│   └── services/
│       ├── auth-service.ts              # profile bootstrap and eligibility
│       ├── candidate-service.ts         # resume CRUD and anonymized DTOs
│       ├── employer-service.ts          # review submission and decisions
│       ├── job-service.ts               # publish, expire, renew, search
│       ├── application-service.ts       # apply and free unlock
│       ├── credit-service.ts            # checkout and ledger views
│       ├── unlock-service.ts            # permanent contact access
│       ├── payment-service.ts           # idempotent webhook processing/refunds
│       └── cleanup-service.ts           # document and account deletion
├── supabase/
│   ├── config.toml                      # local Supabase configuration
│   ├── seed.sql                         # deterministic test users/data
│   └── migrations/
│       ├── 0001_core_schema.sql          # enums and core tables
│       ├── 0002_rls_and_storage.sql      # RLS, policies, private buckets
│       ├── 0003_business_functions.sql   # atomic unlock, job limit, search RPCs
│       ├── 0004_cleanup_jobs.sql         # deletion and retention functions
│       └── 0005_rate_limits.sql          # shared fixed-window counters
├── tests/
│   ├── unit/                            # pure service and validation tests
│   ├── integration/                     # local Supabase and webhook tests
│   ├── e2e/                             # browser journeys
│   └── fixtures/                        # PDFs and signed webhook payloads
└── docs/
    ├── operations.md                    # remote environments and runbooks
    ├── security.md                      # threat controls and secret handling
    └── launch-checklist.md              # legal, compliance, payment, and DNS gates
```

---

### Task 1: Bootstrap the Cloudflare Worker application and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `wrangler.jsonc`
- Create: `.dev.vars.example`
- Create: `src/env.ts`
- Create: `src/index.tsx`
- Create: `tests/unit/health.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `Bindings`, the exported Hono `app`, `GET /health`, and the package scripts used by every later task.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "resume-marketplace",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:reset": "supabase db reset",
    "supabase:types": "supabase gen types typescript --local > src/types/database.ts",
    "check": "pnpm typecheck && pnpm test && pnpm build"
  },
  "dependencies": {
    "@hono/zod-validator": "latest",
    "@supabase/ssr": "latest",
    "@supabase/supabase-js": "latest",
    "hono": "latest",
    "stripe": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "latest",
    "@cloudflare/vitest-pool-workers": "latest",
    "@cloudflare/workers-types": "latest",
    "@playwright/test": "latest",
    "supabase": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest",
    "wrangler": "latest"
  },
  "packageManager": "pnpm@10"
}
```

- [ ] **Step 2: Install dependencies and commit the resolved lockfile**

Run: `pnpm install`

Expected: `pnpm-lock.yaml` is created and installation exits with status 0.

- [ ] **Step 3: Write the failing health-route test**

```ts
// tests/unit/health.test.ts
import { describe, expect, it } from 'vitest';
import app from '../../src/index';

describe('GET /health', () => {
  it('returns an explicit healthy response', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: 'resume-marketplace' });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/health.test.ts`

Expected: FAIL because `src/index.tsx` does not exist.

- [ ] **Step 5: Add strict TypeScript, Vite, Worker bindings, and the minimal app**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

```ts
// vite.config.ts
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [cloudflare()] });
```

```ts
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "resume-marketplace",
  "main": "src/index.tsx",
  "compatibility_date": "2026-07-13",
  "assets": { "directory": "./public" },
  "triggers": { "crons": ["15 3 * * *"] }
}
```

```dotenv
# .dev.vars.example
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_IDENTITY_WEBHOOK_SECRET=
STRIPE_IDENTITY_PRICE_ID=
STRIPE_CREDITS_10_PRICE_ID=
STRIPE_CREDITS_25_PRICE_ID=
APP_ORIGIN=http://localhost:5173
EMAIL_API_URL=
EMAIL_API_KEY=
EMAIL_FROM=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
CRON_SECRET=
E2E_TEST_TOKEN=
```

```ts
// src/env.ts
export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_IDENTITY_WEBHOOK_SECRET: string;
  STRIPE_IDENTITY_PRICE_ID: string;
  STRIPE_CREDITS_10_PRICE_ID: string;
  STRIPE_CREDITS_25_PRICE_ID: string;
  APP_ORIGIN: string;
  EMAIL_API_URL: string;
  EMAIL_API_KEY: string;
  EMAIL_FROM: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  CRON_SECRET: string;
  E2E_TEST_TOKEN?: string;
};
```

```tsx
// src/index.tsx
import { Hono } from 'hono';
import type { Bindings } from './env';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) => c.json({ ok: true, service: 'resume-marketplace' }));

export default app;
```

- [ ] **Step 6: Verify the scaffold**

Run: `pnpm check`

Expected: typecheck, unit test, and production build all pass.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts vitest.config.ts wrangler.jsonc .dev.vars.example src/env.ts src/index.tsx tests/unit/health.test.ts
git commit -m "chore: bootstrap Cloudflare Worker app"
```

---

### Task 2: Create the Supabase schema, private storage, and baseline RLS

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/0001_core_schema.sql`
- Create: `supabase/migrations/0002_rls_and_storage.sql`
- Create: `supabase/seed.sql`
- Create: `src/types/database.ts`
- Create: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: Supabase CLI scripts from Task 1.
- Produces: all database tables, enums, constraints, indexes, private storage buckets, and generated `Database` types used by services.

- [ ] **Step 1: Initialize local Supabase files**

Run: `pnpm exec supabase init`

Expected: `supabase/config.toml` exists.

- [ ] **Step 2: Write a failing schema contract test**

```ts
// tests/integration/schema.test.ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY ?? '';

describe('database schema', () => {
  it('creates one credit wallet per employer', async () => {
    const client = createClient(url, serviceKey);
    const { error } = await client.from('credit_wallets').select('employer_id').limit(1);
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 3: Start Supabase and verify the contract fails**

Run: `pnpm supabase:start && pnpm vitest run tests/integration/schema.test.ts`

Expected: FAIL because `credit_wallets` does not exist.

- [ ] **Step 4: Create the core schema migration**

```sql
-- supabase/migrations/0001_core_schema.sql
create extension if not exists pgcrypto;

create type public.user_role as enum ('candidate', 'employer', 'admin');
create type public.user_status as enum ('active', 'disabled', 'suspended');
create type public.country_code as enum ('US', 'CA');
create type public.identity_status as enum ('not_started', 'payment_pending', 'requires_input', 'processing', 'verified', 'failed');
create type public.employer_review_status as enum ('draft', 'pending', 'approved', 'rejected', 'suspended');
create type public.job_status as enum ('draft', 'published', 'closed', 'expired', 'removed');
create type public.unlock_source as enum ('paid_search', 'application');
create type public.credit_transaction_type as enum ('purchase', 'unlock', 'refund', 'adjustment');
create type public.payment_purpose as enum ('identity_fee', 'credit_pack_10', 'credit_pack_25');
create type public.payment_status as enum ('pending', 'paid', 'refunded', 'failed');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.user_role not null,
  status public.user_status not null default 'active',
  country public.country_code,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidate_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  full_name text not null,
  city text not null,
  state_province text not null,
  country public.country_code not null,
  phone text,
  headline text not null,
  summary text not null default '',
  years_experience integer not null default 0 check (years_experience between 0 and 80),
  work_authorization text not null,
  searchable boolean not null default false,
  identity_status public.identity_status not null default 'not_started',
  identity_reference_id text unique,
  identity_verified_at timestamptz,
  date_of_birth_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  skill_name text not null,
  years_experience integer not null default 0 check (years_experience between 0 and 80),
  unique (candidate_id, skill_name)
);

create table public.candidate_experience (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  company text not null,
  job_title text not null,
  start_date date not null,
  end_date date,
  description text not null default '',
  check (end_date is null or end_date >= start_date)
);

create table public.candidate_education (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  school text not null,
  qualification text not null,
  field text not null default '',
  graduation_year integer check (graduation_year between 1900 and 2200)
);

create table public.resume_files (
  candidate_id uuid primary key references public.candidate_profiles(user_id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  uploaded_at timestamptz not null default now()
);

create table public.employer_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  company_name text not null,
  website text not null,
  company_email text not null,
  registration_number text not null,
  country public.country_code not null,
  review_status public.employer_review_status not null default 'draft',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, registration_number)
);

create table public.employer_documents (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(user_id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  document_type text not null,
  file_sha256 text not null,
  uploaded_at timestamptz not null default now(),
  delete_after timestamptz,
  legal_hold boolean not null default false
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(user_id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text not null,
  city text not null,
  state_province text not null,
  country public.country_code not null,
  employment_type text not null,
  workplace_type text not null,
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  status public.job_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_max >= salary_min)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  cover_note text,
  status text not null default 'submitted',
  applied_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create table public.credit_wallets (
  employer_id uuid primary key references public.employer_profiles(user_id) on delete cascade,
  available_credits integer not null default 0 check (available_credits >= 0),
  purchased_credits integer not null default 0 check (purchased_credits >= 0),
  used_credits integer not null default 0 check (used_credits >= 0),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  purpose public.payment_purpose not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(user_id),
  type public.credit_transaction_type not null,
  quantity integer not null,
  payment_id uuid references public.payments(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.contact_unlocks (
  employer_id uuid not null references public.employer_profiles(user_id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles(user_id) on delete cascade,
  source public.unlock_source not null,
  credit_transaction_id uuid references public.credit_transactions(id),
  unlocked_at timestamptz not null default now(),
  primary key (employer_id, candidate_id)
);

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.candidate_profiles(user_id) on delete cascade,
  payment_id uuid not null references public.payments(id),
  provider_reference_id text unique,
  status public.identity_status not null default 'payment_pending',
  country public.country_code not null,
  started_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.users(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references public.users(id),
  target_type text not null,
  target_id text not null,
  reason text not null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.account_deletion_requests (
  user_id uuid primary key references public.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  restore_until timestamptz not null,
  completed_at timestamptz
);

create index jobs_public_search_idx on public.jobs (status, country, state_province, city, employment_type, workplace_type, expires_at);
create index candidate_search_idx on public.candidate_profiles (country, state_province, city, years_experience, searchable);
create index candidate_skills_search_idx on public.candidate_skills using gin (to_tsvector('english', skill_name));
create index applications_employer_idx on public.applications (job_id, applied_at desc);
create index applications_candidate_idx on public.applications (candidate_id, applied_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id, created_at desc);
```

- [ ] **Step 5: Enable RLS and create private storage policies**

```sql
-- supabase/migrations/0002_rls_and_storage.sql
alter table public.users enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.candidate_skills enable row level security;
alter table public.candidate_experience enable row level security;
alter table public.candidate_education enable row level security;
alter table public.resume_files enable row level security;
alter table public.employer_profiles enable row level security;
alter table public.employer_documents enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.contact_unlocks enable row level security;
alter table public.payments enable row level security;
alter table public.identity_verifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.reports enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy users_read_self on public.users for select using (id = auth.uid());
create policy candidate_profile_self_read on public.candidate_profiles for select using (user_id = auth.uid());
create policy candidate_skills_self on public.candidate_skills for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy candidate_experience_self on public.candidate_experience for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy candidate_education_self on public.candidate_education for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy resume_files_self_read on public.resume_files for select using (candidate_id = auth.uid());
create policy employer_profile_self on public.employer_profiles for select using (user_id = auth.uid());
create policy employer_documents_self on public.employer_documents for select using (employer_id = auth.uid());
create policy jobs_public_read on public.jobs for select using (status = 'published' and expires_at > now());
create policy jobs_owner_read on public.jobs for select using (employer_id = auth.uid());
create policy applications_candidate_read on public.applications for select using (candidate_id = auth.uid());
create policy wallet_owner_read on public.credit_wallets for select using (employer_id = auth.uid());
create policy transactions_owner_read on public.credit_transactions for select using (employer_id = auth.uid());
create policy unlocks_owner_read on public.contact_unlocks for select using (employer_id = auth.uid());
create policy payments_owner_read on public.payments for select using (user_id = auth.uid());
create policy identity_owner_read on public.identity_verifications for select using (candidate_id = auth.uid());
create policy deletion_owner_all on public.account_deletion_requests for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resume-pdfs', 'resume-pdfs', false, 5242880, array['application/pdf']),
  ('employer-documents', 'employer-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- No authenticated storage write policy is created. All uploads and deletions pass through validated server-only routes using the service role.
```

- [ ] **Step 6: Reset the database, generate types, and run the contract**

Run: `pnpm supabase:reset && pnpm supabase:types && pnpm vitest run tests/integration/schema.test.ts`

Expected: migration succeeds, `src/types/database.ts` is generated, and the test passes.

- [ ] **Step 7: Commit**

```bash
git add supabase src/types/database.ts tests/integration/schema.test.ts
git commit -m "feat: add recruitment marketplace schema and RLS"
```

---

### Task 3: Add server-side Supabase clients, sessions, roles, and route guards

**Files:**
- Create: `src/types/app.ts`
- Create: `src/lib/supabase.ts`
- Create: `src/middleware/auth.ts`
- Create: `src/middleware/role.ts`
- Create: `src/routes/auth.tsx`
- Modify: `src/index.tsx`
- Create: `tests/unit/role.test.ts`

**Interfaces:**
- Consumes: `Bindings`, generated `Database` types, `users.role`, `users.status`.
- Produces: `AppVariables`, `getUserClient(c)`, `getServiceClient(c)`, `authMiddleware`, `requireRole(roles)`, and auth routes.

- [ ] **Step 1: Write failing role-guard tests**

```ts
// tests/unit/role.test.ts
import { describe, expect, it } from 'vitest';
import { authorizeRole } from '../../src/middleware/role';

describe('authorizeRole', () => {
  it('rejects unauthenticated users', () => {
    expect(authorizeRole(null, ['candidate'])).toEqual({ allowed: false, status: 401 });
  });

  it('rejects suspended users', () => {
    expect(authorizeRole({ role: 'employer', status: 'suspended' }, ['employer'])).toEqual({ allowed: false, status: 403 });
  });

  it('allows an active matching role', () => {
    expect(authorizeRole({ role: 'admin', status: 'active' }, ['admin'])).toEqual({ allowed: true, status: 200 });
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm vitest run tests/unit/role.test.ts`

Expected: FAIL because the role module does not exist.

- [ ] **Step 3: Implement typed request context and clients**

```ts
// src/types/app.ts
import type { Database } from './database';

export type AppRole = Database['public']['Enums']['user_role'];
export type AppStatus = Database['public']['Enums']['user_status'];

export type SessionUser = {
  id: string;
  email: string;
  role: AppRole;
  status: AppStatus;
};

export type AppVariables = {
  sessionUser: SessionUser | null;
  accessToken: string | null;
};
```

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import type { Bindings } from '../env';
import type { AppVariables } from '../types/app';
import type { Database } from '../types/database';

export type AppContext = Context<{ Bindings: Bindings; Variables: AppVariables }>;

export const getUserClient = (c: AppContext) => createClient<Database>(
  c.env.SUPABASE_URL,
  c.env.SUPABASE_ANON_KEY,
  { global: { headers: c.get('accessToken') ? { Authorization: `Bearer ${c.get('accessToken')}` } : {} } },
);

export const getServiceClient = (c: AppContext) => createClient<Database>(
  c.env.SUPABASE_URL,
  c.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
```

- [ ] **Step 4: Implement authentication middleware and role guards**

```ts
// src/middleware/role.ts
import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../env';
import type { AppRole, AppStatus, AppVariables } from '../types/app';

export const authorizeRole = (
  user: { role: AppRole; status: AppStatus } | null,
  allowedRoles: AppRole[],
): { allowed: boolean; status: 200 | 401 | 403 } => {
  if (!user) return { allowed: false, status: 401 };
  if (user.status !== 'active') return { allowed: false, status: 403 };
  return allowedRoles.includes(user.role)
    ? { allowed: true, status: 200 }
    : { allowed: false, status: 403 };
};

export const requireRole = (allowedRoles: AppRole[]): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: AppVariables;
}> => async (c, next) => {
  const decision = authorizeRole(c.get('sessionUser'), allowedRoles);
  if (!decision.allowed) return c.json({ error: decision.status === 401 ? 'authentication_required' : 'forbidden' }, decision.status);
  await next();
};
```

```ts
// src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { getCookie, setCookie } from 'hono/cookie';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import type { AppVariables } from '../types/app';

export const authMiddleware: MiddlewareHandler<{ Bindings: Bindings; Variables: AppVariables }> = async (c, next) => {
  let token = getCookie(c, 'sb-access-token') ?? null;
  const refreshToken = getCookie(c, 'sb-refresh-token') ?? null;
  c.set('sessionUser', null);

  const service = getServiceClient(c);
  let authUser = token ? (await service.auth.getUser(token)).data.user : null;
  if (!authUser && refreshToken) {
    const anon = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
    const { data } = await anon.auth.refreshSession({ refresh_token: refreshToken });
    if (data.session) {
      token = data.session.access_token;
      authUser = data.user;
      const secure = new URL(c.env.APP_ORIGIN).protocol === 'https:';
      setCookie(c, 'sb-access-token', data.session.access_token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 3600 });
      setCookie(c, 'sb-refresh-token', data.session.refresh_token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 2592000 });
    }
  }
  c.set('accessToken', token);
  if (authUser) {
    const { data: profile } = await service.from('users').select('id,email,role,status').eq('id', authUser.id).single();
    if (profile) c.set('sessionUser', profile);
  }
  await next();
};
```

- [ ] **Step 5: Add register/login/callback/logout routes**

```tsx
// src/routes/auth.tsx
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Bindings } from '../env';
import { getServiceClient, getUserClient } from '../lib/supabase';
import type { AppVariables } from '../types/app';

const credentials = z.object({ email: z.string().email(), password: z.string().min(12) });
const roleSchema = z.enum(['candidate', 'employer']);

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

authRoutes.post('/register/:role', async (c) => {
  const role = roleSchema.parse(c.req.param('role'));
  const input = credentials.parse(await c.req.parseBody());
  const client = getUserClient(c);
  const { data, error } = await client.auth.signUp({ email: input.email, password: input.password, options: { data: { role }, emailRedirectTo: `${c.env.APP_ORIGIN}/auth/callback` } });
  if (error || !data.user) return c.json({ error: 'registration_failed' }, 400);
  const service = getServiceClient(c);
  await service.from('users').insert({ id: data.user.id, email: input.email, role, status: 'active' });
  return c.json({ ok: true, verificationEmailSent: !data.session }, 201);
});

authRoutes.post('/login', async (c) => {
  const input = credentials.parse(await c.req.parseBody());
  const client = getUserClient(c);
  const { data, error } = await client.auth.signInWithPassword(input);
  if (error || !data.session) return c.json({ error: 'invalid_credentials' }, 401);
  const secure = new URL(c.env.APP_ORIGIN).protocol === 'https:';
  setCookie(c, 'sb-access-token', data.session.access_token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 3600 });
  setCookie(c, 'sb-refresh-token', data.session.refresh_token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 2592000 });
  return c.json({ ok: true });
});

authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'verification_code_missing' }, 400);
  const client = getUserClient(c);
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session) return c.json({ error: 'email_verification_failed' }, 400);
  const secure = new URL(c.env.APP_ORIGIN).protocol === 'https:';
  setCookie(c, 'sb-access-token', data.session.access_token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 3600 });
  setCookie(c, 'sb-refresh-token', data.session.refresh_token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 2592000 });
  const service = getServiceClient(c);
  const { data: profile } = await service.from('users').select('role').eq('id', data.user.id).single();
  return c.redirect(profile?.role === 'employer' ? '/employer/onboarding' : '/candidate/onboarding');
});

authRoutes.post('/logout', async (c) => {
  deleteCookie(c, 'sb-access-token', { path: '/' });
  deleteCookie(c, 'sb-refresh-token', { path: '/' });
  return c.json({ ok: true });
});
```

- [ ] **Step 6: Register middleware and routes**

```tsx
// src/index.tsx
import { Hono } from 'hono';
import type { Bindings } from './env';
import { authMiddleware } from './middleware/auth';
import { authRoutes } from './routes/auth';
import type { AppVariables } from './types/app';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
app.use('*', authMiddleware);
app.get('/health', (c) => c.json({ ok: true, service: 'resume-marketplace' }));
app.route('/auth', authRoutes);

export default app;
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm typecheck && pnpm vitest run tests/unit/role.test.ts tests/unit/health.test.ts`

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src tests/unit/role.test.ts
git commit -m "feat: add authentication and role guards"
```

---

### Task 4: Build public pages and public job search

**Files:**
- Create: `src/components/layout.tsx`
- Create: `src/components/forms.tsx`
- Create: `src/components/pagination.tsx`
- Create: `src/lib/validation.ts`
- Create: `src/services/job-service.ts`
- Create: `src/routes/public.tsx`
- Create: `public/styles.css`
- Modify: `src/index.tsx`
- Create: `tests/unit/job-search.test.ts`

**Interfaces:**
- Consumes: public `jobs` RLS policy.
- Produces: `JobSearchInput`, `searchPublicJobs`, `/`, `/jobs`, `/jobs/:slug`, `/pricing`, and static policy routes.

- [ ] **Step 1: Write failing job-search parsing tests**

```ts
// tests/unit/job-search.test.ts
import { describe, expect, it } from 'vitest';
import { parseJobSearch } from '../../src/services/job-service';

describe('parseJobSearch', () => {
  it('normalizes supported filters and clamps paging', () => {
    expect(parseJobSearch({ country: 'US', page: '0', q: ' nurse ' })).toEqual({
      country: 'US', q: 'nurse', page: 1, pageSize: 20,
    });
  });

  it('rejects unsupported countries', () => {
    expect(() => parseJobSearch({ country: 'GB' })).toThrow();
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run tests/unit/job-search.test.ts`

Expected: FAIL because `parseJobSearch` does not exist.

- [ ] **Step 3: Implement parsing and Supabase query construction**

```ts
// src/services/job-service.ts
import { z } from 'zod';
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  country: z.enum(['US', 'CA']).optional(),
  stateProvince: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  employmentType: z.string().trim().max(50).optional(),
  workplaceType: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type JobSearchInput = z.infer<typeof searchSchema>;
export const parseJobSearch = (input: Record<string, unknown>): JobSearchInput => searchSchema.parse(input);

export const searchPublicJobs = async (c: AppContext, input: JobSearchInput) => {
  const client = getServiceClient(c);
  const from = (input.page - 1) * input.pageSize;
  let query = client.from('jobs').select('id,slug,title,city,state_province,country,employment_type,workplace_type,published_at,expires_at', { count: 'exact' })
    .eq('status', 'published').gt('expires_at', new Date().toISOString()).order('published_at', { ascending: false })
    .range(from, from + input.pageSize - 1);
  if (input.country) query = query.eq('country', input.country);
  if (input.stateProvince) query = query.ilike('state_province', input.stateProvince);
  if (input.city) query = query.ilike('city', input.city);
  if (input.employmentType) query = query.eq('employment_type', input.employmentType);
  if (input.workplaceType) query = query.eq('workplace_type', input.workplaceType);
  if (input.q) query = query.or(`title.ilike.%${input.q}%,description.ilike.%${input.q}%`);
  return query;
};
```

- [ ] **Step 4: Create the shared layout and public routes**

```tsx
// src/components/layout.tsx
import type { Child } from 'hono/jsx';

export const Layout = ({ title, children }: { title: string; children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <header><a href="/">OpenResume Jobs</a><nav><a href="/jobs">Jobs</a><a href="/pricing">Pricing</a><a href="/login">Sign in</a></nav></header>
      <main>{children}</main>
      <footer><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/identity-verification">Identity verification</a></footer>
    </body>
  </html>
);
```

```tsx
// src/routes/public.tsx
import { Hono } from 'hono';
import { Layout } from '../components/layout';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import { parseJobSearch, searchPublicJobs } from '../services/job-service';
import type { AppVariables } from '../types/app';

export const publicRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

publicRoutes.get('/', (c) => c.html(<Layout title="OpenResume Jobs"><h1>Find work without putting your resume on the public web.</h1><a class="button" href="/jobs">Search jobs</a></Layout>));

publicRoutes.get('/login', (c) => c.html(<Layout title="Sign in"><form method="post" action="/auth/login"><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" minlength={12} required /></label><button>Sign in</button></form></Layout>));
publicRoutes.get('/register/candidate', (c) => c.html(<Layout title="Create candidate account"><form method="post" action="/auth/register/candidate"><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" minlength={12} required /></label><button>Create candidate account</button></form></Layout>));
publicRoutes.get('/register/employer', (c) => c.html(<Layout title="Create employer account"><form method="post" action="/auth/register/employer"><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" minlength={12} required /></label><button>Create employer account</button></form></Layout>));

publicRoutes.get('/jobs', async (c) => {
  const input = parseJobSearch(c.req.query());
  const { data, count, error } = await searchPublicJobs(c, input);
  if (error) return c.text('Unable to load jobs', 500);
  return c.html(<Layout title="Jobs"><h1>Jobs</h1><p>{count ?? 0} open roles</p><ul>{(data ?? []).map((job) => <li><a href={`/jobs/${job.slug}`}>{job.title}</a> — {job.city}, {job.state_province}</li>)}</ul></Layout>);
});

publicRoutes.get('/jobs/:slug', async (c) => {
  const service = getServiceClient(c);
  const { data } = await service.from('jobs').select('id,title,description,city,state_province,country,employment_type,workplace_type,salary_min,salary_max,expires_at').eq('slug', c.req.param('slug')).eq('status', 'published').gt('expires_at', new Date().toISOString()).single();
  if (!data) return c.notFound();
  return c.html(<Layout title={data.title}><article><h1>{data.title}</h1><p>{data.city}, {data.state_province}, {data.country}</p><p>{data.description}</p><form method="post" action={`/candidate/apply/${data.id}`}><button>Apply</button></form></article></Layout>);
});

publicRoutes.get('/pricing', (c) => c.html(<Layout title="Pricing"><h1>Employer lookup credits</h1><p>$30 for 10 permanent contact unlocks.</p><p>$75 for 25 permanent contact unlocks.</p></Layout>));
publicRoutes.get('/privacy', (c) => c.html(<Layout title="Privacy"><h1>Privacy</h1><p>Candidate profiles are private and available only to approved employers. Government ID and selfie images are processed by the identity provider and are not stored by this platform.</p></Layout>));
publicRoutes.get('/terms', (c) => c.html(<Layout title="Terms"><h1>Terms</h1><p>Employers must post lawful, genuine employment opportunities. Final public terms require qualified US and Canadian legal review before launch.</p></Layout>));
publicRoutes.get('/identity-verification', (c) => c.html(<Layout title="Identity verification"><h1>Identity verification</h1><p>Candidates pay $2.49 USD once and complete third-party identity verification before publishing a resume or applying.</p></Layout>));
```

- [ ] **Step 5: Add minimal responsive CSS and register routes**

```css
/* public/styles.css */
:root { font-family: system-ui, sans-serif; color: #172033; background: #f7f8fb; }
body { margin: 0; }
header, footer, main { max-width: 72rem; margin: auto; padding: 1rem; }
header { display: flex; justify-content: space-between; align-items: center; }
nav, footer { display: flex; gap: 1rem; }
a { color: #174ea6; }
.button, button { display: inline-block; padding: .7rem 1rem; border: 0; border-radius: .4rem; background: #174ea6; color: white; text-decoration: none; }
li { margin: .8rem 0; }
@media (max-width: 640px) { header { align-items: flex-start; flex-direction: column; gap: .75rem; } }
```

```tsx
// src/index.tsx additions
import { publicRoutes } from './routes/public';
app.route('/', publicRoutes);
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm typecheck && pnpm vitest run tests/unit/job-search.test.ts && pnpm build`

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add src public tests/unit/job-search.test.ts
git commit -m "feat: add public job discovery pages"
```

---

### Task 5: Implement candidate eligibility, structured resume, and private PDF handling

**Files:**
- Create: `src/services/candidate-service.ts`
- Create: `src/routes/candidate.tsx`
- Create: `src/lib/signed-files.ts`
- Create: `tests/unit/candidate.test.ts`
- Create: `tests/fixtures/resume.pdf`
- Modify: `src/index.tsx`

**Interfaces:**
- Consumes: candidate tables, private `resume-pdfs` bucket, `requireRole(['candidate'])`.
- Produces: `candidateCanPublish`, `saveCandidateResume`, `replaceResumePdf`, `/candidate/onboarding`, `/candidate/resume`, `/candidate/resume/pdf`, `/candidate/applications`, and candidate settings routes.

- [ ] **Step 1: Write failing candidate-permission tests**

```ts
// tests/unit/candidate.test.ts
import { describe, expect, it } from 'vitest';
import { candidateCanPublish } from '../../src/services/candidate-service';

describe('candidateCanPublish', () => {
  it('requires age confirmation and verified identity', () => {
    expect(candidateCanPublish({ date_of_birth_confirmed: true, identity_status: 'verified' })).toBe(true);
    expect(candidateCanPublish({ date_of_birth_confirmed: false, identity_status: 'verified' })).toBe(false);
    expect(candidateCanPublish({ date_of_birth_confirmed: true, identity_status: 'processing' })).toBe(false);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run tests/unit/candidate.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement resume validation and save logic**

```ts
// src/services/candidate-service.ts
import { z } from 'zod';
import type { AppContext } from '../lib/supabase';
import { getServiceClient, getUserClient } from '../lib/supabase';

export const candidateCanPublish = (profile: { date_of_birth_confirmed: boolean; identity_status: string }) =>
  profile.date_of_birth_confirmed && profile.identity_status === 'verified';

export const resumeSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(1).max(100),
  stateProvince: z.string().trim().min(1).max(100),
  country: z.enum(['US', 'CA']),
  phone: z.string().trim().max(30).optional(),
  headline: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(4000),
  yearsExperience: z.coerce.number().int().min(0).max(80),
  workAuthorization: z.string().trim().min(2).max(200),
  searchable: z.coerce.boolean().default(false),
});

export const saveCandidateResume = async (c: AppContext, candidateId: string, raw: unknown) => {
  const input = resumeSchema.parse(raw);
  const client = getServiceClient(c);
  return client.from('candidate_profiles').upsert({
    user_id: candidateId,
    full_name: input.fullName,
    city: input.city,
    state_province: input.stateProvince,
    country: input.country,
    phone: input.phone || null,
    headline: input.headline,
    summary: input.summary,
    years_experience: input.yearsExperience,
    work_authorization: input.workAuthorization,
    searchable: input.searchable,
  });
};

const skillSchema = z.object({ skillName: z.string().trim().min(1).max(100), yearsExperience: z.coerce.number().int().min(0).max(80) });
const experienceSchema = z.object({ company: z.string().trim().min(1).max(200), jobTitle: z.string().trim().min(1).max(200), startDate: z.string().date(), endDate: z.string().date().optional(), description: z.string().trim().max(4000) });
const educationSchema = z.object({ school: z.string().trim().min(1).max(200), qualification: z.string().trim().min(1).max(200), field: z.string().trim().max(200), graduationYear: z.coerce.number().int().min(1900).max(2200).optional() });

export const addCandidateSkill = async (c: AppContext, candidateId: string, raw: unknown) => {
  const input = skillSchema.parse(raw);
  return getServiceClient(c).from('candidate_skills').upsert({ candidate_id: candidateId, skill_name: input.skillName, years_experience: input.yearsExperience }, { onConflict: 'candidate_id,skill_name' });
};

export const addCandidateExperience = async (c: AppContext, candidateId: string, raw: unknown) => {
  const input = experienceSchema.parse(raw);
  return getServiceClient(c).from('candidate_experience').insert({ candidate_id: candidateId, company: input.company, job_title: input.jobTitle, start_date: input.startDate, end_date: input.endDate || null, description: input.description });
};

export const addCandidateEducation = async (c: AppContext, candidateId: string, raw: unknown) => {
  const input = educationSchema.parse(raw);
  return getServiceClient(c).from('candidate_education').insert({ candidate_id: candidateId, school: input.school, qualification: input.qualification, field: input.field, graduation_year: input.graduationYear ?? null });
};

export const deleteCandidateSectionRow = async (c: AppContext, candidateId: string, section: 'candidate_skills' | 'candidate_experience' | 'candidate_education', rowId: string) =>
  getServiceClient(c).from(section).delete().eq('id', rowId).eq('candidate_id', candidateId);

export const replaceResumePdf = async (c: AppContext, candidateId: string, file: File) => {
  if (file.type !== 'application/pdf' || file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('invalid_pdf');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== '%PDF-') throw new Error('invalid_pdf_signature');
  const service = getServiceClient(c);
  const path = `${candidateId}/resume.pdf`;
  const { error: uploadError } = await service.storage.from('resume-pdfs').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;
  return service.from('resume_files').upsert({ candidate_id: candidateId, storage_path: path, original_filename: file.name, mime_type: file.type, size_bytes: file.size });
};
```

- [ ] **Step 4: Implement short-lived file URL helper**

```ts
// src/lib/signed-files.ts
import type { AppContext } from './supabase';
import { getServiceClient } from './supabase';

export const createResumeSignedUrl = async (c: AppContext, storagePath: string) => {
  const service = getServiceClient(c);
  const { data, error } = await service.storage.from('resume-pdfs').createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
};
```

- [ ] **Step 5: Add candidate routes with server-side permission checks**

```tsx
// src/routes/candidate.tsx
import { Hono } from 'hono';
import type { Bindings } from '../env';
import { requireRole } from '../middleware/role';
import { getServiceClient } from '../lib/supabase';
import { addCandidateEducation, addCandidateExperience, addCandidateSkill, candidateCanPublish, deleteCandidateSectionRow, replaceResumePdf, saveCandidateResume } from '../services/candidate-service';
import type { AppVariables } from '../types/app';

export const candidateRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
candidateRoutes.use('*', requireRole(['candidate']));
candidateRoutes.use('/resume*', async (c, next) => {
  const service = getServiceClient(c);
  const { data } = await service.from('candidate_profiles').select('date_of_birth_confirmed,identity_status').eq('user_id', c.get('sessionUser')!.id).single();
  if (!data || !candidateCanPublish(data)) return c.json({ error: 'identity_verification_required' }, 403);
  await next();
});

candidateRoutes.post('/onboarding', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  if (body.age18 !== 'yes' || !['US', 'CA'].includes(String(body.country))) return c.json({ error: 'ineligible' }, 400);
  const service = getServiceClient(c);
  await service.from('candidate_profiles').upsert({ user_id: user.id, full_name: String(body.fullName), city: String(body.city), state_province: String(body.stateProvince), country: body.country as 'US' | 'CA', headline: '', summary: '', work_authorization: '', date_of_birth_confirmed: true });
  await service.from('users').update({ country: body.country as 'US' | 'CA' }).eq('id', user.id);
  return c.json({ ok: true });
});

candidateRoutes.get('/resume', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data } = await service.from('candidate_profiles').select('full_name,city,state_province,country,phone,headline,summary,years_experience,work_authorization,searchable').eq('user_id', user.id).maybeSingle();
  return c.html(<form method="post" action="/candidate/resume"><label>Full name<input name="fullName" value={data?.full_name ?? ''} required /></label><label>Headline<input name="headline" value={data?.headline ?? ''} required /></label><label>City<input name="city" value={data?.city ?? ''} required /></label><label>State or province<input name="stateProvince" value={data?.state_province ?? ''} required /></label><label>Country<select name="country"><option value="US">United States</option><option value="CA">Canada</option></select></label><label>Summary<textarea name="summary">{data?.summary ?? ''}</textarea></label><label>Years of experience<input name="yearsExperience" type="number" min="0" max="80" value={data?.years_experience ?? 0} /></label><label>Work authorization<input name="workAuthorization" value={data?.work_authorization ?? ''} required /></label><label><input name="searchable" type="checkbox" checked={data?.searchable ?? false} /> Searchable by approved employers</label><button>Save resume</button></form>);
});

candidateRoutes.post('/resume', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data: profile } = await service.from('candidate_profiles').select('date_of_birth_confirmed,identity_status').eq('user_id', user.id).single();
  if (!profile || !candidateCanPublish(profile)) return c.json({ error: 'identity_verification_required' }, 403);
  const result = await saveCandidateResume(c, user.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'resume_save_failed' }, 400) : c.json({ ok: true });
});

candidateRoutes.post('/resume/skills', async (c) => {
  const result = await addCandidateSkill(c, c.get('sessionUser')!.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'skill_save_failed' }, 400) : c.json({ ok: true }, 201);
});

candidateRoutes.post('/resume/experience', async (c) => {
  const result = await addCandidateExperience(c, c.get('sessionUser')!.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'experience_save_failed' }, 400) : c.json({ ok: true }, 201);
});

candidateRoutes.post('/resume/education', async (c) => {
  const result = await addCandidateEducation(c, c.get('sessionUser')!.id, await c.req.parseBody());
  return result.error ? c.json({ error: 'education_save_failed' }, 400) : c.json({ ok: true }, 201);
});

candidateRoutes.delete('/resume/:section/:id', async (c) => {
  const sectionMap = { skills: 'candidate_skills', experience: 'candidate_experience', education: 'candidate_education' } as const;
  const section = sectionMap[c.req.param('section') as keyof typeof sectionMap];
  if (!section) return c.json({ error: 'invalid_resume_section' }, 400);
  const result = await deleteCandidateSectionRow(c, c.get('sessionUser')!.id, section, c.req.param('id'));
  return result.error ? c.json({ error: 'resume_section_delete_failed' }, 400) : c.json({ ok: true });
});

candidateRoutes.post('/resume/pdf', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  if (!(body.resume instanceof File)) return c.json({ error: 'pdf_required' }, 400);
  await replaceResumePdf(c, user.id, body.resume);
  return c.json({ ok: true });
});

candidateRoutes.get('/applications', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data, error } = await service.from('applications').select('id,status,applied_at,jobs(title,slug)').eq('candidate_id', user.id).order('applied_at', { ascending: false });
  return error ? c.json({ error: 'applications_unavailable' }, 500) : c.json({ applications: data });
});
```

- [ ] **Step 6: Register routes, run tests, and build**

```tsx
// src/index.tsx addition
import { candidateRoutes } from './routes/candidate';
app.route('/candidate', candidateRoutes);
```

Run: `pnpm typecheck && pnpm vitest run tests/unit/candidate.test.ts && pnpm build`

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit/candidate.test.ts tests/fixtures/resume.pdf
git commit -m "feat: add private candidate resumes"
```

---

### Task 6: Implement the $2.49 identity payment and Stripe Identity workflow

**Files:**
- Create: `src/lib/stripe.ts`
- Create: `src/services/payment-service.ts`
- Create: `src/routes/webhooks.ts`
- Modify: `src/routes/candidate.tsx`
- Modify: `src/routes/auth.tsx`
- Modify: `src/index.tsx`
- Create: `tests/unit/payment-idempotency.test.ts`
- Create: `tests/integration/identity-workflow.test.ts`

**Interfaces:**
- Consumes: `payments`, `identity_verifications`, `webhook_events`, Stripe price IDs and webhook secrets.
- Produces: `createIdentityCheckout`, `processCheckoutEvent`, `processIdentityEvent`, `/candidate/verification/checkout`, `/candidate/verification/session`, `/webhooks/stripe`, and `/webhooks/stripe-identity`.

- [ ] **Step 1: Write the failing idempotency test**

```ts
// tests/unit/payment-idempotency.test.ts
import { describe, expect, it } from 'vitest';
import { shouldProcessWebhook } from '../../src/services/payment-service';

describe('shouldProcessWebhook', () => {
  it('processes only previously unseen event ids', async () => {
    const seen = new Set<string>();
    const claim = async (id: string) => !seen.has(id) && Boolean(seen.add(id));
    await expect(shouldProcessWebhook('evt_1', claim)).resolves.toBe(true);
    await expect(shouldProcessWebhook('evt_1', claim)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run tests/unit/payment-idempotency.test.ts`

Expected: FAIL because `payment-service.ts` does not exist.

- [ ] **Step 3: Implement Stripe client and webhook claiming**

```ts
// src/lib/stripe.ts
import Stripe from 'stripe';
import type { AppContext } from './supabase';

export const getStripe = (c: AppContext) => new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

export const creditQuantityForPurpose = (purpose: 'credit_pack_10' | 'credit_pack_25') => purpose === 'credit_pack_10' ? 10 : 25;
```

```ts
// src/services/payment-service.ts
import type Stripe from 'stripe';
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';
import { creditQuantityForPurpose, getStripe } from '../lib/stripe';

export const shouldProcessWebhook = async (eventId: string, claim: (eventId: string) => Promise<boolean>) => claim(eventId);

export const claimWebhook = async (c: AppContext, provider: string, event: Stripe.Event) => {
  const service = getServiceClient(c);
  const { error } = await service.from('webhook_events').insert({ provider, event_id: event.id, event_type: event.type });
  return error?.code !== '23505';
};

export const createIdentityCheckout = async (c: AppContext, candidateId: string) => {
  const stripe = getStripe(c);
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: c.env.STRIPE_IDENTITY_PRICE_ID, quantity: 1 }],
    success_url: `${c.env.APP_ORIGIN}/candidate/verification?paid=1`,
    cancel_url: `${c.env.APP_ORIGIN}/candidate/verification?cancelled=1`,
    client_reference_id: candidateId,
    metadata: { purpose: 'identity_fee', userId: candidateId },
  }, { idempotencyKey: `identity-checkout:${candidateId}` });
};

export const grantPurchasedCredits = async (c: AppContext, userId: string, purpose: 'credit_pack_10' | 'credit_pack_25', paymentId: string) => {
  const quantity = creditQuantityForPurpose(purpose);
  const service = getServiceClient(c);
  const { error } = await service.rpc('grant_credit_purchase', { p_employer_id: userId, p_quantity: quantity, p_payment_id: paymentId });
  if (error) throw error;
};
```

- [ ] **Step 4: Add the credit-grant SQL function used by idempotent webhooks**

```sql
-- append to supabase/migrations/0003_business_functions.sql
create or replace function public.grant_credit_purchase(p_employer_id uuid, p_quantity integer, p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.credit_transactions where payment_id = p_payment_id and type = 'purchase') then return; end if;
  insert into public.credit_wallets (employer_id, available_credits, purchased_credits, used_credits)
  values (p_employer_id, p_quantity, p_quantity, 0)
  on conflict (employer_id) do update set
    available_credits = credit_wallets.available_credits + excluded.available_credits,
    purchased_credits = credit_wallets.purchased_credits + excluded.purchased_credits,
    updated_at = now();
  insert into public.credit_transactions (employer_id, type, quantity, payment_id)
  values (p_employer_id, 'purchase', p_quantity, p_payment_id);
end;
$$;
```

- [ ] **Step 5: Implement checkout and Identity webhook handlers**

```tsx
// src/routes/webhooks.ts
import { Hono } from 'hono';
import type Stripe from 'stripe';
import type { Bindings } from '../env';
import { getStripe } from '../lib/stripe';
import { getServiceClient } from '../lib/supabase';
import { claimWebhook, grantPurchasedCredits } from '../services/payment-service';
import type { AppVariables } from '../types/app';

export const webhookRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

webhookRoutes.post('/stripe', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.text('missing signature', 400);
  const stripe = getStripe(c);
  const event = await stripe.webhooks.constructEventAsync(body, signature, c.env.STRIPE_WEBHOOK_SECRET);
  if (!(await claimWebhook(c, 'stripe', event))) return c.json({ received: true, duplicate: true });
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const purpose = session.metadata?.purpose;
    if (!userId || !purpose) return c.text('missing metadata', 400);
    const service = getServiceClient(c);
    const { data: payment, error } = await service.from('payments').upsert({
      user_id: userId,
      purpose: purpose as 'identity_fee' | 'credit_pack_10' | 'credit_pack_25',
      amount_cents: session.amount_total ?? 0,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      status: 'paid',
    }, { onConflict: 'stripe_checkout_session_id' }).select('id').single();
    if (error || !payment) return c.text('payment persistence failed', 500);
    if (purpose === 'identity_fee') {
      const { data: profile } = await service.from('candidate_profiles').select('country').eq('user_id', userId).single();
      if (!profile) return c.text('candidate profile missing', 400);
      await service.from('identity_verifications').upsert({ candidate_id: userId, payment_id: payment.id, status: 'payment_pending', country: profile.country }, { onConflict: 'candidate_id' });
      await service.from('candidate_profiles').update({ identity_status: 'payment_pending' }).eq('user_id', userId);
      const { data: candidateUser } = await service.from('users').select('email').eq('id', userId).single();
      if (candidateUser) queueEmail(c, identityFeeReceiptEmail(candidateUser.email));
    }
    if (purpose === 'credit_pack_10' || purpose === 'credit_pack_25') await grantPurchasedCredits(c, userId, purpose, payment.id);
  }
  return c.json({ received: true });
});

webhookRoutes.post('/stripe-identity', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.text('missing signature', 400);
  const stripe = getStripe(c);
  const event = await stripe.webhooks.constructEventAsync(body, signature, c.env.STRIPE_IDENTITY_WEBHOOK_SECRET);
  if (!(await claimWebhook(c, 'stripe_identity', event))) return c.json({ received: true, duplicate: true });
  if (event.type === 'identity.verification_session.verified' || event.type === 'identity.verification_session.requires_input') {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    const candidateId = session.metadata.candidateId;
    const status = event.type.endsWith('verified') ? 'verified' : 'requires_input';
    const service = getServiceClient(c);
    await service.from('identity_verifications').update({ status, verified_at: status === 'verified' ? new Date().toISOString() : null }).eq('provider_reference_id', session.id);
    await service.from('candidate_profiles').update({ identity_status: status, identity_verified_at: status === 'verified' ? new Date().toISOString() : null }).eq('user_id', candidateId);
  }
  return c.json({ received: true });
});
```

- [ ] **Step 6: Add candidate verification routes with retry-safe session reuse**

```tsx
// src/routes/candidate.tsx additions
import { getStripe } from '../lib/stripe';
import { createIdentityCheckout } from '../services/payment-service';

candidateRoutes.post('/verification/checkout', async (c) => {
  const user = c.get('sessionUser')!;
  const checkout = await createIdentityCheckout(c, user.id);
  return c.json({ url: checkout.url });
});

candidateRoutes.post('/verification/session', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data: verification } = await service.from('identity_verifications').select('id,payment_id,provider_reference_id,status,payments!inner(stripe_payment_intent_id)').eq('candidate_id', user.id).single();
  if (!verification) return c.json({ error: 'identity_payment_required' }, 402);
  const stripe = getStripe(c);
  if (verification.provider_reference_id) {
    const existing = await stripe.identity.verificationSessions.retrieve(verification.provider_reference_id);
    return c.json({ url: existing.url, status: verification.status });
  }
  try {
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { candidateId: user.id, verificationId: verification.id },
      return_url: `${c.env.APP_ORIGIN}/candidate/verification`,
      options: { document: { require_matching_selfie: true } },
    }, { idempotencyKey: `identity-session:${verification.id}` });
    await service.from('identity_verifications').update({ provider_reference_id: session.id, status: 'requires_input', started_at: new Date().toISOString() }).eq('id', verification.id);
    return c.json({ url: session.url, status: 'requires_input' });
  } catch {
    const paymentIntent = verification.payments.stripe_payment_intent_id;
    if (paymentIntent) await stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `identity-session-failure-refund:${verification.payment_id}` });
    await service.from('payments').update({ status: 'refunded' }).eq('id', verification.payment_id);
    await service.from('identity_verifications').update({ status: 'not_started' }).eq('id', verification.id);
    await service.from('candidate_profiles').update({ identity_status: 'not_started' }).eq('user_id', user.id);
    return c.json({ error: 'verification_session_creation_failed_refunded' }, 502);
  }
});

candidateRoutes.post('/verification/appeal', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 10 || reason.length > 2000) return c.json({ error: 'appeal_reason_invalid' }, 400);
  const service = getServiceClient(c);
  const { error } = await service.from('reports').insert({ reporter_user_id: user.id, target_type: 'identity_verification', target_id: user.id, reason });
  return error ? c.json({ error: 'appeal_submission_failed' }, 400) : c.json({ ok: true }, 201);
});
```

- [ ] **Step 7: Register webhook routes before CSRF-protected form routes**

```tsx
// src/index.tsx addition
import { webhookRoutes } from './routes/webhooks';
app.route('/webhooks', webhookRoutes);
```

- [ ] **Step 8: Reset migrations and run payment tests**

Run: `pnpm supabase:reset && pnpm vitest run tests/unit/payment-idempotency.test.ts tests/integration/identity-workflow.test.ts && pnpm typecheck`

Expected: all tests pass, duplicate webhook fixture changes no balances, and verified identity enables publishing.

- [ ] **Step 9: Commit**

```bash
git add src supabase/migrations/0003_business_functions.sql tests
git commit -m "feat: add paid identity verification workflow"
```

---

### Task 7: Implement employer onboarding, private proof upload, and administrator review

**Files:**
- Create: `src/services/employer-service.ts`
- Create: `src/routes/employer.tsx`
- Create: `src/routes/admin.tsx`
- Modify: `src/index.tsx`
- Create: `tests/unit/employer-review.test.ts`
- Create: `tests/integration/employer-approval.test.ts`

**Interfaces:**
- Consumes: employer tables, private document bucket, `requireRole`.
- Produces: `submitEmployerReview`, `decideEmployerReview`, pending/approved employer guards, employer onboarding pages, and admin review pages.

- [ ] **Step 1: Write failing review-transition tests**

```ts
// tests/unit/employer-review.test.ts
import { describe, expect, it } from 'vitest';
import { canTransitionReview } from '../../src/services/employer-service';

describe('canTransitionReview', () => {
  it('allows pending to approved or rejected', () => {
    expect(canTransitionReview('pending', 'approved')).toBe(true);
    expect(canTransitionReview('pending', 'rejected')).toBe(true);
  });
  it('blocks direct draft to approved', () => expect(canTransitionReview('draft', 'approved')).toBe(false));
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run tests/unit/employer-review.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement employer submission and review decisions**

```ts
// src/services/employer-service.ts
import { z } from 'zod';
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';

export const canTransitionReview = (from: string, to: string) =>
  (from === 'pending' && ['approved', 'rejected'].includes(to)) ||
  (from === 'approved' && ['suspended'].includes(to)) ||
  (from === 'suspended' && ['approved'].includes(to)) ||
  (from === 'rejected' && ['pending'].includes(to));

const employerSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  website: z.string().url(),
  companyEmail: z.string().email(),
  registrationNumber: z.string().trim().min(2).max(100),
  country: z.enum(['US', 'CA']),
});

export const submitEmployerReview = async (c: AppContext, employerId: string, raw: unknown, file: File) => {
  const input = employerSchema.parse(raw);
  const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
  if (!allowed.includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('invalid_employer_document');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const service = getServiceClient(c);
  const path = `${employerId}/${crypto.randomUUID()}`;
  const { error: uploadError } = await service.storage.from('employer-documents').upload(path, bytes, { contentType: file.type });
  if (uploadError) throw uploadError;
  await service.from('employer_profiles').upsert({ user_id: employerId, company_name: input.companyName, website: input.website, company_email: input.companyEmail, registration_number: input.registrationNumber, country: input.country, review_status: 'pending', rejection_reason: null });
  await service.from('employer_documents').insert({ employer_id: employerId, storage_path: path, original_filename: file.name, mime_type: file.type, size_bytes: file.size, document_type: 'registration_proof', file_sha256: sha256 });
};

export const decideEmployerReview = async (c: AppContext, adminId: string, employerId: string, decision: 'approved' | 'rejected', reason?: string) => {
  const service = getServiceClient(c);
  const { data: current } = await service.from('employer_profiles').select('review_status').eq('user_id', employerId).single();
  if (!current || !canTransitionReview(current.review_status, decision)) throw new Error('invalid_review_transition');
  const reviewedAt = new Date().toISOString();
  await service.from('employer_profiles').update({ review_status: decision, reviewed_by: adminId, reviewed_at: reviewedAt, rejection_reason: decision === 'rejected' ? reason ?? 'Registration could not be verified.' : null }).eq('user_id', employerId);
  await service.from('employer_documents').update({ delete_after: new Date(Date.now() + 30 * 86400000).toISOString() }).eq('employer_id', employerId).eq('legal_hold', false);
  if (decision === 'approved') await service.from('credit_wallets').upsert({ employer_id: employerId, available_credits: 0, purchased_credits: 0, used_credits: 0 });
};
```

- [ ] **Step 4: Add employer and admin endpoints**

```tsx
// src/routes/employer.tsx
import { Hono } from 'hono';
import type { Bindings } from '../env';
import { requireRole } from '../middleware/role';
import { getServiceClient } from '../lib/supabase';
import { submitEmployerReview } from '../services/employer-service';
import type { AppVariables } from '../types/app';

export const employerRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
employerRoutes.use('*', requireRole(['employer']));

employerRoutes.post('/onboarding', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  if (!(body.document instanceof File)) return c.json({ error: 'registration_document_required' }, 400);
  await submitEmployerReview(c, user.id, body, body.document);
  return c.json({ ok: true, reviewStatus: 'pending' });
});

employerRoutes.get('/review-status', async (c) => {
  const service = getServiceClient(c);
  const { data } = await service.from('employer_profiles').select('review_status,rejection_reason,reviewed_at').eq('user_id', c.get('sessionUser')!.id).single();
  return c.json({ review: data });
});
```

```tsx
// src/routes/admin.tsx
import { Hono } from 'hono';
import type { Bindings } from '../env';
import { requireRole } from '../middleware/role';
import { decideEmployerReview } from '../services/employer-service';
import type { AppVariables } from '../types/app';

export const adminRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
adminRoutes.use('*', requireRole(['admin']));

adminRoutes.get('/employers/:id', async (c) => {
  const service = getServiceClient(c);
  const employerId = c.req.param('id');
  const [{ data: employer }, { data: documents }] = await Promise.all([
    service.from('employer_profiles').select('*').eq('user_id', employerId).single(),
    service.from('employer_documents').select('id,storage_path,original_filename,mime_type,file_sha256,uploaded_at').eq('employer_id', employerId),
  ]);
  if (!employer) return c.notFound();
  const signedDocuments = await Promise.all((documents ?? []).map(async (document) => {
    const { data, error } = await service.storage.from('employer-documents').createSignedUrl(document.storage_path, 300);
    if (error) throw error;
    return { ...document, signedUrl: data.signedUrl };
  }));
  return c.json({ employer, documents: signedDocuments });
});

adminRoutes.post('/employers/:id/decision', async (c) => {
  const body = await c.req.parseBody();
  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : null;
  if (!decision) return c.json({ error: 'invalid_decision' }, 400);
  await decideEmployerReview(c, c.get('sessionUser')!.id, c.req.param('id'), decision, String(body.reason ?? ''));
  return c.json({ ok: true });
});
```

- [ ] **Step 5: Register routes and run tests**

```tsx
// src/index.tsx additions
import { adminRoutes } from './routes/admin';
import { employerRoutes } from './routes/employer';
app.route('/employer', employerRoutes);
app.route('/admin', adminRoutes);
```

Run: `pnpm vitest run tests/unit/employer-review.test.ts tests/integration/employer-approval.test.ts && pnpm typecheck`

Expected: pending employers cannot use approved-only operations; an admin approval creates an empty wallet and sets document deletion at 30 days.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: add manual employer approval"
```

---

### Task 8: Enforce approved-employer job publishing, 10 active jobs, expiration, and renewal

**Files:**
- Modify: `supabase/migrations/0003_business_functions.sql`
- Modify: `src/services/job-service.ts`
- Modify: `src/routes/employer.tsx`
- Create: `tests/unit/job-rules.test.ts`
- Create: `tests/integration/job-publishing.test.ts`

**Interfaces:**
- Consumes: approved employer status, `jobs` table.
- Produces: `publish_job`, `renew_job` RPCs and employer job-management endpoints.

- [ ] **Step 1: Write failing job-rule tests**

```ts
// tests/unit/job-rules.test.ts
import { describe, expect, it } from 'vitest';
import { canPublishAnotherJob, nextExpiration } from '../../src/services/job-service';

describe('job rules', () => {
  it('allows only fewer than ten active jobs', () => {
    expect(canPublishAnotherJob(9)).toBe(true);
    expect(canPublishAnotherJob(10)).toBe(false);
  });
  it('expires exactly thirty days after publish or renewal', () => {
    expect(nextExpiration(new Date('2026-07-13T00:00:00Z')).toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Implement pure rules**

```ts
// append to src/services/job-service.ts
export const canPublishAnotherJob = (activeCount: number) => activeCount < 10;
export const nextExpiration = (from: Date) => new Date(from.getTime() + 30 * 86400000);
```

- [ ] **Step 3: Implement database-enforced publish and renewal**

```sql
-- append to supabase/migrations/0003_business_functions.sql
create or replace function public.publish_job(p_job_id uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare v_job public.jobs; v_count integer;
begin
  if not exists (select 1 from public.employer_profiles where user_id = auth.uid() and review_status = 'approved') then raise exception 'employer_not_approved'; end if;
  select count(*) into v_count from public.jobs where employer_id = auth.uid() and status = 'published' and expires_at > now();
  if v_count >= 10 then raise exception 'active_job_limit'; end if;
  update public.jobs set status = 'published', published_at = now(), expires_at = now() + interval '30 days', updated_at = now()
  where id = p_job_id and employer_id = auth.uid() returning * into v_job;
  if v_job.id is null then raise exception 'job_not_found'; end if;
  return v_job;
end;
$$;

create or replace function public.renew_job(p_job_id uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare v_job public.jobs; v_count integer;
begin
  if not exists (select 1 from public.employer_profiles where user_id = auth.uid() and review_status = 'approved') then raise exception 'employer_not_approved'; end if;
  select count(*) into v_count from public.jobs where employer_id = auth.uid() and status = 'published' and expires_at > now() and id <> p_job_id;
  if v_count >= 10 then raise exception 'active_job_limit'; end if;
  update public.jobs set status = 'published', published_at = now(), expires_at = now() + interval '30 days', updated_at = now()
  where id = p_job_id and employer_id = auth.uid() returning * into v_job;
  if v_job.id is null then raise exception 'job_not_found'; end if;
  return v_job;
end;
$$;
```

- [ ] **Step 4: Add employer job endpoints**

```tsx
// src/routes/employer.tsx additions
import { getUserClient } from '../lib/supabase';

employerRoutes.get('/jobs', async (c) => {
  const service = getServiceClient(c);
  const { data } = await service.from('jobs').select('id,title,status,expires_at').eq('employer_id', c.get('sessionUser')!.id).order('created_at', { ascending: false });
  return c.html(<main><h1>Jobs</h1><a href="/employer/jobs/new">New job</a><ul>{(data ?? []).map((job) => <li>{job.title} — {job.status}</li>)}</ul></main>);
});

employerRoutes.get('/jobs/new', (c) => c.html(<form method="post" action="/employer/jobs"><label>Title<input name="title" required /></label><label>Description<textarea name="description" required /></label><label>City<input name="city" required /></label><label>State or province<input name="stateProvince" required /></label><label>Country<select name="country"><option value="US">United States</option><option value="CA">Canada</option></select></label><label>Employment type<input name="employmentType" required /></label><label>Workplace type<input name="workplaceType" required /></label><button>Save draft</button></form>));

employerRoutes.post('/jobs', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  const client = getServiceClient(c);
  const { data: employer } = await client.from('employer_profiles').select('review_status').eq('user_id', user.id).single();
  if (employer?.review_status !== 'approved') return c.json({ error: 'employer_not_approved' }, 403);
  const { data, error } = await client.from('jobs').insert({
    employer_id: user.id,
    slug: `${String(body.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 8)}`,
    title: String(body.title), description: String(body.description), city: String(body.city), state_province: String(body.stateProvince),
    country: body.country as 'US' | 'CA', employment_type: String(body.employmentType), workplace_type: String(body.workplaceType),
    salary_min: body.salaryMin ? Number(body.salaryMin) : null, salary_max: body.salaryMax ? Number(body.salaryMax) : null,
  }).select('id').single();
  return error ? c.json({ error: 'job_create_failed' }, 400) : c.json({ jobId: data.id }, 201);
});

employerRoutes.post('/jobs/:id/update', async (c) => {
  const user = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  const service = getServiceClient(c);
  const { data: employer } = await service.from('employer_profiles').select('review_status').eq('user_id', user.id).single();
  if (employer?.review_status !== 'approved') return c.json({ error: 'employer_not_approved' }, 403);
  const { error } = await service.from('jobs').update({ title: String(body.title), description: String(body.description), city: String(body.city), state_province: String(body.stateProvince), country: body.country as 'US' | 'CA', employment_type: String(body.employmentType), workplace_type: String(body.workplaceType), salary_min: body.salaryMin ? Number(body.salaryMin) : null, salary_max: body.salaryMax ? Number(body.salaryMax) : null, updated_at: new Date().toISOString() }).eq('id', c.req.param('id')).eq('employer_id', user.id);
  return error ? c.json({ error: 'job_update_failed' }, 400) : c.json({ ok: true });
});

employerRoutes.post('/jobs/:id/close', async (c) => {
  const service = getServiceClient(c);
  const { error } = await service.from('jobs').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', c.req.param('id')).eq('employer_id', c.get('sessionUser')!.id);
  return error ? c.json({ error: 'job_close_failed' }, 400) : c.json({ ok: true });
});

employerRoutes.post('/jobs/:id/publish', async (c) => {
  const client = getUserClient(c);
  const { data, error } = await client.rpc('publish_job', { p_job_id: c.req.param('id') });
  return error ? c.json({ error: error.message }, 400) : c.json({ job: data });
});

employerRoutes.post('/jobs/:id/renew', async (c) => {
  const client = getUserClient(c);
  const { data, error } = await client.rpc('renew_job', { p_job_id: c.req.param('id') });
  return error ? c.json({ error: error.message }, 400) : c.json({ job: data });
});
```

- [ ] **Step 5: Reset database and verify rules**

Run: `pnpm supabase:reset && pnpm vitest run tests/unit/job-rules.test.ts tests/integration/job-publishing.test.ts`

Expected: the eleventh simultaneous active job fails, expired jobs do not count, and renewal sets a new 30-day expiration.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_business_functions.sql src tests
git commit -m "feat: enforce job publishing rules"
```

---

### Task 9: Implement candidate applications and free permanent contact access

**Files:**
- Create: `src/services/application-service.ts`
- Modify: `src/routes/candidate.tsx`
- Modify: `src/routes/employer.tsx`
- Create: `tests/unit/application.test.ts`
- Create: `tests/integration/application-unlock.test.ts`

**Interfaces:**
- Consumes: verified candidate, published non-expired job, applications, contact unlocks.
- Produces: `applyToJob`, free `application` unlocks, employer applicant detail response, and application notification trigger.

- [ ] **Step 1: Write failing application eligibility tests**

```ts
// tests/unit/application.test.ts
import { describe, expect, it } from 'vitest';
import { canApply } from '../../src/services/application-service';

describe('canApply', () => {
  it('requires verified identity and an open job', () => {
    expect(canApply('verified', 'published', new Date('2026-08-01'), new Date('2026-07-13'))).toBe(true);
    expect(canApply('processing', 'published', new Date('2026-08-01'), new Date('2026-07-13'))).toBe(false);
    expect(canApply('verified', 'expired', new Date('2026-07-01'), new Date('2026-07-13'))).toBe(false);
  });
});
```

- [ ] **Step 2: Implement application transaction**

```ts
// src/services/application-service.ts
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';

export const canApply = (identityStatus: string, jobStatus: string, expiresAt: Date, now: Date) =>
  identityStatus === 'verified' && jobStatus === 'published' && expiresAt > now;

export const applyToJob = async (c: AppContext, candidateId: string, jobId: string, coverNote?: string) => {
  const service = getServiceClient(c);
  const { data: profile } = await service.from('candidate_profiles').select('identity_status').eq('user_id', candidateId).single();
  const { data: job } = await service.from('jobs').select('id,employer_id,title,status,expires_at').eq('id', jobId).single();
  if (!profile || !job || !canApply(profile.identity_status, job.status, new Date(job.expires_at!), new Date())) throw new Error('application_not_allowed');
  const { data: application, error } = await service.from('applications').insert({ job_id: jobId, candidate_id: candidateId, cover_note: coverNote || null }).select('id').single();
  if (error) throw error;
  await service.from('contact_unlocks').upsert({ employer_id: job.employer_id, candidate_id: candidateId, source: 'application', credit_transaction_id: null }, { onConflict: 'employer_id,candidate_id', ignoreDuplicates: true });
  return { applicationId: application.id, employerId: job.employer_id };
};
```

- [ ] **Step 3: Add candidate application and employer applicant endpoints**

```tsx
// src/routes/candidate.tsx addition
import { applyToJob } from '../services/application-service';

candidateRoutes.post('/apply/:jobId', async (c) => {
  const body = await c.req.parseBody();
  try {
    const result = await applyToJob(c, c.get('sessionUser')!.id, c.req.param('jobId'), String(body.coverNote ?? ''));
    return c.json({ ok: true, ...result }, 201);
  } catch {
    return c.json({ error: 'application_not_allowed_or_duplicate' }, 400);
  }
});
```

```tsx
// src/routes/employer.tsx addition
employerRoutes.get('/applications', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data, error } = await service.from('applications').select('id,status,cover_note,applied_at,candidate_id,jobs!inner(title,employer_id),candidate_profiles!inner(full_name,email:users!inner(email),phone)').eq('jobs.employer_id', user.id).order('applied_at', { ascending: false });
  return error ? c.json({ error: 'applications_unavailable' }, 500) : c.json({ applications: data });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/unit/application.test.ts tests/integration/application-unlock.test.ts && pnpm typecheck`

Expected: one application is created, a free permanent unlock exists, duplicates fail, and no credit transaction is created.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: grant free contact access after applications"
```

---

### Task 10: Implement employer credit checkout and an auditable wallet ledger

**Files:**
- Modify: `supabase/migrations/0003_business_functions.sql`
- Create: `src/services/credit-service.ts`
- Modify: `src/routes/employer.tsx`
- Modify: `src/routes/admin.tsx`
- Modify: `src/routes/webhooks.ts`
- Create: `tests/unit/credits.test.ts`
- Create: `tests/integration/credit-purchase.test.ts`
- Create: `tests/integration/credit-refund.test.ts`

**Interfaces:**
- Consumes: Stripe price IDs, `payments`, `credit_wallets`, `credit_transactions`, `grant_credit_purchase`.
- Produces: `createCreditCheckout`, `/employer/credits`, `/employer/credits/checkout/:pack`, administrator refund initiation, idempotent refund reconciliation, and wallet/ledger display data.

- [ ] **Step 1: Write failing package tests**

```ts
// tests/unit/credits.test.ts
import { describe, expect, it } from 'vitest';
import { creditPack } from '../../src/services/credit-service';

describe('creditPack', () => {
  it('maps only approved packs', () => {
    expect(creditPack('10')).toEqual({ purpose: 'credit_pack_10', credits: 10, amountCents: 3000 });
    expect(creditPack('25')).toEqual({ purpose: 'credit_pack_25', credits: 25, amountCents: 7500 });
    expect(() => creditPack('50')).toThrow();
  });
});
```

- [ ] **Step 2: Implement checkout creation**

```ts
// src/services/credit-service.ts
import type { AppContext } from '../lib/supabase';
import { getStripe } from '../lib/stripe';

export const creditPack = (pack: string) => {
  if (pack === '10') return { purpose: 'credit_pack_10' as const, credits: 10, amountCents: 3000 };
  if (pack === '25') return { purpose: 'credit_pack_25' as const, credits: 25, amountCents: 7500 };
  throw new Error('invalid_credit_pack');
};

export const createCreditCheckout = async (c: AppContext, employerId: string, packId: string) => {
  const pack = creditPack(packId);
  const stripe = getStripe(c);
  const price = packId === '10' ? c.env.STRIPE_CREDITS_10_PRICE_ID : c.env.STRIPE_CREDITS_25_PRICE_ID;
  return stripe.checkout.sessions.create({
    mode: 'payment', line_items: [{ price, quantity: 1 }], client_reference_id: employerId,
    success_url: `${c.env.APP_ORIGIN}/employer/credits?success=1`, cancel_url: `${c.env.APP_ORIGIN}/employer/credits?cancelled=1`,
    metadata: { purpose: pack.purpose, userId: employerId },
  }, { idempotencyKey: `credit-checkout:${employerId}:${packId}:${new Date().toISOString().slice(0, 10)}` });
};
```

- [ ] **Step 3: Add approved-employer credit endpoints**

```tsx
// src/routes/employer.tsx additions
import { createCreditCheckout } from '../services/credit-service';

employerRoutes.get('/credits', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data: employer } = await service.from('employer_profiles').select('review_status').eq('user_id', user.id).single();
  if (employer?.review_status !== 'approved') return c.json({ error: 'employer_not_approved' }, 403);
  const [{ data: wallet }, { data: ledger }] = await Promise.all([
    service.from('credit_wallets').select('*').eq('employer_id', user.id).single(),
    service.from('credit_transactions').select('*').eq('employer_id', user.id).order('created_at', { ascending: false }).limit(100),
  ]);
  return c.json({ wallet, ledger });
});

employerRoutes.post('/credits/checkout/:pack', async (c) => {
  const user = c.get('sessionUser')!;
  const service = getServiceClient(c);
  const { data: employer } = await service.from('employer_profiles').select('review_status').eq('user_id', user.id).single();
  if (employer?.review_status !== 'approved') return c.json({ error: 'employer_not_approved' }, 403);
  const session = await createCreditCheckout(c, user.id, c.req.param('pack'));
  return c.json({ url: session.url });
});
```

- [ ] **Step 4: Add unused-credit refund reconciliation**

```sql
-- append to supabase/migrations/0003_business_functions.sql
create or replace function public.can_refund_credit_purchase(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_employer uuid; v_quantity integer; v_available integer;
begin
  select ct.employer_id, ct.quantity into v_employer, v_quantity
  from public.credit_transactions ct
  where ct.payment_id = p_payment_id and ct.type = 'purchase';
  if v_employer is null then return false; end if;
  select available_credits into v_available from public.credit_wallets where employer_id = v_employer;
  return v_available >= v_quantity and not exists (
    select 1 from public.credit_transactions where payment_id = p_payment_id and type = 'refund'
  );
end;
$$;

create or replace function public.refund_credit_purchase(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_employer uuid; v_quantity integer; v_wallet public.credit_wallets;
begin
  if exists (select 1 from public.credit_transactions where payment_id = p_payment_id and type = 'refund') then return; end if;
  select employer_id, quantity into v_employer, v_quantity from public.credit_transactions where payment_id = p_payment_id and type = 'purchase';
  if v_employer is null then raise exception 'credit_purchase_not_found'; end if;
  select * into v_wallet from public.credit_wallets where employer_id = v_employer for update;
  if v_wallet.available_credits < v_quantity then raise exception 'used_credits_non_refundable'; end if;
  update public.credit_wallets set available_credits = available_credits - v_quantity, purchased_credits = purchased_credits - v_quantity, updated_at = now() where employer_id = v_employer;
  insert into public.credit_transactions (employer_id, type, quantity, payment_id) values (v_employer, 'refund', -v_quantity, p_payment_id);
  update public.payments set status = 'refunded', updated_at = now() where id = p_payment_id;
end;
$$;
```

```tsx
// src/routes/admin.tsx addition
import { getStripe } from '../lib/stripe';

adminRoutes.post('/payments/:id/refund', async (c) => {
  const service = getServiceClient(c);
  const paymentId = c.req.param('id');
  const { data: refundable, error: checkError } = await service.rpc('can_refund_credit_purchase', { p_payment_id: paymentId });
  if (checkError || !refundable) return c.json({ error: 'used_or_nonrefundable_credits' }, 409);
  const { data: payment } = await service.from('payments').select('stripe_payment_intent_id').eq('id', paymentId).single();
  if (!payment?.stripe_payment_intent_id) return c.json({ error: 'payment_intent_missing' }, 400);
  const stripe = getStripe(c);
  const refund = await stripe.refunds.create({ payment_intent: payment.stripe_payment_intent_id }, { idempotencyKey: `admin-credit-refund:${paymentId}` });
  return c.json({ ok: true, refundId: refund.id, status: refund.status });
});
```

```tsx
// src/routes/webhooks.ts addition inside the Stripe webhook after checkout handling
if (event.type === 'charge.refunded') {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (paymentIntentId) {
    const service = getServiceClient(c);
    const { data: payment } = await service.from('payments').select('id,purpose').eq('stripe_payment_intent_id', paymentIntentId).single();
    if (payment) {
      if (payment.purpose === 'credit_pack_10' || payment.purpose === 'credit_pack_25') {
        const { error } = await service.rpc('refund_credit_purchase', { p_payment_id: payment.id });
        if (error) return c.text(error.message, 409);
      } else {
        await service.from('payments').update({ status: 'refunded' }).eq('id', payment.id);
      }
    }
  }
}
```

- [ ] **Step 5: Run purchase and refund tests**

Run: `pnpm supabase:reset && pnpm vitest run tests/unit/credits.test.ts tests/integration/credit-purchase.test.ts tests/integration/credit-refund.test.ts && pnpm typecheck`

Expected: each purchase adds the exact package once, duplicate events add nothing, a fully unused pack can be refunded once, and a pack with any spent credits returns `used_credits_non_refundable` without changing the ledger.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_business_functions.sql src tests
git commit -m "feat: add employer credit purchases and refunds"
```

---

### Task 11: Implement approved-employer candidate search and atomic permanent unlocks

**Files:**
- Modify: `supabase/migrations/0003_business_functions.sql`
- Create: `src/services/unlock-service.ts`
- Modify: `src/routes/employer.tsx`
- Create: `tests/unit/anonymization.test.ts`
- Create: `tests/integration/paid-unlock.test.ts`
- Create: `tests/integration/candidate-privacy.test.ts`

**Interfaces:**
- Consumes: approved employer, searchable verified candidate, wallet, applications, private resume file.
- Produces: `search_candidates` RPC, `unlock_candidate` RPC, `anonymizedName`, candidate search/detail routes, and signed PDF access after authorization.

- [ ] **Step 1: Write failing anonymization tests**

```ts
// tests/unit/anonymization.test.ts
import { describe, expect, it } from 'vitest';
import { anonymizedName } from '../../src/services/unlock-service';

describe('anonymizedName', () => {
  it('returns initials without exposing full name', () => {
    expect(anonymizedName('Emma Rose Carter')).toBe('E. C.');
    expect(anonymizedName('Victor')).toBe('V.');
  });
});
```

- [ ] **Step 2: Implement secure search and atomic unlock RPCs**

```sql
-- append to supabase/migrations/0003_business_functions.sql
create or replace function public.search_candidates(
  p_query text default null,
  p_country public.country_code default null,
  p_state text default null,
  p_city text default null,
  p_min_years integer default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  candidate_id uuid, initials text, headline text, summary text, years_experience integer,
  city text, state_province text, country public.country_code, work_authorization text, skills text[]
) language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.employer_profiles where user_id = auth.uid() and review_status = 'approved') then raise exception 'employer_not_approved'; end if;
  return query
  select cp.user_id,
    concat(left(split_part(cp.full_name, ' ', 1), 1), '. ', case when position(' ' in cp.full_name) > 0 then concat(left(regexp_replace(cp.full_name, '^.* ', ''), 1), '.') else '' end),
    cp.headline, cp.summary, cp.years_experience, cp.city, cp.state_province, cp.country, cp.work_authorization,
    coalesce(array_agg(distinct cs.skill_name) filter (where cs.skill_name is not null), '{}')
  from public.candidate_profiles cp left join public.candidate_skills cs on cs.candidate_id = cp.user_id
  where cp.searchable and cp.identity_status = 'verified'
    and (p_country is null or cp.country = p_country)
    and (p_state is null or cp.state_province ilike p_state)
    and (p_city is null or cp.city ilike p_city)
    and (p_min_years is null or cp.years_experience >= p_min_years)
    and (p_query is null or cp.headline ilike '%' || p_query || '%' or cp.summary ilike '%' || p_query || '%' or cs.skill_name ilike '%' || p_query || '%')
  group by cp.user_id limit least(p_limit, 50) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.unlock_candidate(p_candidate_id uuid)
returns table (source public.unlock_source, available_credits integer)
language plpgsql security definer set search_path = public as $$
declare v_wallet public.credit_wallets; v_tx uuid;
begin
  if not exists (select 1 from public.employer_profiles where user_id = auth.uid() and review_status = 'approved') then raise exception 'employer_not_approved'; end if;
  if exists (select 1 from public.contact_unlocks where employer_id = auth.uid() and candidate_id = p_candidate_id) then
    return query select cu.source, cw.available_credits from public.contact_unlocks cu join public.credit_wallets cw on cw.employer_id = cu.employer_id where cu.employer_id = auth.uid() and cu.candidate_id = p_candidate_id;
    return;
  end if;
  if exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.candidate_id = p_candidate_id and j.employer_id = auth.uid()) then
    insert into public.contact_unlocks (employer_id, candidate_id, source) values (auth.uid(), p_candidate_id, 'application') on conflict do nothing;
    return query select 'application'::public.unlock_source, cw.available_credits from public.credit_wallets cw where cw.employer_id = auth.uid();
    return;
  end if;
  select * into v_wallet from public.credit_wallets where employer_id = auth.uid() for update;
  if v_wallet.available_credits < 1 then raise exception 'insufficient_credits'; end if;
  update public.credit_wallets set available_credits = available_credits - 1, used_credits = used_credits + 1, updated_at = now() where employer_id = auth.uid();
  insert into public.credit_transactions (employer_id, type, quantity) values (auth.uid(), 'unlock', -1) returning id into v_tx;
  insert into public.contact_unlocks (employer_id, candidate_id, source, credit_transaction_id) values (auth.uid(), p_candidate_id, 'paid_search', v_tx);
  return query select 'paid_search'::public.unlock_source, cw.available_credits from public.credit_wallets cw where cw.employer_id = auth.uid();
end;
$$;
```

- [ ] **Step 3: Implement authorized detail loading and PDF signing**

```ts
// src/services/unlock-service.ts
import type { AppContext } from '../lib/supabase';
import { createResumeSignedUrl } from '../lib/signed-files';
import { getServiceClient, getUserClient } from '../lib/supabase';

export const anonymizedName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/);
  return parts.length === 1 ? `${parts[0]![0]!.toUpperCase()}.` : `${parts[0]![0]!.toUpperCase()}. ${parts.at(-1)![0]!.toUpperCase()}.`;
};

export const unlockCandidate = async (c: AppContext, candidateId: string) => {
  const client = getUserClient(c);
  const { data, error } = await client.rpc('unlock_candidate', { p_candidate_id: candidateId });
  if (error) throw error;
  return data[0];
};

export const getAuthorizedCandidate = async (c: AppContext, employerId: string, candidateId: string) => {
  const service = getServiceClient(c);
  const { data: unlock } = await service.from('contact_unlocks').select('source').eq('employer_id', employerId).eq('candidate_id', candidateId).single();
  if (!unlock) return null;
  const { data: profile } = await service.from('candidate_profiles').select('user_id,full_name,phone,headline,summary,city,state_province,country,years_experience,work_authorization,users!inner(email)').eq('user_id', candidateId).single();
  const { data: file } = await service.from('resume_files').select('storage_path').eq('candidate_id', candidateId).maybeSingle();
  return profile ? { ...profile, pdfUrl: file ? await createResumeSignedUrl(c, file.storage_path) : null } : null;
};
```

- [ ] **Step 4: Add employer search, unlock, and detail endpoints**

```tsx
// src/routes/employer.tsx additions
import { getAuthorizedCandidate, unlockCandidate } from '../services/unlock-service';

employerRoutes.get('/unlocked', async (c) => {
  const employerId = c.get('sessionUser')!.id;
  const service = getServiceClient(c);
  const { data, error } = await service.from('contact_unlocks').select('candidate_id,source,unlocked_at,candidate_profiles!inner(full_name,headline,city,state_province,country)').eq('employer_id', employerId).order('unlocked_at', { ascending: false });
  return error ? c.json({ error: 'unlocked_candidates_unavailable' }, 500) : c.json({ candidates: data });
});

employerRoutes.get('/candidates', async (c) => {
  const client = getUserClient(c);
  const q = c.req.query('q') || null;
  const { data, error } = await client.rpc('search_candidates', { p_query: q, p_limit: 20, p_offset: 0 });
  return error ? c.json({ error: error.message }, 403) : c.json({ candidates: data });
});

employerRoutes.post('/candidates/:id/unlock', async (c) => {
  try {
    const result = await unlockCandidate(c, c.req.param('id'));
    return c.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unlock_failed';
    return c.json({ error: message }, message.includes('insufficient_credits') ? 402 : 400);
  }
});

employerRoutes.get('/candidates/:id', async (c) => {
  const data = await getAuthorizedCandidate(c, c.get('sessionUser')!.id, c.req.param('id'));
  return data ? c.json({ candidate: data }) : c.json({ error: 'candidate_locked' }, 403);
});
```

- [ ] **Step 5: Verify privacy and concurrency**

Run: `pnpm supabase:reset && pnpm vitest run tests/unit/anonymization.test.ts tests/integration/paid-unlock.test.ts tests/integration/candidate-privacy.test.ts`

Expected: pending employers and visitors receive no candidate rows; 20 concurrent unlock calls spend exactly one credit; repeat access returns full details without another charge.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_business_functions.sql src tests
git commit -m "feat: add private candidate search and permanent unlocks"
```

---

### Task 12: Add administration, reports, suspension, and auditable sensitive actions

**Files:**
- Create: `src/lib/audit.ts`
- Modify: `src/routes/admin.tsx`
- Modify: `src/routes/public.tsx`
- Create: `tests/unit/audit.test.ts`
- Create: `tests/integration/admin-security.test.ts`

**Interfaces:**
- Consumes: admin role, `audit_logs`, `reports`, user/employer/job statuses.
- Produces: `recordAudit`, admin moderation routes, user report route, and immutable audit records for sensitive actions.

- [ ] **Step 1: Write failing audit-shape test**

```ts
// tests/unit/audit.test.ts
import { describe, expect, it } from 'vitest';
import { auditEntry } from '../../src/lib/audit';

describe('auditEntry', () => {
  it('serializes a stable action record', () => {
    expect(auditEntry('admin-1', 'employer.approved', 'employer', 'emp-1', { reason: 'verified' })).toEqual({
      actor_user_id: 'admin-1', action: 'employer.approved', target_type: 'employer', target_id: 'emp-1', metadata: { reason: 'verified' },
    });
  });
});
```

- [ ] **Step 2: Implement audit helper**

```ts
// src/lib/audit.ts
import type { AppContext } from './supabase';
import { getServiceClient } from './supabase';

export const auditEntry = (actorUserId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) => ({
  actor_user_id: actorUserId, action, target_type: targetType, target_id: targetId, metadata,
});

export const recordAudit = async (c: AppContext, actorUserId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) => {
  const service = getServiceClient(c);
  const { error } = await service.from('audit_logs').insert(auditEntry(actorUserId, action, targetType, targetId, metadata));
  if (error) throw error;
};
```

- [ ] **Step 3: Add moderation and report endpoints**

```tsx
// src/routes/admin.tsx additions
import { recordAudit } from '../lib/audit';
import { getServiceClient } from '../lib/supabase';

adminRoutes.post('/users/:id/suspend', async (c) => {
  const admin = c.get('sessionUser')!;
  const service = getServiceClient(c);
  await service.from('users').update({ status: 'suspended' }).eq('id', c.req.param('id'));
  await recordAudit(c, admin.id, 'user.suspended', 'user', c.req.param('id'), {});
  return c.json({ ok: true });
});

adminRoutes.post('/jobs/:id/remove', async (c) => {
  const admin = c.get('sessionUser')!;
  const service = getServiceClient(c);
  await service.from('jobs').update({ status: 'removed' }).eq('id', c.req.param('id'));
  await recordAudit(c, admin.id, 'job.removed', 'job', c.req.param('id'), {});
  return c.json({ ok: true });
});

adminRoutes.post('/reports/:id/resolve', async (c) => {
  const admin = c.get('sessionUser')!;
  const body = await c.req.parseBody();
  const status = body.status === 'dismissed' ? 'dismissed' : 'resolved';
  const service = getServiceClient(c);
  await service.from('reports').update({ status, resolved_at: new Date().toISOString() }).eq('id', c.req.param('id'));
  await recordAudit(c, admin.id, `report.${status}`, 'report', c.req.param('id'), {});
  return c.json({ ok: true });
});
```

```tsx
// src/routes/public.tsx addition
publicRoutes.post('/reports', async (c) => {
  const user = c.get('sessionUser');
  if (!user) return c.json({ error: 'authentication_required' }, 401);
  const body = await c.req.parseBody();
  const service = getServiceClient(c);
  const { error } = await service.from('reports').insert({ reporter_user_id: user.id, target_type: String(body.targetType), target_id: String(body.targetId), reason: String(body.reason) });
  return error ? c.json({ error: 'report_failed' }, 400) : c.json({ ok: true }, 201);
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/unit/audit.test.ts tests/integration/admin-security.test.ts && pnpm typecheck`

Expected: non-admins cannot access admin routes, suspended employers lose privileged access, and each moderation action creates an audit row.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add administration and audit trails"
```

---

### Task 13: Implement account deletion, restoration, job expiry, and document cleanup

**Files:**
- Create: `supabase/migrations/0004_cleanup_jobs.sql`
- Create: `src/services/cleanup-service.ts`
- Modify: `src/lib/supabase.ts`
- Modify: `src/routes/candidate.tsx`
- Modify: `src/index.tsx`
- Modify: `tests/unit/health.test.ts`
- Create: `tests/unit/deletion.test.ts`
- Create: `tests/integration/cleanup.test.ts`

**Interfaces:**
- Consumes: `account_deletion_requests`, storage paths, employer document retention fields, Worker daily cron.
- Produces: `requestCandidateDeletion`, `restoreCandidateAccount`, `runDailyCleanup`, scheduled handler, and deletion audit results.

- [ ] **Step 1: Write failing retention tests**

```ts
// tests/unit/deletion.test.ts
import { describe, expect, it } from 'vitest';
import { restoreDeadline } from '../../src/services/cleanup-service';

describe('restoreDeadline', () => {
  it('returns exactly thirty days after request', () => {
    expect(restoreDeadline(new Date('2026-07-13T12:00:00Z')).toISOString()).toBe('2026-08-12T12:00:00.000Z');
  });
});
```

- [ ] **Step 2: Add cleanup SQL functions**

```sql
-- supabase/migrations/0004_cleanup_jobs.sql
create or replace function public.expire_jobs()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.jobs set status = 'expired', updated_at = now() where status = 'published' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.complete_candidate_deletions()
returns table (user_id uuid, resume_path text) language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select adr.user_id from public.account_deletion_requests adr where adr.completed_at is null and adr.restore_until <= now()
  ), files as (
    select rf.candidate_id, rf.storage_path from public.resume_files rf join due on due.user_id = rf.candidate_id
  ), deleted_profiles as (
    delete from public.candidate_profiles cp using due where cp.user_id = due.user_id returning cp.user_id
  )
  update public.account_deletion_requests adr set completed_at = now() from due where adr.user_id = due.user_id
  returning adr.user_id, (select storage_path from files where files.candidate_id = adr.user_id limit 1);
end;
$$;

create or replace function public.documents_due_for_deletion()
returns table (document_id uuid, storage_path text) language sql security definer set search_path = public as $$
  select id, storage_path from public.employer_documents where delete_after <= now() and legal_hold = false;
$$;
```

- [ ] **Step 3: Implement cleanup service and candidate deletion API**

```ts
// src/services/cleanup-service.ts
import type { Bindings } from '../env';
import { jobExpiryEmail, sendEmailWithEnv } from '../lib/email';
import type { AppContext } from '../lib/supabase';
import { getServiceClient, getServiceClientFromEnv } from '../lib/supabase';

export const restoreDeadline = (requestedAt: Date) => new Date(requestedAt.getTime() + 30 * 86400000);

export const requestCandidateDeletion = async (c: AppContext, userId: string) => {
  const service = getServiceClient(c);
  const now = new Date();
  await service.from('users').update({ status: 'disabled' }).eq('id', userId);
  await service.from('account_deletion_requests').upsert({ user_id: userId, requested_at: now.toISOString(), restore_until: restoreDeadline(now).toISOString(), completed_at: null });
};

export const restoreCandidateAccount = async (c: AppContext, userId: string) => {
  const service = getServiceClient(c);
  const { data } = await service.from('account_deletion_requests').select('restore_until,completed_at').eq('user_id', userId).single();
  if (!data || data.completed_at || new Date(data.restore_until) <= new Date()) throw new Error('restoration_window_closed');
  await service.from('users').update({ status: 'active' }).eq('id', userId);
  await service.from('account_deletion_requests').delete().eq('user_id', userId);
};

export const runDailyCleanup = async (env: Bindings) => {
  const service = getServiceClientFromEnv(env);
  const { data: documents, error: documentError } = await service.rpc('documents_due_for_deletion');
  if (documentError) throw documentError;
  for (const document of documents ?? []) {
    const { error: storageError } = await service.storage.from('employer-documents').remove([document.storage_path]);
    if (storageError) throw storageError;
    const { error: rowError } = await service.from('employer_documents').delete().eq('id', document.document_id);
    if (rowError) throw rowError;
  }
  const { data: candidates, error: candidateError } = await service.rpc('complete_candidate_deletions');
  if (candidateError) throw candidateError;
  for (const candidate of candidates ?? []) {
    if (candidate.resume_path) {
      const { error } = await service.storage.from('resume-pdfs').remove([candidate.resume_path]);
      if (error) throw error;
    }
    const anonymizedEmail = `deleted+${candidate.user_id}@invalid.example`;
    const { error: userError } = await service.from('users').update({ email: anonymizedEmail }).eq('id', candidate.user_id);
    if (userError) throw userError;
    const { error: authError } = await service.auth.admin.updateUserById(candidate.user_id, { email: anonymizedEmail, ban_duration: '876000h' });
    if (authError) throw authError;
  }
  const reminderStart = new Date(Date.now() + 3 * 86400000).toISOString();
  const reminderEnd = new Date(Date.now() + 4 * 86400000).toISOString();
  const { data: expiringJobs, error: reminderError } = await service.from('jobs').select('title,expires_at,employer_profiles!inner(company_email)').eq('status', 'published').gte('expires_at', reminderStart).lt('expires_at', reminderEnd);
  if (reminderError) throw reminderError;
  await Promise.all((expiringJobs ?? []).map((job) => sendEmailWithEnv(env, jobExpiryEmail(job.employer_profiles.company_email, job.title, job.expires_at!))));
  const { data: expiredCount, error: expiryError } = await service.rpc('expire_jobs');
  if (expiryError) throw expiryError;
  return {
    deletedEmployerDocuments: documents?.length ?? 0,
    completedCandidateDeletions: candidates?.length ?? 0,
    expiredJobs: expiredCount ?? 0,
  };
};
```

```tsx
// src/routes/candidate.tsx additions
import { requestCandidateDeletion, restoreCandidateAccount } from '../services/cleanup-service';

candidateRoutes.post('/delete-account', async (c) => {
  await requestCandidateDeletion(c, c.get('sessionUser')!.id);
  return c.json({ ok: true, restoreDays: 30 });
});

```

```tsx
// src/routes/auth.tsx addition; this route intentionally bypasses the active-status role guard
import { restoreCandidateAccount } from '../services/cleanup-service';

authRoutes.post('/restore-account', async (c) => {
  const user = c.get('sessionUser');
  if (!user || user.role !== 'candidate' || user.status !== 'disabled') return c.json({ error: 'disabled_candidate_required' }, 403);
  try {
    await restoreCandidateAccount(c, user.id);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'restoration_window_closed' }, 400);
  }
});
```

- [ ] **Step 4: Add a service client that can run from cron and export the Worker handlers**

```ts
// src/lib/supabase.ts addition
export const getServiceClientFromEnv = (env: Bindings) => createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
```

```tsx
// src/index.tsx complete export shape after this task
import { Hono } from 'hono';
import type { ExportedHandler } from '@cloudflare/workers-types';
import type { Bindings } from './env';
import { authMiddleware } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { publicRoutes } from './routes/public';
import { candidateRoutes } from './routes/candidate';
import { employerRoutes } from './routes/employer';
import { adminRoutes } from './routes/admin';
import { webhookRoutes } from './routes/webhooks';
import { runDailyCleanup } from './services/cleanup-service';
import type { AppVariables } from './types/app';

export const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
app.use('*', authMiddleware);
app.route('/webhooks', webhookRoutes);
app.get('/health', (c) => c.json({ ok: true, service: 'resume-marketplace' }));
app.route('/auth', authRoutes);
app.route('/candidate', candidateRoutes);
app.route('/employer', employerRoutes);
app.route('/admin', adminRoutes);
app.route('/', publicRoutes);

const worker: ExportedHandler<Bindings> = {
  fetch: app.fetch,
  scheduled: async (_controller, env, ctx) => {
    ctx.waitUntil(runDailyCleanup(env));
  },
};

export default worker;
```

```ts
// tests/unit/health.test.ts after the Worker default export changes
import { describe, expect, it } from 'vitest';
import { app } from '../../src/index';

describe('GET /health', () => {
  it('returns an explicit healthy response', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: 'resume-marketplace' });
  });
});
```

- [ ] **Step 5: Run cleanup tests**

Run: `pnpm supabase:reset && pnpm vitest run tests/unit/deletion.test.ts tests/integration/cleanup.test.ts`

Expected: account disable is immediate, restoration works before day 30, cleanup removes due personal data and files after day 30, held employer files remain, and expired jobs stop accepting applications.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_cleanup_jobs.sql src tests
git commit -m "feat: add retention and deletion cleanup"
```

---

### Task 14: Add transactional email, CSRF checks, shared rate limits, and upload hardening

**Files:**
- Create: `supabase/migrations/0005_rate_limits.sql`
- Create: `src/lib/email.ts`
- Create: `src/lib/file-validation.ts`
- Create: `src/middleware/csrf.ts`
- Create: `src/middleware/rate-limit.ts`
- Create: `src/middleware/turnstile.ts`
- Modify: `src/index.tsx`
- Modify: `src/routes/auth.tsx`
- Modify: `src/routes/candidate.tsx`
- Modify: `src/routes/employer.tsx`
- Modify: `src/routes/public.tsx`
- Modify: `src/routes/webhooks.ts`
- Modify: `src/services/application-service.ts`
- Modify: `src/services/cleanup-service.ts`
- Modify: `src/services/employer-service.ts`
- Create: `tests/unit/csrf.test.ts`
- Create: `tests/unit/rate-limit.test.ts`
- Create: `tests/unit/file-validation.test.ts`

**Interfaces:**
- Consumes: `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, authenticated users, hashed IP/user subjects, and private upload bytes.
- Produces: `sendEmail`, `queueEmail`, `csrfMiddleware`, `rateLimit`, `verifyTurnstile`, `validateResumePdf`, `validateEmployerDocument`, and workflow notifications.

- [ ] **Step 1: Write failing origin, limit-window, and file-signature tests**

```ts
// tests/unit/csrf.test.ts
import { describe, expect, it } from 'vitest';
import { originAllowed } from '../../src/middleware/csrf';

describe('originAllowed', () => {
  it('accepts only the configured origin for unsafe methods', () => {
    expect(originAllowed('https://jobs.example.com', 'https://jobs.example.com')).toBe(true);
    expect(originAllowed('https://evil.example', 'https://jobs.example.com')).toBe(false);
  });
});
```

```ts
// tests/unit/rate-limit.test.ts
import { describe, expect, it } from 'vitest';
import { fixedWindowStart } from '../../src/middleware/rate-limit';

describe('fixedWindowStart', () => {
  it('groups requests into one-minute windows', () => {
    expect(fixedWindowStart(new Date('2026-07-13T00:00:59Z'), 60).toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });
});
```

```ts
// tests/unit/file-validation.test.ts
import { describe, expect, it } from 'vitest';
import { detectDocumentType } from '../../src/lib/file-validation';

describe('detectDocumentType', () => {
  it('detects PDF, PNG, and JPEG magic bytes', () => {
    expect(detectDocumentType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
    expect(detectDocumentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectDocumentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });
  it('rejects unknown signatures', () => expect(() => detectDocumentType(new Uint8Array([1, 2, 3, 4]))).toThrow('unsupported_file_signature'));
});
```

- [ ] **Step 2: Add a shared PostgreSQL fixed-window limiter**

```sql
-- supabase/migrations/0005_rate_limits.sql
create table public.rate_limit_windows (
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null,
  primary key (scope, subject_hash, window_start)
);

alter table public.rate_limit_windows enable row level security;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_window_start timestamptz,
  p_window_seconds integer,
  p_max_requests integer
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.rate_limit_windows (scope, subject_hash, window_start, request_count, expires_at)
  values (p_scope, p_subject_hash, p_window_start, 1, p_window_start + make_interval(secs => p_window_seconds))
  on conflict (scope, subject_hash, window_start)
  do update set request_count = rate_limit_windows.request_count + 1
  returning request_count into v_count;
  return v_count <= p_max_requests;
end;
$$;

create or replace function public.delete_expired_rate_limits()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from public.rate_limit_windows where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
```

- [ ] **Step 3: Implement CSRF and database-backed rate-limit middleware**

```ts
// src/middleware/csrf.ts
import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../env';
import type { AppVariables } from '../types/app';

export const originAllowed = (origin: string | undefined, appOrigin: string) => origin === appOrigin;

export const csrfMiddleware: MiddlewareHandler<{ Bindings: Bindings; Variables: AppVariables }> = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  if (c.req.path.startsWith('/webhooks/')) return next();
  if (!originAllowed(c.req.header('origin'), c.env.APP_ORIGIN)) return c.json({ error: 'invalid_origin' }, 403);
  await next();
};
```

```ts
// src/middleware/rate-limit.ts
import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import type { AppVariables } from '../types/app';

export const fixedWindowStart = (now: Date, seconds: number) => new Date(Math.floor(now.getTime() / 1000 / seconds) * seconds * 1000);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const rateLimit = (
  scope: string,
  maxRequests: number,
  windowSeconds: number,
  subject: 'ip' | 'user',
): MiddlewareHandler<{ Bindings: Bindings; Variables: AppVariables }> => async (c, next) => {
  const rawSubject = subject === 'user'
    ? c.get('sessionUser')?.id ?? 'anonymous'
    : c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const subjectHash = await sha256(rawSubject);
  const service = getServiceClient(c);
  const { data, error } = await service.rpc('consume_rate_limit', {
    p_scope: scope,
    p_subject_hash: subjectHash,
    p_window_start: fixedWindowStart(new Date(), windowSeconds).toISOString(),
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });
  if (error) return c.json({ error: 'rate_limit_unavailable' }, 503);
  if (!data) return c.json({ error: 'rate_limit_exceeded' }, 429);
  await next();
};
```

```ts
// src/middleware/turnstile.ts
import type { AppContext } from '../lib/supabase';

export const verifyTurnstile = async (c: AppContext, token: string) => {
  if (!token) return false;
  const body = new URLSearchParams({
    secret: c.env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: c.req.header('cf-connecting-ip') ?? '',
  });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!response.ok) return false;
  const result = await response.json<{ success: boolean }>();
  return result.success;
};
```

- [ ] **Step 4: Implement signature-based upload validation**

```ts
// src/lib/file-validation.ts
export const detectDocumentType = (bytes: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' => {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  throw new Error('unsupported_file_signature');
};

export const validateResumePdf = async (file: File) => {
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('invalid_resume_size');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (detectDocumentType(bytes) !== 'application/pdf') throw new Error('resume_must_be_pdf');
  return bytes;
};

export const validateEmployerDocument = async (file: File) => {
  if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('invalid_employer_document_size');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = detectDocumentType(bytes);
  return { bytes, detectedType };
};
```

```ts
// src/services/candidate-service.ts replacement for replaceResumePdf
import { validateResumePdf } from '../lib/file-validation';

export const replaceResumePdf = async (c: AppContext, candidateId: string, file: File) => {
  const bytes = await validateResumePdf(file);
  const service = getServiceClient(c);
  const path = `${candidateId}/resume.pdf`;
  const { error: uploadError } = await service.storage.from('resume-pdfs').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;
  return service.from('resume_files').upsert({
    candidate_id: candidateId,
    storage_path: path,
    original_filename: file.name,
    mime_type: 'application/pdf',
    size_bytes: file.size,
  });
};
```

```ts
// src/services/employer-service.ts replacement for submitEmployerReview
import { employerSubmissionEmail, queueEmail } from '../lib/email';
import { validateEmployerDocument } from '../lib/file-validation';

export const submitEmployerReview = async (c: AppContext, employerId: string, raw: unknown, file: File) => {
  const input = employerSchema.parse(raw);
  const { bytes, detectedType } = await validateEmployerDocument(file);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const service = getServiceClient(c);
  const path = `${employerId}/${crypto.randomUUID()}`;
  const { error: uploadError } = await service.storage.from('employer-documents').upload(path, bytes, { contentType: detectedType });
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
  if (profileError) throw profileError;
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
```

- [ ] **Step 5: Implement queued transactional notifications**

```ts
// src/lib/email.ts
import type { Bindings } from '../env';
import type { AppContext } from './supabase';

export type EmailMessage = { to: string; subject: string; text: string };

export const sendEmailWithEnv = async (env: Bindings, message: EmailMessage) => {
  const response = await fetch(env.EMAIL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
  });
  if (!response.ok) throw new Error(`email_failed:${response.status}`);
};

export const sendEmail = async (c: AppContext, message: EmailMessage) => sendEmailWithEnv(c.env, message);

export const queueEmail = (c: AppContext, message: EmailMessage) => {
  c.executionCtx.waitUntil(sendEmail(c, message).catch((error) => console.error('transactional_email_failed', error)));
};

export const applicationEmail = (to: string, jobTitle: string) => ({
  to, subject: `New application for ${jobTitle}`, text: `A verified candidate applied to ${jobTitle}. Sign in to view the application and contact details.`,
});

export const reviewEmail = (to: string, status: 'approved' | 'rejected', reason?: string) => ({
  to, subject: `Employer account ${status}`, text: status === 'approved' ? 'Your employer account is approved. You may now publish jobs and search candidates.' : `Your employer submission was rejected. Reason: ${reason ?? 'Registration could not be verified.'}`,
});

export const identityEmail = (to: string, status: 'verified' | 'requires_input') => ({
  to, subject: status === 'verified' ? 'Identity verified' : 'Identity verification needs attention', text: status === 'verified' ? 'Your identity is verified. You may now publish your resume and apply to jobs.' : 'Your identity verification needs more information. Sign in to resume the same verification session.',
});

export const creditReceiptEmail = (to: string, credits: number) => ({
  to, subject: `${credits} lookup credits added`, text: `${credits} lookup credits were added to your employer account. Credits do not expire.`,
});

export const employerSubmissionEmail = (to: string) => ({
  to, subject: 'Employer review submitted', text: 'Your employer verification documents were received. An administrator will review the submission before publishing and candidate-search access is enabled.',
});

export const identityFeeReceiptEmail = (to: string) => ({
  to, subject: 'Identity verification payment received', text: 'Your $2.49 USD identity-verification payment was received. Continue the same verification flow from your candidate account.',
});

export const jobExpiryEmail = (to: string, title: string, expiresAt: string) => ({
  to, subject: `${title} expires soon`, text: `Your job post ${title} expires at ${expiresAt}. Renew it free from the employer dashboard to keep accepting applications.`,
});

export const deletionEmail = (to: string, restoreUntil: string) => ({
  to, subject: 'Account deletion requested', text: `Your account is disabled. You may restore it until ${restoreUntil}; after that date, resume data and private files will be deleted.`,
});
```

- [ ] **Step 6: Attach exact limits and notifications to workflow routes**

Insert these middleware registrations immediately after each route object is created and before its handlers:

```ts
// src/routes/auth.tsx
import { rateLimit } from '../middleware/rate-limit';
authRoutes.use('/login', rateLimit('login', 10, 60, 'ip'));
authRoutes.use('/register/*', rateLimit('registration', 5, 3600, 'ip'));
```

```ts
// src/routes/candidate.tsx
candidateRoutes.use('/verification/checkout', rateLimit('identity_checkout', 5, 3600, 'user'));

```

```ts
// src/routes/employer.tsx
employerRoutes.use('/onboarding', rateLimit('employer_submission', 3, 86400, 'user'));
employerRoutes.use('/jobs', rateLimit('job_write', 30, 3600, 'user'));
employerRoutes.use('/candidates', rateLimit('candidate_search', 120, 3600, 'user'));
employerRoutes.use('/candidates/*/unlock', rateLimit('candidate_unlock', 60, 3600, 'user'));
employerRoutes.use('/credits/checkout/*', rateLimit('credit_checkout', 10, 3600, 'user'));
```

```ts
// src/routes/public.tsx
publicRoutes.use('/reports', rateLimit('report', 10, 86400, 'user'));
```

Use `verifyTurnstile` in every bot-sensitive form handler after `parseBody()` and before creating accounts, uploads, or Checkout sessions:

```ts
// shared handler pattern in src/routes/auth.tsx, src/routes/candidate.tsx, and src/routes/employer.tsx
import { verifyTurnstile } from '../middleware/turnstile';

const turnstileToken = String(body['cf-turnstile-response'] ?? '');
if (!(await verifyTurnstile(c, turnstileToken))) return c.json({ error: 'bot_check_failed' }, 400);
```

Apply that exact check to candidate registration, employer registration, login, employer review submission, candidate identity-fee Checkout, and employer credit-pack Checkout. Add `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` plus `<div class="cf-turnstile" data-sitekey={c.env.TURNSTILE_SITE_KEY}></div>` to the corresponding HTML forms.

Add these imports to the files that send notifications:

```ts
import { applicationEmail, creditReceiptEmail, deletionEmail, identityEmail, queueEmail, reviewEmail } from '../lib/email';
```

Add the following calls after the corresponding database transaction succeeds:

```ts
// src/services/application-service.ts
const { data: employer } = await service.from('employer_profiles').select('company_email').eq('user_id', job.employer_id).single();
if (employer) queueEmail(c, applicationEmail(employer.company_email, job.title));
```

```ts
// src/services/employer-service.ts inside decideEmployerReview
const { data: employer } = await service.from('employer_profiles').select('company_email').eq('user_id', employerId).single();
if (employer) queueEmail(c, reviewEmail(employer.company_email, decision, reason));
```

```ts
// src/routes/webhooks.ts after Identity status persistence
const { data: candidateUser } = await service.from('users').select('email').eq('id', candidateId).single();
if (candidateUser) queueEmail(c, identityEmail(candidateUser.email, status));
```

```ts
// src/routes/webhooks.ts after grantPurchasedCredits
const credits = purpose === 'credit_pack_10' ? 10 : 25;
const { data: employerUser } = await service.from('users').select('email').eq('id', userId).single();
if (employerUser) queueEmail(c, creditReceiptEmail(employerUser.email, credits));
```

```ts
// src/routes/candidate.tsx after requestCandidateDeletion
const user = c.get('sessionUser')!;
const restoreUntil = new Date(Date.now() + 30 * 86400000).toISOString();
queueEmail(c, deletionEmail(user.email, restoreUntil));
```

- [ ] **Step 7: Register CSRF after webhooks and include rate-limit cleanup in the daily job**

```tsx
// src/index.tsx ordering
app.use('*', authMiddleware);
app.route('/webhooks', webhookRoutes);
app.use('*', csrfMiddleware);
```

```ts
// src/services/cleanup-service.ts before returning the cleanup summary
const { error: rateLimitCleanupError } = await service.rpc('delete_expired_rate_limits');
if (rateLimitCleanupError) throw rateLimitCleanupError;
```

- [ ] **Step 8: Run migrations and hardening tests**

Run: `pnpm supabase:reset && pnpm vitest run tests/unit/csrf.test.ts tests/unit/rate-limit.test.ts tests/unit/file-validation.test.ts && pnpm typecheck && pnpm build`

Expected: unsafe cross-origin posts fail, Stripe webhooks remain reachable, shared counters reject excessive requests across Worker instances, and mislabeled uploads fail magic-byte validation.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0005_rate_limits.sql src tests
git commit -m "feat: harden forms uploads and notifications"
```

---

### Task 15: Add end-to-end coverage, operational documentation, and remote deployment

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/candidate-flow.spec.ts`
- Create: `tests/e2e/employer-flow.spec.ts`
- Create: `tests/e2e/deletion-flow.spec.ts`
- Create: `src/routes/test-support.ts`
- Modify: `src/env.ts`
- Modify: `.dev.vars.example`
- Modify: `src/index.tsx`
- Create: `docs/operations.md`
- Create: `docs/security.md`
- Create: `docs/launch-checklist.md`
- Modify: `wrangler.jsonc`
- Modify: `package.json`

**Interfaces:**
- Consumes: all completed routes, Supabase remote project, Stripe test mode, email sandbox, Cloudflare account.
- Produces: repeatable deployment runbook, acceptance tests, remote staging environment, and explicit launch gates.

- [ ] **Step 1: Configure Playwright against a remote or local Worker**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
```

- [ ] **Step 2: Add a staging-only authenticated fixture route for browser tests**

```tsx
// src/routes/test-support.ts
import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { Bindings } from '../env';
import { getServiceClient } from '../lib/supabase';
import type { AppVariables } from '../types/app';
import type { Database } from '../types/database';

export const testSupportRoutes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

testSupportRoutes.post('/session', async (c) => {
  if (!c.env.E2E_TEST_TOKEN || c.req.header('x-e2e-test-token') !== c.env.E2E_TEST_TOKEN) return c.notFound();
  const body = await c.req.json<{ fixture: 'verified-candidate' | 'approved-employer-with-10-credits' }>();
  const service = getServiceClient(c);
  const email = `${body.fixture}-${crypto.randomUUID()}@example.test`;
  const password = 'Long-test-password-123!';
  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) return c.json({ error: 'fixture_user_failed' }, 500);
  const role = body.fixture === 'verified-candidate' ? 'candidate' : 'employer';
  await service.from('users').insert({ id: created.user.id, email, role, status: 'active', country: 'US' });
  if (role === 'candidate') {
    await service.from('candidate_profiles').insert({ user_id: created.user.id, full_name: 'Emma Carter', city: 'Seattle', state_province: 'WA', country: 'US', headline: 'Operations Coordinator', summary: '', years_experience: 5, work_authorization: 'Authorized to work in the United States', searchable: true, identity_status: 'verified', identity_verified_at: new Date().toISOString(), date_of_birth_confirmed: true });
    const ownerEmail = `job-owner-${crypto.randomUUID()}@example.test`;
    const { data: owner } = await service.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
    if (!owner.user) return c.json({ error: 'fixture_job_owner_failed' }, 500);
    await service.from('users').insert({ id: owner.user.id, email: ownerEmail, role: 'employer', status: 'active', country: 'US' });
    await service.from('employer_profiles').insert({ user_id: owner.user.id, company_name: 'Job Fixture Company', website: 'https://example.test', company_email: ownerEmail, registration_number: 'TEST-JOB', country: 'US', review_status: 'approved', reviewed_at: new Date().toISOString() });
    await service.from('jobs').insert({ employer_id: owner.user.id, slug: `operations-assistant-${crypto.randomUUID().slice(0, 8)}`, title: 'Operations Assistant', description: 'Coordinate daily operations.', city: 'Seattle', state_province: 'WA', country: 'US', employment_type: 'Full time', workplace_type: 'On site', status: 'published', published_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
  } else {
    await service.from('employer_profiles').insert({ user_id: created.user.id, company_name: 'Fixture Company', website: 'https://example.test', company_email: email, registration_number: 'TEST-1', country: 'US', review_status: 'approved', reviewed_at: new Date().toISOString() });
    await service.from('credit_wallets').insert({ employer_id: created.user.id, available_credits: 10, purchased_credits: 10, used_credits: 0 });
    const candidateEmail = `searchable-candidate-${crypto.randomUUID()}@example.test`;
    const { data: candidate } = await service.auth.admin.createUser({ email: candidateEmail, password, email_confirm: true });
    if (!candidate.user) return c.json({ error: 'fixture_candidate_failed' }, 500);
    await service.from('users').insert({ id: candidate.user.id, email: candidateEmail, role: 'candidate', status: 'active', country: 'US' });
    await service.from('candidate_profiles').insert({ user_id: candidate.user.id, full_name: 'Emma Carter', city: 'Seattle', state_province: 'WA', country: 'US', headline: 'Operations Coordinator', summary: 'Experienced operations professional.', years_experience: 5, work_authorization: 'Authorized to work in the United States', searchable: true, identity_status: 'verified', identity_verified_at: new Date().toISOString(), date_of_birth_confirmed: true });
  }
  const anon = createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  const { data: sessionData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData.session) return c.json({ error: 'fixture_sign_in_failed' }, 500);
  setCookie(c, 'sb-access-token', sessionData.session.access_token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 3600 });
  setCookie(c, 'sb-refresh-token', sessionData.session.refresh_token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 3600 });
  return c.json({ ok: true, userId: created.user.id, email });
});
```

```tsx
// src/index.tsx registration; the route returns 404 unless E2E_TEST_TOKEN is configured
import { testSupportRoutes } from './routes/test-support';
app.route('/test-support', testSupportRoutes);
```

- [ ] **Step 3: Write the candidate acceptance journey**

```ts
// tests/e2e/candidate-flow.spec.ts
import { expect, test } from '@playwright/test';

test('verified candidate creates a resume and applies', async ({ page }) => {
  const fixture = await page.request.post('/test-support/session', {
    data: { fixture: 'verified-candidate' },
    headers: { 'x-e2e-test-token': process.env.E2E_TEST_TOKEN ?? '' },
  });
  expect(fixture.ok()).toBeTruthy();
  await page.goto('/candidate/resume');
  await page.getByLabel('Full name').fill('Emma Carter');
  await page.getByLabel('Headline').fill('Operations Coordinator');
  await page.getByRole('button', { name: 'Save resume' }).click();
  await page.goto('/jobs');
  await page.getByRole('link', { name: /Operations Assistant/ }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('body')).toContainText('\"ok\":true');
});
```

- [ ] **Step 4: Write the employer acceptance journey**

```ts
// tests/e2e/employer-flow.spec.ts
import { expect, test } from '@playwright/test';

test('approved employer posts a job and unlocks a candidate once', async ({ request }) => {
  const session = await request.post('/test-support/session', { data: { fixture: 'approved-employer-with-10-credits' }, headers: { 'x-e2e-test-token': process.env.E2E_TEST_TOKEN ?? '' } });
  expect(session.ok()).toBeTruthy();
  const draft = await request.post('/employer/jobs', { form: { title: 'Operations Assistant', description: 'Coordinate daily operations.', city: 'Seattle', stateProvince: 'WA', country: 'US', employmentType: 'Full time', workplaceType: 'On site' } });
  expect(draft.ok()).toBeTruthy();
  const { jobId } = await draft.json();
  expect((await request.post(`/employer/jobs/${jobId}/publish`)).ok()).toBeTruthy();
  const search = await request.get('/employer/candidates?q=operations', { headers: { Accept: 'application/json' } });
  const candidateId = (await search.json()).candidates[0].candidate_id;
  expect((await request.post(`/employer/candidates/${candidateId}/unlock`)).ok()).toBeTruthy();
  expect((await request.post(`/employer/candidates/${candidateId}/unlock`)).ok()).toBeTruthy();
  const wallet = await request.get('/employer/credits');
  expect((await wallet.json()).wallet.available_credits).toBe(9);
});
```

- [ ] **Step 5: Write operations and security runbooks**

```markdown
<!-- docs/operations.md -->
# Operations

## Environments
- Local: Supabase CLI, Stripe CLI test mode, Wrangler dev.
- Staging: separate Supabase project, Stripe test mode, Cloudflare staging Worker.
- Production: dedicated Supabase project, Stripe live mode, Cloudflare production Worker.

## Required secrets
Store secrets with `wrangler secret put`. Never commit service-role, Stripe, email, or cron secrets.

## Deployment order
1. Apply Supabase migrations.
2. Generate and commit database types.
3. Configure Stripe products, prices, Identity, and both webhook endpoints.
4. Configure email sender and domain.
5. Add Worker secrets.
6. Deploy staging and run Playwright.
7. Complete legal and security launch gates.
8. Deploy production.
```

```markdown
<!-- docs/launch-checklist.md -->
# Launch Checklist

- [ ] Qualified US/Canada legal review completed.
- [ ] Privacy, terms, identity consent, refund, retention, and deletion copy approved.
- [ ] Stripe live products and webhook signatures verified.
- [ ] Supabase RLS tests pass against production schema.
- [ ] Employer and resume storage buckets are private.
- [ ] Public candidate lookup returns no data.
- [ ] Malware scanning or a documented production upload-control decision is approved.
- [ ] Rate limiting uses a production-grade shared store.
- [ ] Backups, incident contacts, and deletion jobs are tested.
- [ ] All Playwright acceptance tests pass against staging.
- [ ] `E2E_TEST_TOKEN` is absent from production secrets and `/test-support/session` returns 404 in production.
```

- [ ] **Step 6: Configure and deploy the remote Supabase staging project**

Run after the user authorizes Supabase and provides a project reference:

```bash
pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF"
pnpm exec supabase db push
pnpm exec supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > src/types/database.ts
```

Expected: all four migrations are applied to the remote staging project and generated types match the schema.

- [ ] **Step 7: Configure Stripe test products and webhooks**

Create exactly three one-time prices in USD: 249 cents, 3000 cents, and 7500 cents. Configure Checkout and Identity webhooks to the staging Worker and store the resulting price IDs and webhook secrets using `wrangler secret put`.

- [ ] **Step 8: Deploy the Worker to Cloudflare staging**

Run after Cloudflare authorization:

```bash
pnpm check
pnpm wrangler deploy --env staging
E2E_BASE_URL="$STAGING_URL" E2E_TEST_TOKEN="$E2E_TEST_TOKEN" pnpm test:e2e
```

Expected: deployment exits with status 0 and all Playwright acceptance tests pass against the remote staging URL.

- [ ] **Step 9: Perform final verification**

Run:

```bash
pnpm supabase:reset
pnpm check
pnpm test:e2e
git status --short
```

Expected: all unit, integration, security, and end-to-end tests pass; production build succeeds; git working tree is clean.

- [ ] **Step 10: Commit**

```bash
git add playwright.config.ts tests/e2e docs wrangler.jsonc package.json pnpm-lock.yaml src/types/database.ts
git commit -m "test: add deployment and acceptance coverage"
```

---

## Execution Order and Review Gates

1. Tasks 1–3 establish the runtime, database, authentication, and permissions.
2. Tasks 4–6 deliver the public job site and verified candidate onboarding.
3. Tasks 7–9 deliver employer approval, job publishing, and free application unlocks.
4. Tasks 10–11 deliver paid credits, private candidate search, and atomic unlocks.
5. Tasks 12–14 deliver administration, retention, notifications, and abuse controls.
6. Task 15 deploys staging and proves the complete acceptance journeys.

After each task: run the task-specific tests, run `pnpm typecheck`, inspect the diff, and commit before starting the next task. Do not combine payment, authorization, or retention changes into a single unreviewed commit.
