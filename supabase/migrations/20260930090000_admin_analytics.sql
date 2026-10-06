-- Statistiques et finances pour le panneau d'administration.
--
-- Les tables d'élèves, de documents, d'usage et de paiements sont protégées par RLS : chaque élève ne voit que ses
-- propres lignes. Le panneau admin passe donc par des fonctions qui vérifient d'abord is_admin() (table admin_users),
-- puis renvoient des chiffres agrégés. Un compte qui n'est pas administrateur reçoit « forbidden ».
--
-- À APPLIQUER MANUELLEMENT, en 3 blocs successifs (BLOC 1, 2, 3). Aucune ligne de données n'est modifiée.

-- ═══ BLOC 1 : colonnes utiles + réglages ═════════════════════════════════════════════════════════

-- Type d'appel IA (chat, qcm, fiche…) pour savoir ce qui coûte le plus cher.
alter table public.api_usage add column if not exists kind text;

-- Devise du paiement : MRU (Mauritanie), XOF (FCFA, Sénégal), MAD (Maroc).
alter table public.subscriptions add column if not exists currency text not null default 'MRU';

create index if not exists api_usage_created_kind_idx on public.api_usage (created_at desc, kind);

-- Modification des réglages (tarifs de l'IA, taux de change) réservée aux administrateurs.
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
  if p_key !~ '^(fx_|api_price_|goal_)[a-z0-9_.]+$' then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  insert into public.app_config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.admin_set_config(text, text) from public, anon;
grant execute on function public.admin_set_config(text, text) to authenticated;

-- ═══ BLOC 2 : vue d'ensemble (chiffres globaux + séries par jour) ═════════════════════════════════

create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_from date    := current_date - (greatest(1, least(coalesce(p_days, 30), 365)) - 1);
  v_res  jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_res := jsonb_build_object(
    'days', v_days,

    'daily', coalesce((
      select jsonb_agg(row_to_json(t) order by t.day)
      from (
        select
          d.day::text as day,
          (select count(*) from public.students s where s.created_at::date = d.day) as signups,
          (select count(*) from public.documents x where x.created_at::date = d.day) as docs,
          (select count(distinct q.user_id) from public.quota_counters q where q.day = d.day) as active,
          (select coalesce(sum(q.used), 0) from public.quota_counters q where q.day = d.day and q.kind = 'chat') as chat,
          (select coalesce(sum(q.used), 0) from public.quota_counters q where q.day = d.day and q.kind = 'qcm') as qcm,
          (select coalesce(sum(q.used), 0) from public.quota_counters q where q.day = d.day and q.kind = 'content') as content
        from (select g::date as day from generate_series(v_from, current_date, interval '1 day') g) d
      ) t
    ), '[]'::jsonb),

    'revenue_daily', coalesce((
      select jsonb_agg(row_to_json(t) order by t.day)
      from (
        select s.activated_at::date::text as day, s.currency, count(*) as n, coalesce(sum(s.amount), 0) as amount
        from public.subscriptions s
        where s.status = 'active' and s.activated_at is not null and s.activated_at::date >= v_from
        group by s.activated_at::date, s.currency
      ) t
    ), '[]'::jsonb),

    'usage_daily', coalesce((
      select jsonb_agg(row_to_json(t) order by t.day)
      from (
        select a.created_at::date::text as day, coalesce(a.model, '?') as model, coalesce(a.kind, '?') as kind,
               count(*) as calls, coalesce(sum(a.input_tokens), 0) as input_tokens, coalesce(sum(a.output_tokens), 0) as output_tokens
        from public.api_usage a
        where a.created_at::date >= v_from
        group by a.created_at::date, a.model, a.kind
      ) t
    ), '[]'::jsonb),

    'totals', jsonb_build_object(
      'students',        (select count(*) from public.students),
      'students_period', (select count(*) from public.students s where s.created_at::date >= v_from),
      'students_today',  (select count(*) from public.students s where s.created_at::date = current_date),
      'documents',       (select count(*) from public.documents),
      'users_with_docs', (select count(distinct user_id) from public.documents),
      'active_today',    (select count(distinct user_id) from public.quota_counters where day = current_date),
      'active_7d',       (select count(distinct user_id) from public.quota_counters where day >= current_date - 6),
      'paying_now',      (select count(distinct s.user_id) from public.subscriptions s
                           where s.status = 'active' and (s.expires_at is null or s.expires_at > now())),
      'paying_standard', (select count(distinct s.user_id) from public.subscriptions s
                           where s.status = 'active' and s.plan = 'standard' and (s.expires_at is null or s.expires_at > now())),
      'paying_premium',  (select count(distinct s.user_id) from public.subscriptions s
                           where s.status = 'active' and s.plan = 'premium' and (s.expires_at is null or s.expires_at > now())),
      'ever_paid',       (select count(distinct s.user_id) from public.subscriptions s where s.status = 'active' and s.activated_at is not null),
      'pending',         (select count(*) from public.subscriptions where status = 'pending'),
      'revenue_total',   coalesce((
        select jsonb_object_agg(c, a) from (
          select s.currency as c, sum(s.amount) as a from public.subscriptions s
          where s.status = 'active' and s.activated_at is not null group by s.currency) r), '{}'::jsonb),
      'mrr', coalesce((
        select jsonb_object_agg(c, a) from (
          select s.currency as c,
                 sum(case when s.duration = 'yearly' then s.amount / 12.0 else s.amount end) as a
          from public.subscriptions s
          where s.status = 'active' and (s.expires_at is null or s.expires_at > now()) group by s.currency) r), '{}'::jsonb),
      'by_method', coalesce((
        select jsonb_agg(row_to_json(r)) from (
          select coalesce(s.provider, 'manual') as provider, coalesce(s.method, '?') as method, s.currency, count(*) as n, sum(s.amount) as amount
          from public.subscriptions s where s.status = 'active' and s.activated_at is not null
          group by s.provider, s.method, s.currency) r), '[]'::jsonb),
      'countries', coalesce((
        select jsonb_agg(row_to_json(r)) from (
          select coalesce(country, '?') as country, count(*) as n from public.students group by country order by count(*) desc) r), '[]'::jsonb),
      'promotions', coalesce((
        select jsonb_agg(row_to_json(r)) from (
          select coalesce(promotion_name, '?') as promotion, count(*) as n from public.students group by promotion_name order by count(*) desc limit 12) r), '[]'::jsonb)
    )
  );

  return v_res;
end;
$$;

revoke all on function public.admin_overview(integer) from public, anon;
grant execute on function public.admin_overview(integer) to authenticated;

-- ═══ BLOC 3 : listes (élèves, documents, paiements) ══════════════════════════════════════════════

drop function if exists public.admin_students(integer);
create function public.admin_students(p_limit integer default 300)
returns table (
  user_id text, name text, email text, country text, promotion text, school text,
  created_at timestamptz, plan text, plan_expires timestamptz,
  documents bigint, last_active date, questions_total bigint, qcm_total bigint, content_total bigint
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
  select s.user_id, s.name, u.email::text, s.country, s.promotion_name, s.school_name,
         s.created_at,
         public.effective_plan(k.key),
         (select max(x.expires_at) from public.subscriptions x where x.user_id = k.key and x.status = 'active' and x.expires_at > now()),
         (select count(*) from public.documents d where d.user_id::text = s.user_id),
         (select max(q.day) from public.quota_counters q where q.user_id = k.key),
         (select coalesce(sum(q.used), 0) from public.quota_counters q where q.user_id = k.key and q.kind = 'chat'),
         (select coalesce(sum(q.used), 0) from public.quota_counters q where q.user_id = k.key and q.kind = 'qcm'),
         (select coalesce(sum(q.used), 0) from public.quota_counters q where q.user_id = k.key and q.kind = 'content')
  from public.students s
  left join auth.users u on u.id::text = s.user_id
  cross join lateral (
    select coalesce((select dl.device_id from public.device_links dl where dl.user_id::text = s.user_id), s.user_id) as key
  ) k
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000));
end;
$$;

revoke all on function public.admin_students(integer) from public, anon;
grant execute on function public.admin_students(integer) to authenticated;

drop function if exists public.admin_documents(integer);
create function public.admin_documents(p_limit integer default 300)
returns table (
  id text, name text, pages integer, chars integer, owner_name text, created_at timestamptz,
  has_fiche boolean, has_flashcards boolean, has_cases boolean
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
  select d.id, d.name, d.pages, length(d.content), s.name, d.created_at,
         (d.fiche is not null and d.fiche <> ''),
         (d.flashcards is not null and d.flashcards <> ''),
         (d.clinical_case is not null and d.clinical_case <> '')
  from public.documents d
  left join public.students s on s.user_id = d.user_id::text
  order by d.created_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000));
end;
$$;

revoke all on function public.admin_documents(integer) from public, anon;
grant execute on function public.admin_documents(integer) to authenticated;

drop function if exists public.admin_payments(integer);
create function public.admin_payments(p_limit integer default 300)
returns table (
  id uuid, plan text, status text, method text, provider text, amount numeric, currency text, duration text,
  reference_code text, receipt_url text, created_at timestamptz, activated_at timestamptz, expires_at timestamptz,
  student_name text
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
                   where coalesce(dl.device_id, st.user_id) = s.user_id limit 1))
  from public.subscriptions s
  order by case when s.status = 'pending' then 0 else 1 end, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000));
end;
$$;

revoke all on function public.admin_payments(integer) from public, anon;
grant execute on function public.admin_payments(integer) to authenticated;
