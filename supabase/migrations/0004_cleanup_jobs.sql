create or replace function public.expire_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.jobs
  set status = 'expired', updated_at = now()
  where status = 'published' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.complete_candidate_deletions()
returns table (user_id uuid, resume_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  for v_request in
    select
      adr.user_id,
      rf.storage_path as resume_path
    from public.account_deletion_requests adr
    left join public.resume_files rf on rf.candidate_id = adr.user_id
    where adr.completed_at is null
      and adr.restore_until <= now()
    for update of adr
  loop
    delete from public.candidate_profiles
    where candidate_profiles.user_id = v_request.user_id;

    update public.account_deletion_requests
    set completed_at = now()
    where account_deletion_requests.user_id = v_request.user_id;

    user_id := v_request.user_id;
    resume_path := v_request.resume_path;
    return next;
  end loop;
end;
$$;

create or replace function public.documents_due_for_deletion()
returns table (document_id uuid, storage_path text)
language sql
security definer
set search_path = public
as $$
  select id, employer_documents.storage_path
  from public.employer_documents
  where delete_after <= now()
    and legal_hold = false;
$$;

revoke all on function public.expire_jobs() from public, anon, authenticated;
revoke all on function public.complete_candidate_deletions() from public, anon, authenticated;
revoke all on function public.documents_due_for_deletion() from public, anon, authenticated;
grant execute on function public.expire_jobs() to service_role;
grant execute on function public.complete_candidate_deletions() to service_role;
grant execute on function public.documents_due_for_deletion() to service_role;
