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
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_window_seconds < 1 or p_max_requests < 1 then
    raise exception 'invalid_rate_limit_configuration';
  end if;
  insert into public.rate_limit_windows (
    scope, subject_hash, window_start, request_count, expires_at
  )
  values (
    p_scope,
    p_subject_hash,
    p_window_start,
    1,
    p_window_start + make_interval(secs => p_window_seconds)
  )
  on conflict (scope, subject_hash, window_start)
  do update set request_count = rate_limit_windows.request_count + 1
  returning request_count into v_count;
  return v_count <= p_max_requests;
end;
$$;

create or replace function public.delete_expired_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.rate_limit_windows where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.delete_expired_rate_limits() from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, timestamptz, integer, integer) to service_role;
grant execute on function public.delete_expired_rate_limits() to service_role;
