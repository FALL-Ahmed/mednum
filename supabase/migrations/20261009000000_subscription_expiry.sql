-- Fin d'abonnement : rappel avant l'expiration, message après, et liste des comptes à relancer dans l'admin.
--   • my_subscription_status() : ce qu'il faut savoir sur MON abonnement (actif, ou expiré récemment).
--   • admin_payments : ajoute l'e-mail de l'étudiant pour pouvoir le relancer.
--
-- À APPLIQUER MANUELLEMENT, un seul bloc, dans l'éditeur SQL du tableau de bord.

create or replace function public.my_subscription_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_act jsonb;
  v_exp jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_key := coalesce(public.account_quota_key(), v_uid::text);

  v_act := (
    select jsonb_build_object('plan', s.plan, 'expires_at', s.expires_at)
      from public.subscriptions s
     where s.user_id = v_key and s.status = 'active' and (s.expires_at is null or s.expires_at > now())
     order by s.expires_at desc nulls first
     limit 1);

  -- Dernier abonnement terminé depuis moins de 30 jours (seulement si aucun abonnement n'est actif)
  if v_act is null then
    v_exp := (
      select jsonb_build_object('plan', s.plan, 'expires_at', s.expires_at)
        from public.subscriptions s
       where s.user_id = v_key and s.status = 'active' and s.expires_at is not null
         and s.expires_at <= now() and s.expires_at > now() - interval '30 days'
       order by s.expires_at desc
       limit 1);
  end if;

  return jsonb_build_object('active', v_act, 'expired', v_exp);
end;
$$;

revoke all on function public.my_subscription_status() from public;
grant execute on function public.my_subscription_status() to authenticated;

-- Liste des paiements de l'admin : même contenu qu'avant, plus l'e-mail de l'étudiant.
drop function if exists public.admin_payments(integer);
create function public.admin_payments(p_limit integer default 300)
returns table (
  id uuid, plan text, status text, method text, provider text, amount numeric, currency text, duration text,
  reference_code text, receipt_url text, created_at timestamptz, activated_at timestamptz, expires_at timestamptz,
  student_name text, student_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select s.id, s.plan, s.status, s.method, coalesce(s.provider, 'manual'), s.amount, s.currency, s.duration,
         s.reference_code, s.receipt_url, s.created_at, s.activated_at, s.expires_at,
         coalesce(s.student_name,
                  (select st.name from public.students st
                    left join public.device_links dl on dl.user_id::text = st.user_id
                   where coalesce(dl.device_id, st.user_id) = s.user_id limit 1)),
         (select u.email::text from auth.users u
           where u.id::text = coalesce((select dl2.user_id::text from public.device_links dl2 where dl2.device_id = s.user_id limit 1), s.user_id)
           limit 1)
  from public.subscriptions s
  order by case when s.status = 'pending' then 0 else 1 end, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000));
end;
$$;

revoke all on function public.admin_payments(integer) from public, anon;
grant execute on function public.admin_payments(integer) to authenticated;
