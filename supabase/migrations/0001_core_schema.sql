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
