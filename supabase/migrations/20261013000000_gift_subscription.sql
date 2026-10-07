-- Abonnement offert : l'admin accepte une demande sans paiement. Le montant est mis à 0 et le fournisseur à 'gift',
-- donc aucun revenu n'est comptabilisé (tous les chiffres d'argent additionnent subscriptions.amount).
create or replace function public.gift_subscription(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     text;
  v_duration text;
  v_start    timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.subscriptions where id = p_id and status = 'pending' for update;
  if not found then
    raise exception 'not_found_or_not_pending' using errcode = 'P0001';
  end if;

  v_user     := (select user_id  from public.subscriptions where id = p_id);
  v_duration := (select duration from public.subscriptions where id = p_id);

  v_start := (
    select greatest(now(), coalesce(max(expires_at), now()))
      from public.subscriptions
     where user_id = v_user and status = 'active' and expires_at > now());

  update public.subscriptions
     set status = 'active',
         activated_at = now(),
         amount = 0,
         provider = 'gift',
         expires_at = v_start + case when v_duration = 'yearly' then interval '1 year' else interval '1 month' end
   where id = p_id;
end;
$$;

revoke all on function public.gift_subscription(uuid) from public, anon;
grant execute on function public.gift_subscription(uuid) to authenticated;
