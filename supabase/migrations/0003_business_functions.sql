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
