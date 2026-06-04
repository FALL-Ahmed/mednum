-- Migration : quota journalier par utilisateur + log des tokens consommés
-- À appliquer via : supabase db push
-- Ou manuellement dans Supabase Dashboard → SQL Editor

-- ─── Table : quotas journaliers ────────────────────────────────────────────────

create table if not exists public.user_quotas (
  user_id        text        primary key,
  daily_limit    integer     not null default 50,
  daily_used     integer     not null default 0,
  last_reset_at  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

comment on table  public.user_quotas               is 'Quota journalier de messages IA par appareil';
comment on column public.user_quotas.user_id       is 'UUID généré au premier lancement de l''app';
comment on column public.user_quotas.daily_limit   is 'Nombre max de messages IA par jour';
comment on column public.user_quotas.daily_used    is 'Messages envoyés depuis last_reset_at';
comment on column public.user_quotas.last_reset_at is 'Timestamp du dernier reset (reset auto si > 24h)';

-- ─── Table : log tokens consommés ──────────────────────────────────────────────

create table if not exists public.api_usage (
  id             bigserial   primary key,
  user_id        text        not null,
  input_tokens   integer,
  output_tokens  integer,
  model          text,
  created_at     timestamptz not null default now()
);

comment on table public.api_usage is 'Log des tokens Anthropic consommés (input + output) par appel';

create index if not exists api_usage_user_id_idx on public.api_usage (user_id);
create index if not exists api_usage_created_idx on public.api_usage (created_at desc);

-- ─── RLS : accès réservé au service_role (Edge Function) ──────────────────────
-- Le service_role bypass RLS par défaut → pas besoin de policies permissives.
-- Les policies ci-dessous bloquent explicitement le rôle anon/authenticated.

alter table public.user_quotas enable row level security;
alter table public.api_usage   enable row level security;

-- Aucun accès direct depuis le client (anon ou authenticated)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_quotas' and policyname = 'no_client_access_quotas'
  ) then
    create policy no_client_access_quotas on public.user_quotas using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'api_usage' and policyname = 'no_client_access_usage'
  ) then
    create policy no_client_access_usage on public.api_usage using (false);
  end if;
end;
$$;

-- ─── Fonction : check + incrément atomique du quota ──────────────────────────
-- Utilise FOR UPDATE pour éviter les race conditions (deux requêtes simultanées).
-- Retourne true si l'appel est autorisé, false si le quota est dépassé.

create or replace function public.check_and_increment_quota(
  p_user_id  text,
  p_limit    integer default 50
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_quotas%rowtype;
begin
  -- Crée la ligne si elle n'existe pas encore (premier appel de cet userId)
  insert into public.user_quotas (user_id, daily_limit, daily_used, last_reset_at)
  values (p_user_id, p_limit, 0, now())
  on conflict (user_id) do nothing;

  -- Verrouille la ligne pour l'update atomique (évite double-incrément concurrent)
  select * into v_row
  from public.user_quotas
  where user_id = p_user_id
  for update;

  -- Reset automatique si 24h écoulées depuis le dernier reset
  if now() - v_row.last_reset_at > interval '24 hours' then
    update public.user_quotas
    set daily_used = 1, last_reset_at = now()
    where user_id = p_user_id;
    return true;
  end if;

  -- Quota dépassé → retourner false sans modifier daily_used
  if v_row.daily_used >= v_row.daily_limit then
    return false;
  end if;

  -- Quota OK → incrémenter
  update public.user_quotas
  set daily_used = daily_used + 1
  where user_id = p_user_id;

  return true;
end;
$$;

-- ─── Vue pratique pour le dashboard admin ─────────────────────────────────────

create or replace view public.usage_summary as
select
  u.user_id,
  q.daily_used,
  q.daily_limit,
  q.last_reset_at,
  sum(u.input_tokens)                        as total_input_tokens,
  sum(u.output_tokens)                       as total_output_tokens,
  sum(u.input_tokens + u.output_tokens)      as total_tokens,
  count(*)                                   as total_calls,
  max(u.created_at)                          as last_call_at
from public.api_usage u
left join public.user_quotas q using (user_id)
group by u.user_id, q.daily_used, q.daily_limit, q.last_reset_at;
