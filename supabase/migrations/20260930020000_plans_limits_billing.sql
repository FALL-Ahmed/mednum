-- Plans Gratuit / Standard / Premium, limites par plan, compteurs séparés, paiement et activation.
--
-- Pré-requis : 20260930010000_account_linking.sql appliquée avant (table device_links).
--
-- Ce que fait cette migration :
--   1. Ajoute les plans 'standard' (800 MRU) et 'premium' (1 500 MRU) ; les anciens plans restent en base.
--   2. plan_limits : limites de chaque plan (questions / QCM / contenus par jour, documents, export PDF, historique).
--   3. Le plan d'un étudiant est calculé à partir de ses abonnements actifs (effective_plan) : plus de
--      mise à jour manuelle, et l'expiration est automatique.
--   4. quota_counters + check_and_increment_quota(user, kind) : compteurs journaliers séparés
--      (chat / qcm / contenus), remplacent les deux versions existantes de la fonction.
--   5. get_quota_status renvoie aussi les limites du plan (utilisé par l'app et le site).
--   6. Paiement : payment_accounts, app_config, submit_payment_request, activate_subscription,
--      reject_subscription (réservées aux admins listés dans admin_users).
--   7. Limite de documents par plan (trigger sur documents).
--
-- Le fichier est découpé en 4 blocs (-- BLOC 1 à 4) qu'on peut exécuter un par un, dans l'ordre, depuis l'éditeur
-- SQL du tableau de bord. Volontairement, les fonctions n'utilisent pas « SELECT ... INTO » : l'éditeur du
-- tableau de bord le confond avec la création d'une table et insère du code parasite.
--
-- À APPLIQUER MANUELLEMENT après relecture.

-- ═══ BLOC 1 : plans, limites, administrateurs, plan effectif ═══════════════════════════════════════════════

insert into public.plans (plan, label, price_monthly, price_yearly, sort_order) values
  ('standard', 'Standard', 800,  7200,  5),
  ('premium',  'Premium',  1500, 13500, 6)
on conflict (plan) do update
  set label = excluded.label,
      price_monthly = excluded.price_monthly,
      price_yearly = excluded.price_yearly,
      sort_order = excluded.sort_order;

update public.plans set label = 'Gratuit' where plan = 'freemium';

create table if not exists public.plan_limits (
  plan            text    primary key,
  daily_questions integer not null,
  daily_qcm       integer not null,
  daily_contents  integer not null,   -- fiches, flashcards, cas cliniques, résumés
  max_documents   integer,            -- null = illimité
  pdf_export      boolean not null default false,
  history_days    integer             -- null = illimité
);

insert into public.plan_limits (plan, daily_questions, daily_qcm, daily_contents, max_documents, pdf_export, history_days) values
  ('freemium',       5,   5,  1,  1,    false, 7),
  ('trial',          5,   5,  1,  1,    false, 7),
  ('standard',       30,  10, 5,  5,    true,  30),
  ('premium',        100, 30, 20, null, true,  null),
  ('one_subject',    30,  10, 5,  5,    true,  30),
  ('three_subjects', 30,  10, 5,  5,    true,  30),
  ('full',           100, 30, 20, null, true,  null)
on conflict (plan) do update
  set daily_questions = excluded.daily_questions,
      daily_qcm       = excluded.daily_qcm,
      daily_contents  = excluded.daily_contents,
      max_documents   = excluded.max_documents,
      pdf_export      = excluded.pdf_export,
      history_days    = excluded.history_days;

alter table public.plan_limits enable row level security;
drop policy if exists "plan_limits_read" on public.plan_limits;
create policy "plan_limits_read" on public.plan_limits for select using (true);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

alter table public.subscriptions
  add column if not exists amount         numeric,
  add column if not exists reference_code text,
  add column if not exists student_name   text,
  add column if not exists subjects       text[];

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_admin_read" on public.subscriptions;
create policy "subscriptions_admin_read" on public.subscriptions for select using (public.is_admin());
drop policy if exists "subscriptions_admin_update" on public.subscriptions;
create policy "subscriptions_admin_update" on public.subscriptions for update using (public.is_admin());

-- Plan réellement en vigueur pour une clé (identifiant d'appareil ou uid) :
-- l'abonnement actif le plus long, sinon 'freemium'. L'expiration est donc automatique.
create or replace function public.effective_plan(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.plan
       from public.subscriptions s
      where s.user_id = p_key
        and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
      order by s.expires_at desc nulls first
      limit 1),
    'freemium');
$$;

-- ═══ BLOC 2 : compteurs journaliers séparés ═══════════════════════════════════════════════════════════════

create table if not exists public.quota_counters (
  user_id text    not null,
  day     date    not null default current_date,
  kind    text    not null,          -- 'chat' | 'qcm' | 'content'
  used    integer not null default 0,
  primary key (user_id, day, kind)
);
alter table public.quota_counters enable row level security;

create or replace function public.quota_bucket(p_kind text)
returns text
language sql
immutable
as $$
  select case when p_kind = 'chat' then 'chat'
              when p_kind = 'qcm'  then 'qcm'
              else 'content' end;
$$;

-- Remplace les deux versions existantes (jsonb / boolean) par une seule, qui renvoie un booléen
-- comme l'attend la fonction `ask`.
drop function if exists public.check_and_increment_quota(text);
drop function if exists public.check_and_increment_quota(text, integer);

create or replace function public.check_and_increment_quota(p_user_id text, p_kind text default 'chat')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket text := public.quota_bucket(p_kind);
  v_plan   text := public.effective_plan(p_user_id);
  v_limit  integer;
  v_rows   integer;
begin
  v_limit := (
    select case v_bucket when 'chat' then l.daily_questions
                         when 'qcm'  then l.daily_qcm
                         else l.daily_contents end
      from public.plan_limits l where l.plan = v_plan);

  if v_limit is null then
    v_limit := (
      select case v_bucket when 'chat' then l.daily_questions
                           when 'qcm'  then l.daily_qcm
                           else l.daily_contents end
        from public.plan_limits l where l.plan = 'freemium');
  end if;

  insert into public.quota_counters (user_id, day, kind, used)
  values (p_user_id, current_date, v_bucket, 0)
  on conflict do nothing;

  -- Incrément atomique, uniquement s'il reste du quota.
  update public.quota_counters
     set used = used + 1
   where user_id = p_user_id and day = current_date and kind = v_bucket and used < v_limit;
  get diagnostics v_rows = row_count;

  return v_rows > 0;
end;
$$;

-- Seule la fonction serveur `ask` (service_role) incrémente les quotas.
revoke all on function public.check_and_increment_quota(text, text) from public, anon, authenticated;
grant execute on function public.check_and_increment_quota(text, text) to service_role;

drop function if exists public.get_quota_status(text);

create or replace function public.get_quota_status(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := public.effective_plan(p_user_id);
  v_lim  public.plan_limits;
  v_chat integer;
  v_qcm  integer;
  v_cont integer;
  v_exp  timestamptz;
begin
  v_lim := (select l from public.plan_limits l where l.plan = v_plan);
  if v_lim.plan is null then
    v_lim := (select l from public.plan_limits l where l.plan = 'freemium');
  end if;

  v_chat := coalesce((select sum(used) from public.quota_counters
                       where user_id = p_user_id and day = current_date and kind = 'chat'), 0);
  v_qcm  := coalesce((select sum(used) from public.quota_counters
                       where user_id = p_user_id and day = current_date and kind = 'qcm'), 0);
  v_cont := coalesce((select sum(used) from public.quota_counters
                       where user_id = p_user_id and day = current_date and kind = 'content'), 0);

  v_exp := (select max(expires_at) from public.subscriptions
             where user_id = p_user_id and status = 'active' and expires_at > now());

  return jsonb_build_object(
    'daily_used',    v_chat,
    'daily_limit',   v_lim.daily_questions,
    'plan',          v_plan,
    'trial_ends_at', null,
    'expires_at',    v_exp,
    'limits', jsonb_build_object(
      'questions',     v_lim.daily_questions,
      'qcm',           v_lim.daily_qcm,
      'contents',      v_lim.daily_contents,
      'used_qcm',      v_qcm,
      'used_contents', v_cont,
      'max_documents', v_lim.max_documents,
      'pdf_export',    v_lim.pdf_export,
      'history_days',  v_lim.history_days
    )
  );
end;
$$;

grant execute on function public.get_quota_status(text) to anon, authenticated, service_role;

-- ═══ BLOC 3 : paiement et activation ══════════════════════════════════════════════════════════════════════

create table if not exists public.payment_accounts (
  method         text primary key,      -- 'bankily' | 'masrivi' | 'sedad' | 'click'
  account_number text not null
);
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

alter table public.payment_accounts enable row level security;
alter table public.app_config       enable row level security;
drop policy if exists "payment_accounts_read" on public.payment_accounts;
create policy "payment_accounts_read" on public.payment_accounts for select using (true);
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config for select using (true);

insert into public.app_config (key, value) values ('support_whatsapp', '22241513211')
on conflict (key) do nothing;

-- Demande d'abonnement envoyée par l'app (reçu de paiement). Le montant est recalculé côté serveur.
create or replace function public.submit_payment_request(
  p_user_id        text,
  p_student_name   text,
  p_plan           text,
  p_duration       text,
  p_amount         numeric,
  p_payment_method text,
  p_reference_code text,
  p_screenshot_url text,
  p_subjects       text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_id     uuid;
begin
  if p_user_id is null or length(p_user_id) < 8 then
    raise exception 'invalid_user' using errcode = 'P0001';
  end if;
  if p_plan not in ('standard', 'premium') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_duration not in ('monthly', 'yearly') then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  if (select count(*) from public.subscriptions where user_id = p_user_id and status = 'pending') >= 3 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;

  v_amount := (
    select case when p_duration = 'yearly'
                then coalesce(price_yearly, price_monthly * 10)
                else price_monthly end
      from public.plans where plan = p_plan);

  v_id := gen_random_uuid();
  insert into public.subscriptions
    (id, user_id, plan, status, receipt_url, method, duration, amount, reference_code, student_name, subjects)
  values
    (v_id, p_user_id, p_plan, 'pending', p_screenshot_url, p_payment_method, p_duration, v_amount,
     p_reference_code, p_student_name, p_subjects);

  return v_id;
end;
$$;

grant execute on function public.submit_payment_request(text, text, text, text, numeric, text, text, text, text[])
  to anon, authenticated;

-- Activation par un admin, après vérification du reçu. La durée s'ajoute à un abonnement déjà actif.
create or replace function public.activate_subscription(p_id uuid)
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
         expires_at = v_start + case when v_duration = 'yearly' then interval '1 year' else interval '1 month' end
   where id = p_id;
end;
$$;

create or replace function public.reject_subscription(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.subscriptions set status = 'rejected' where id = p_id and status = 'pending';
end;
$$;

revoke all on function public.activate_subscription(uuid) from public, anon;
revoke all on function public.reject_subscription(uuid) from public, anon;
grant execute on function public.activate_subscription(uuid) to authenticated;
grant execute on function public.reject_subscription(uuid) to authenticated;

-- ═══ BLOC 4 : limite de documents par plan ════════════════════════════════════════════════════════════════

create or replace function public.enforce_document_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key   text;
  v_plan  text;
  v_max   integer;
  v_count integer;
begin
  -- Re-synchronisation d'un document déjà enregistré : pas de nouvelle limite.
  if exists (select 1 from public.documents where id = new.id) then
    return new;
  end if;

  v_key  := (select device_id from public.device_links where user_id = new.user_id);
  v_plan := public.effective_plan(coalesce(v_key, new.user_id::text));

  if not exists (select 1 from public.plan_limits where plan = v_plan) then
    v_plan := 'freemium';
  end if;
  v_max := (select max_documents from public.plan_limits where plan = v_plan);

  if v_max is null then
    return new;   -- illimité
  end if;

  v_count := (select count(*) from public.documents where user_id = new.user_id);
  if v_count >= v_max then
    raise exception 'document_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_limit on public.documents;
create trigger documents_limit
  before insert on public.documents
  for each row execute function public.enforce_document_limit();
