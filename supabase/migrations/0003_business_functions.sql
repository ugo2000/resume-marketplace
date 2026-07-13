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

create or replace function public.apply_to_job(
  p_job_id uuid,
  p_cover_note text default null
)
returns table(application_id uuid, employer_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_id uuid := auth.uid();
  v_employer_id uuid;
  v_application_id uuid;
begin
  if v_candidate_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1 from public.candidate_profiles
    where user_id = v_candidate_id
      and identity_status = 'verified'
      and date_of_birth_confirmed = true
  ) then
    raise exception 'candidate_not_verified';
  end if;

  select jobs.employer_id into v_employer_id
  from public.jobs
  where jobs.id = p_job_id
    and jobs.status = 'published'
    and jobs.expires_at > now()
  for update;

  if v_employer_id is null then
    raise exception 'job_not_open';
  end if;

  insert into public.applications (job_id, candidate_id, cover_note)
  values (p_job_id, v_candidate_id, nullif(trim(p_cover_note), ''))
  returning id into v_application_id;

  insert into public.contact_unlocks (
    employer_id, candidate_id, source, credit_transaction_id
  )
  values (v_employer_id, v_candidate_id, 'application', null)
  on conflict (employer_id, candidate_id) do nothing;

  return query select v_application_id, v_employer_id;
end;
$$;

revoke all on function public.apply_to_job(uuid, text) from public, anon;
grant execute on function public.apply_to_job(uuid, text) to authenticated;

create unique index if not exists credit_transactions_payment_type_unique
on public.credit_transactions (payment_id, type)
where payment_id is not null;

create or replace function public.can_refund_credit_purchase(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer uuid;
  v_quantity integer;
  v_available integer;
begin
  select ct.employer_id, ct.quantity
  into v_employer, v_quantity
  from public.credit_transactions ct
  where ct.payment_id = p_payment_id
    and ct.type = 'purchase';

  if v_employer is null then
    return false;
  end if;

  select available_credits
  into v_available
  from public.credit_wallets
  where employer_id = v_employer;

  return coalesce(v_available, 0) >= v_quantity
    and not exists (
      select 1
      from public.credit_transactions
      where payment_id = p_payment_id
        and type = 'refund'
    );
end;
$$;

create or replace function public.reserve_credit_refund(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer uuid;
  v_quantity integer;
  v_wallet public.credit_wallets;
begin
  if exists (
    select 1 from public.credit_transactions
    where payment_id = p_payment_id and type = 'refund'
  ) then
    return;
  end if;

  select employer_id, quantity
  into v_employer, v_quantity
  from public.credit_transactions
  where payment_id = p_payment_id and type = 'purchase';

  if v_employer is null then
    raise exception 'credit_purchase_not_found';
  end if;

  select * into v_wallet
  from public.credit_wallets
  where employer_id = v_employer
  for update;

  if v_wallet.employer_id is null then
    raise exception 'credit_wallet_not_found';
  end if;

  if v_wallet.available_credits < v_quantity then
    raise exception 'used_credits_non_refundable';
  end if;

  update public.credit_wallets
  set available_credits = available_credits - v_quantity,
      purchased_credits = purchased_credits - v_quantity,
      updated_at = now()
  where employer_id = v_employer;

  insert into public.credit_transactions (
    employer_id, type, quantity, payment_id, metadata
  )
  values (
    v_employer,
    'refund',
    -v_quantity,
    p_payment_id,
    jsonb_build_object('status', 'pending')
  );
end;
$$;

create or replace function public.cancel_credit_refund(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer uuid;
  v_quantity integer;
begin
  select employer_id, abs(quantity)
  into v_employer, v_quantity
  from public.credit_transactions
  where payment_id = p_payment_id
    and type = 'refund'
    and metadata ->> 'status' = 'pending'
  for update;

  if v_employer is null then
    return;
  end if;

  update public.credit_wallets
  set available_credits = available_credits + v_quantity,
      purchased_credits = purchased_credits + v_quantity,
      updated_at = now()
  where employer_id = v_employer;

  delete from public.credit_transactions
  where payment_id = p_payment_id
    and type = 'refund'
    and metadata ->> 'status' = 'pending';
end;
$$;

create or replace function public.refund_credit_purchase(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer uuid;
  v_quantity integer;
  v_refund_status text;
  v_wallet public.credit_wallets;
begin
  select employer_id, abs(quantity), metadata ->> 'status'
  into v_employer, v_quantity, v_refund_status
  from public.credit_transactions
  where payment_id = p_payment_id and type = 'refund'
  for update;

  if v_employer is not null and v_refund_status = 'completed' then
    return;
  end if;

  if v_employer is null then
    select employer_id, quantity
    into v_employer, v_quantity
    from public.credit_transactions
    where payment_id = p_payment_id and type = 'purchase';

    if v_employer is null then
      raise exception 'credit_purchase_not_found';
    end if;

    select * into v_wallet
    from public.credit_wallets
    where employer_id = v_employer
    for update;

    if v_wallet.employer_id is null then
      raise exception 'credit_wallet_not_found';
    end if;

    if v_wallet.available_credits < v_quantity then
      raise exception 'used_credits_non_refundable';
    end if;

    update public.credit_wallets
    set available_credits = available_credits - v_quantity,
        purchased_credits = purchased_credits - v_quantity,
        updated_at = now()
    where employer_id = v_employer;

    insert into public.credit_transactions (
      employer_id, type, quantity, payment_id, metadata
    )
    values (
      v_employer,
      'refund',
      -v_quantity,
      p_payment_id,
      jsonb_build_object('status', 'completed')
    )
    on conflict (payment_id, type) where payment_id is not null
    do update set metadata = jsonb_build_object('status', 'completed');
  else
    update public.credit_transactions
    set metadata = jsonb_build_object('status', 'completed')
    where payment_id = p_payment_id and type = 'refund';
  end if;

  update public.payments
  set status = 'refunded', updated_at = now()
  where id = p_payment_id;
end;
$$;

revoke all on function public.can_refund_credit_purchase(uuid) from public, anon, authenticated;
revoke all on function public.reserve_credit_refund(uuid) from public, anon, authenticated;
revoke all on function public.cancel_credit_refund(uuid) from public, anon, authenticated;
revoke all on function public.refund_credit_purchase(uuid) from public, anon, authenticated;
grant execute on function public.can_refund_credit_purchase(uuid) to service_role;
grant execute on function public.reserve_credit_refund(uuid) to service_role;
grant execute on function public.cancel_credit_refund(uuid) to service_role;
grant execute on function public.refund_credit_purchase(uuid) to service_role;

create or replace function public.search_candidates(
  p_query text default null,
  p_country public.country_code default null,
  p_state text default null,
  p_city text default null,
  p_min_years integer default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  candidate_id uuid,
  initials text,
  headline text,
  summary text,
  years_experience integer,
  city text,
  state_province text,
  country public.country_code,
  work_authorization text,
  skills text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.employer_profiles
    where user_id = auth.uid() and review_status = 'approved'
  ) then
    raise exception 'employer_not_approved';
  end if;

  return query
  select
    cp.user_id,
    case
      when position(' ' in trim(cp.full_name)) > 0 then
        upper(left(split_part(trim(cp.full_name), ' ', 1), 1)) || '. ' ||
        upper(left(regexp_replace(trim(cp.full_name), '^.* ', ''), 1)) || '.'
      else upper(left(trim(cp.full_name), 1)) || '.'
    end,
    cp.headline,
    cp.summary,
    cp.years_experience,
    cp.city,
    cp.state_province,
    cp.country,
    cp.work_authorization,
    coalesce(
      array(
        select distinct cs.skill_name
        from public.candidate_skills cs
        where cs.candidate_id = cp.user_id
        order by cs.skill_name
      ),
      array[]::text[]
    )
  from public.candidate_profiles cp
  join public.users u on u.id = cp.user_id
  where cp.searchable = true
    and cp.identity_status = 'verified'
    and cp.date_of_birth_confirmed = true
    and u.status = 'active'
    and (p_country is null or cp.country = p_country)
    and (p_state is null or cp.state_province ilike p_state)
    and (p_city is null or cp.city ilike p_city)
    and (p_min_years is null or cp.years_experience >= greatest(p_min_years, 0))
    and (
      nullif(trim(p_query), '') is null
      or cp.headline ilike '%' || trim(p_query) || '%'
      or cp.summary ilike '%' || trim(p_query) || '%'
      or exists (
        select 1 from public.candidate_skills cs
        where cs.candidate_id = cp.user_id
          and cs.skill_name ilike '%' || trim(p_query) || '%'
      )
    )
  order by cp.updated_at desc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.unlock_candidate(p_candidate_id uuid)
returns table (source public.unlock_source, available_credits integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer_id uuid := auth.uid();
  v_wallet public.credit_wallets;
  v_tx uuid;
  v_source public.unlock_source;
begin
  if not exists (
    select 1 from public.employer_profiles
    where user_id = v_employer_id and review_status = 'approved'
  ) then
    raise exception 'employer_not_approved';
  end if;

  if not exists (
    select 1
    from public.candidate_profiles cp
    join public.users u on u.id = cp.user_id
    where cp.user_id = p_candidate_id
      and cp.searchable = true
      and cp.identity_status = 'verified'
      and cp.date_of_birth_confirmed = true
      and u.status = 'active'
  ) then
    raise exception 'candidate_unavailable';
  end if;

  select cu.source into v_source
  from public.contact_unlocks cu
  where cu.employer_id = v_employer_id
    and cu.candidate_id = p_candidate_id;

  if v_source is not null then
    return query
      select v_source, coalesce(cw.available_credits, 0)
      from (select 1) singleton
      left join public.credit_wallets cw on cw.employer_id = v_employer_id;
    return;
  end if;

  if exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.candidate_id = p_candidate_id
      and j.employer_id = v_employer_id
  ) then
    insert into public.contact_unlocks (employer_id, candidate_id, source)
    values (v_employer_id, p_candidate_id, 'application')
    on conflict (employer_id, candidate_id) do nothing;

    return query
      select 'application'::public.unlock_source, coalesce(cw.available_credits, 0)
      from (select 1) singleton
      left join public.credit_wallets cw on cw.employer_id = v_employer_id;
    return;
  end if;

  select * into v_wallet
  from public.credit_wallets
  where employer_id = v_employer_id
  for update;

  if v_wallet.employer_id is null or v_wallet.available_credits < 1 then
    raise exception 'insufficient_credits';
  end if;

  select cu.source into v_source
  from public.contact_unlocks cu
  where cu.employer_id = v_employer_id
    and cu.candidate_id = p_candidate_id;

  if v_source is not null then
    return query select v_source, v_wallet.available_credits;
    return;
  end if;

  update public.credit_wallets
  set available_credits = available_credits - 1,
      used_credits = used_credits + 1,
      updated_at = now()
  where employer_id = v_employer_id;

  insert into public.credit_transactions (employer_id, type, quantity)
  values (v_employer_id, 'unlock', -1)
  returning id into v_tx;

  insert into public.contact_unlocks (
    employer_id, candidate_id, source, credit_transaction_id
  )
  values (v_employer_id, p_candidate_id, 'paid_search', v_tx);

  return query
    select 'paid_search'::public.unlock_source, cw.available_credits
    from public.credit_wallets cw
    where cw.employer_id = v_employer_id;
end;
$$;

revoke all on function public.search_candidates(text, public.country_code, text, text, integer, integer, integer) from public, anon;
revoke all on function public.unlock_candidate(uuid) from public, anon;
grant execute on function public.search_candidates(text, public.country_code, text, text, integer, integer, integer) to authenticated;
grant execute on function public.unlock_candidate(uuid) to authenticated;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_logs_are_immutable';
end;
$$;

drop trigger if exists audit_logs_are_immutable on public.audit_logs;
create trigger audit_logs_are_immutable
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();
