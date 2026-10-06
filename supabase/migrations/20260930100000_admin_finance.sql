-- Finances détaillées et analyses pour le panneau d'administration (suite de 20260930090000_admin_analytics.sql).
--
-- À APPLIQUER MANUELLEMENT, en 2 blocs successifs. Aucune donnée n'est modifiée.

-- ═══ BLOC 1 : autoriser les réglages de coûts fixes et de frais de paiement ═══════════════════════

create or replace function public.admin_set_config(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key !~ '^(fx_|api_price_|cost_|fee_|goal_)[a-z0-9_.]+$' then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  insert into public.app_config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.admin_set_config(text, text) from public, anon;
grant execute on function public.admin_set_config(text, text) to authenticated;

-- ═══ BLOC 2 : analyses financières et de rétention ═════════════════════════════════════════════

create or replace function public.admin_finance(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := current_date - (greatest(1, least(coalesce(p_days, 30), 365)) - 1);
  v_res  jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_res := jsonb_build_object(

    -- Coût de l'IA par offre de l'élève (gratuit / standard / premium), modèle et type d'usage
    'cost_by_plan', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select coalesce(public.effective_plan(coalesce(
                 (select dl.device_id from public.device_links dl where dl.user_id::text = km.sid), km.sid)), 'freemium') as plan,
               coalesce(a.model, '?') as model, coalesce(a.kind, '?') as kind,
               count(*) as calls, coalesce(sum(a.input_tokens), 0) as input_tokens, coalesce(sum(a.output_tokens), 0) as output_tokens
        from public.api_usage a
        left join (
          select s.user_id as k, s.user_id as sid from public.students s
          union
          select dl.device_id, dl.user_id::text from public.device_links dl
        ) km on km.k = a.user_id
        where a.created_at::date >= v_from
        group by 1, 2, 3
      ) t
    ), '[]'::jsonb),

    -- Effectifs par offre : tous les élèves, et ceux qui ont utilisé l'IA sur la période
    'plan_students', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select p.plan, count(*) as n,
               count(*) filter (where exists (
                 select 1 from public.api_usage a
                 where a.created_at::date >= v_from and (a.user_id = p.sid or a.user_id = p.key))) as active_n
        from (
          select s.user_id as sid,
                 coalesce((select dl.device_id from public.device_links dl where dl.user_id::text = s.user_id), s.user_id) as key,
                 public.effective_plan(coalesce((select dl.device_id from public.device_links dl where dl.user_id::text = s.user_id), s.user_id)) as plan
          from public.students s
        ) p
        group by p.plan
      ) t
    ), '[]'::jsonb),

    -- Les élèves qui coûtent le plus (pour repérer un usage excessif)
    'top_costly', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select s.name, public.effective_plan(coalesce(
                 (select dl.device_id from public.device_links dl where dl.user_id::text = s.user_id), s.user_id)) as plan,
               coalesce(a.model, '?') as model, count(*) as calls,
               coalesce(sum(a.input_tokens), 0) as input_tokens, coalesce(sum(a.output_tokens), 0) as output_tokens
        from public.api_usage a
        join (
          select st.user_id as k, st.user_id as sid from public.students st
          union
          select dl.device_id, dl.user_id::text from public.device_links dl
        ) km on km.k = a.user_id
        join public.students s on s.user_id = km.sid
        where a.created_at::date >= v_from
        group by s.name, s.user_id, a.model
      ) t
    ), '[]'::jsonb),

    -- Revenu mensuel récurrent jour par jour (abonnements en vigueur ce jour-là, ramenés au mois)
    'mrr_daily', coalesce((
      select jsonb_agg(row_to_json(t) order by t.day)
      from (
        select d.day::text as day, s.currency,
               sum(case when s.duration = 'yearly' then s.amount / 12.0 else s.amount end) as amount,
               count(*) as n
        from (select g::date as day from generate_series(v_from, current_date, interval '1 day') g) d
        join public.subscriptions s
          on s.status = 'active' and s.activated_at is not null
         and s.activated_at::date <= d.day and (s.expires_at is null or s.expires_at::date > d.day)
        group by d.day, s.currency
      ) t
    ), '[]'::jsonb),

    -- Revenu mensuel récurrent d'aujourd'hui, par offre
    'mrr_by_plan', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select s.plan, s.currency, count(distinct s.user_id) as n,
               sum(case when s.duration = 'yearly' then s.amount / 12.0 else s.amount end) as amount
        from public.subscriptions s
        where s.status = 'active' and (s.expires_at is null or s.expires_at > now())
        group by s.plan, s.currency
      ) t
    ), '[]'::jsonb),

    -- Revenus depuis le début, par offre, durée et devise
    'revenue_by_plan', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select s.plan, coalesce(s.duration, 'monthly') as duration, s.currency, count(*) as n, coalesce(sum(s.amount), 0) as amount
        from public.subscriptions s where s.status = 'active' and s.activated_at is not null
        group by s.plan, s.duration, s.currency
      ) t
    ), '[]'::jsonb),

    -- Revenus par pays de l'élève
    'revenue_by_country', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select coalesce(st.country, '?') as country, s.currency, count(*) as n, coalesce(sum(s.amount), 0) as amount
        from public.subscriptions s
        left join (
          select x.user_id as k, x.user_id as sid from public.students x
          union
          select dl.device_id, dl.user_id::text from public.device_links dl
        ) km on km.k = s.user_id
        left join public.students st on st.user_id = km.sid
        where s.status = 'active' and s.activated_at is not null
        group by st.country, s.currency
      ) t
    ), '[]'::jsonb),

    -- Fidélité : renouvellements et abonnements qui s'arrêtent
    'subscribers', jsonb_build_object(
      'ever',          (select count(distinct user_id) from public.subscriptions where status = 'active' and activated_at is not null),
      'renewed',       (select count(*) from (
                          select user_id from public.subscriptions where status = 'active' and activated_at is not null
                          group by user_id having count(*) >= 2) r),
      'due_7d',        (select count(distinct user_id) from public.subscriptions
                         where status = 'active' and expires_at > now() and expires_at < now() + interval '7 days'),
      'lapsed_30d',    (select count(distinct s.user_id) from public.subscriptions s
                         where s.status = 'active' and s.expires_at <= now() and s.expires_at > now() - interval '30 days'
                           and not exists (select 1 from public.subscriptions x
                                            where x.user_id = s.user_id and x.status = 'active' and x.expires_at > now()))
    ),

    -- Délai moyen entre l'inscription et le premier paiement
    'days_to_pay', (
      select avg(extract(epoch from (f.first_paid - st.created_at)) / 86400.0)
      from (
        select km.sid, min(s.activated_at) as first_paid
        from public.subscriptions s
        join (
          select x.user_id as k, x.user_id as sid from public.students x
          union
          select dl.device_id, dl.user_id::text from public.device_links dl
        ) km on km.k = s.user_id
        where s.status = 'active' and s.activated_at is not null
        group by km.sid
      ) f
      join public.students st on st.user_id = f.sid
    ),

    -- Rétention : part des élèves encore actifs 1, 7 et 30 jours après l'inscription
    'retention', (
      select jsonb_build_object(
        'd1',  jsonb_build_object('n', count(*) filter (where c.created <= current_date - 1),
                                  'ok', count(*) filter (where c.created <= current_date - 1 and c.d1)),
        'd7',  jsonb_build_object('n', count(*) filter (where c.created <= current_date - 7),
                                  'ok', count(*) filter (where c.created <= current_date - 7 and c.d7)),
        'd30', jsonb_build_object('n', count(*) filter (where c.created <= current_date - 30),
                                  'ok', count(*) filter (where c.created <= current_date - 30 and c.d30)))
      from (
        select s.created_at::date as created,
               exists (select 1 from public.quota_counters q
                        where q.user_id in (s.user_id, coalesce((select dl.device_id from public.device_links dl where dl.user_id::text = s.user_id), s.user_id))
                          and q.day = s.created_at::date + 1) as d1,
               exists (select 1 from public.quota_counters q
                        where q.user_id in (s.user_id, coalesce((select dl.device_id from public.device_links dl where dl.user_id::text = s.user_id), s.user_id))
                          and q.day between s.created_at::date + 1 and s.created_at::date + 7) as d7,
               exists (select 1 from public.quota_counters q
                        where q.user_id in (s.user_id, coalesce((select dl.device_id from public.device_links dl where dl.user_id::text = s.user_id), s.user_id))
                          and q.day between s.created_at::date + 25 and s.created_at::date + 35) as d30
        from public.students s
      ) c
    )
  );

  return v_res;
end;
$$;

revoke all on function public.admin_finance(integer) from public, anon;
grant execute on function public.admin_finance(integer) to authenticated;
