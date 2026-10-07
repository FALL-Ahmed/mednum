-- Changer l'offre d'un élève depuis l'admin (sans paiement : aucun revenu comptabilisé).
--   • 'freemium' : met fin à l'abonnement en cours (l'accès payant s'arrête tout de suite).
--   • 'standard' / 'premium' : met fin à l'abonnement en cours puis en crée un nouveau, offert, de p_days jours.
-- Les anciens paiements restent dans l'historique et les revenus passés ne changent pas.
create or replace function public.admin_set_plan(p_user_id text, p_plan text, p_days integer default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_plan not in ('freemium', 'standard', 'premium') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_plan <> 'freemium' and (p_days is null or p_days < 1 or p_days > 3650) then
    raise exception 'invalid_days' using errcode = 'P0001';
  end if;

  -- Même clé que celle utilisée pour les quotas et les abonnements (appareil relié, sinon identifiant du compte)
  v_key  := coalesce((select dl.device_id from public.device_links dl where dl.user_id::text = p_user_id), p_user_id);
  v_name := (select s.name from public.students s where s.user_id = p_user_id);

  update public.subscriptions
     set expires_at = now()
   where user_id = v_key and status = 'active' and (expires_at is null or expires_at > now());

  if p_plan <> 'freemium' then
    insert into public.subscriptions
      (id, user_id, plan, status, method, provider, duration, amount, student_name, activated_at, expires_at)
    values
      (gen_random_uuid(), v_key, p_plan, 'active', 'admin', 'gift',
       case when p_days >= 300 then 'yearly' else 'monthly' end,
       0, v_name, now(), now() + make_interval(days => p_days));
  end if;
end;
$$;

revoke all on function public.admin_set_plan(text, text, integer) from public, anon;
grant execute on function public.admin_set_plan(text, text, integer) to authenticated;
