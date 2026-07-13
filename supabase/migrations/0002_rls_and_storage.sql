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
alter table public.webhook_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.reports enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy users_read_self on public.users for select to authenticated using ((select auth.uid()) = id);
create policy candidate_profile_self_read on public.candidate_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy candidate_skills_self on public.candidate_skills for all to authenticated using ((select auth.uid()) = candidate_id) with check ((select auth.uid()) = candidate_id);
create policy candidate_experience_self on public.candidate_experience for all to authenticated using ((select auth.uid()) = candidate_id) with check ((select auth.uid()) = candidate_id);
create policy candidate_education_self on public.candidate_education for all to authenticated using ((select auth.uid()) = candidate_id) with check ((select auth.uid()) = candidate_id);
create policy resume_files_self_read on public.resume_files for select to authenticated using ((select auth.uid()) = candidate_id);
create policy employer_profile_self on public.employer_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy employer_documents_self on public.employer_documents for select to authenticated using ((select auth.uid()) = employer_id);
create policy jobs_public_read on public.jobs for select to anon, authenticated using (status = 'published' and expires_at > now());
create policy applications_candidate_read on public.applications for select to authenticated using ((select auth.uid()) = candidate_id);
create policy wallet_owner_read on public.credit_wallets for select to authenticated using ((select auth.uid()) = employer_id);
create policy transactions_owner_read on public.credit_transactions for select to authenticated using ((select auth.uid()) = employer_id);
create policy unlocks_owner_read on public.contact_unlocks for select to authenticated using ((select auth.uid()) = employer_id);
create policy payments_owner_read on public.payments for select to authenticated using ((select auth.uid()) = user_id);
create policy identity_owner_read on public.identity_verifications for select to authenticated using ((select auth.uid()) = candidate_id);
create policy deletion_owner_all on public.account_deletion_requests for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resume-pdfs', 'resume-pdfs', false, 5242880, array['application/pdf']),
  ('employer-documents', 'employer-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
