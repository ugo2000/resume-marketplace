create or replace function public.grant_credit_purchase(
  p_employer_id uuid,
  p_quantity integer,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantity not in (10, 25) then
    raise exception 'invalid credit quantity';
  end if;

  if exists (
    select 1 from public.credit_transactions
    where payment_id = p_payment_id and type = 'purchase'
  ) then
    return;
  end if;

  insert into public.credit_wallets (
    employer_id, available_credits, purchased_credits, used_credits
  )
  values (p_employer_id, p_quantity, p_quantity, 0)
  on conflict (employer_id) do update set
    available_credits = credit_wallets.available_credits + excluded.available_credits,
    purchased_credits = credit_wallets.purchased_credits + excluded.purchased_credits,
    updated_at = now();

  insert into public.credit_transactions (employer_id, type, quantity, payment_id)
  values (p_employer_id, 'purchase', p_quantity, p_payment_id);
end;
$$;

revoke all on function public.grant_credit_purchase(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.grant_credit_purchase(uuid, integer, uuid) to service_role;

create or replace function public.publish_job(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  v_count integer;
begin
  if not exists (
    select 1 from public.employer_profiles
    where user_id = auth.uid() and review_status = 'approved'
  ) then
    raise exception 'employer_not_approved';
  end if;

  select count(*) into v_count
  from public.jobs
  where employer_id = auth.uid()
    and status = 'published'
    and expires_at > now()
    and id <> p_job_id;

  if v_count >= 10 then
    raise exception 'active_job_limit';
  end if;

  update public.jobs
  set status = 'published',
      published_at = now(),
      expires_at = now() + interval '30 days',
      updated_at = now()
  where id = p_job_id and employer_id = auth.uid()
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job_not_found';
  end if;
  return v_job;
end;
$$;

create or replace function public.renew_job(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  v_count integer;
begin
  if not exists (
    select 1 from public.employer_profiles
    where user_id = auth.uid() and review_status = 'approved'
  ) then
    raise exception 'employer_not_approved';
  end if;

  select count(*) into v_count
  from public.jobs
  where employer_id = auth.uid()
    and status = 'published'
    and expires_at > now()
    and id <> p_job_id;

  if v_count >= 10 then
    raise exception 'active_job_limit';
  end if;

  update public.jobs
  set status = 'published',
      published_at = now(),
      expires_at = now() + interval '30 days',
      updated_at = now()
  where id = p_job_id and employer_id = auth.uid()
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job_not_found';
  end if;
  return v_job;
end;
$$;

revoke all on function public.publish_job(uuid) from public, anon;
revoke all on function public.renew_job(uuid) from public, anon;
grant execute on function public.publish_job(uuid) to authenticated;
grant execute on function public.renew_job(uuid) to authenticated;
