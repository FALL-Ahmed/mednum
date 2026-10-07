-- TOUT À EXÉCUTER d'un coup dans Supabase > SQL Editor > New query > Run.
-- Rejouable sans risque (les parties déjà faites sont ignorées ou remplacées).

-- ═══ 20261010000000_promotions ═══
-- Promotions : réductions en pourcentage sur les prix des offres, avec une date de début et une date de fin.
-- Une promotion s'arrête TOUTE SEULE à sa date de fin (rien à désactiver à la main) ; l'admin peut aussi la suspendre.
--
-- Le prix à payer est toujours recalculé côté serveur : plan_price() donne le prix de base, la réduction et le prix final.
-- Le site, l'application et les paiements (reçu manuel, PayDunya) s'appuient sur elle, donc le prix affiché
-- est le prix réellement demandé.
--
-- À APPLIQUER MANUELLEMENT, un seul bloc, dans l'éditeur SQL du tableau de bord.

create table if not exists public.price_promotions (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,                                   -- nom interne (marketing)
  label            text        not null default '',                        -- texte montré aux étudiants (ex. « Offre de rentrée »)
  discount_percent integer     not null check (discount_percent between 1 and 90),
  plans            text[]      not null default '{standard,premium}',
  durations        text[]      not null default '{monthly,yearly}',
  countries        text[]      not null default '{mr,sn,ma}',              -- mr = Mauritanie (MRU), sn = Sénégal (FCFA), ma = Maroc (MAD)
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  constraint price_promotions_dates check (ends_at > starts_at)
);

alter table public.price_promotions enable row level security;
drop policy if exists "price_promotions_admin_all" on public.price_promotions;
create policy "price_promotions_admin_all" on public.price_promotions for all using (public.is_admin()) with check (public.is_admin());

-- Ce que chaque abonnement a réellement coûté, pour les chiffres de l'admin
alter table public.subscriptions
  add column if not exists list_price       numeric,
  add column if not exists discount_percent integer,
  add column if not exists promo_id         uuid;

-- La meilleure promotion en cours pour une offre, une durée et un pays (les réductions ne se cumulent pas).
create or replace function public.best_promo(p_plan text, p_duration text, p_country text)
returns public.price_promotions
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.price_promotions p
   where p.active
     and now() >= p.starts_at and now() < p.ends_at
     and p_plan = any(p.plans) and p_duration = any(p.durations) and p_country = any(p.countries)
   order by p.discount_percent desc, p.created_at desc
   limit 1;
$$;

-- Prix d'une offre : prix de base, réduction, prix final (arrondi à l'unité).
create or replace function public.plan_price(p_plan text, p_duration text, p_currency text default 'MRU')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base    numeric;
  v_country text;
  v_p       public.price_promotions;
  v_pct     integer := 0;
begin
  if p_plan not in ('standard', 'premium') or p_duration not in ('monthly', 'yearly') then
    raise exception 'invalid_plan';
  end if;

  if p_currency = 'MRU' then
    v_country := 'mr';
    v_base := (select case when p_duration = 'yearly' then coalesce(price_yearly, price_monthly * 10) else price_monthly end
                 from public.plans where plan = p_plan);
  else
    v_country := case p_currency when 'XOF' then 'sn' when 'MAD' then 'ma' else null end;
    v_base := (select case when p_duration = 'yearly' then yearly else monthly end
                 from public.plan_prices where plan = p_plan and currency = p_currency);
  end if;
  if v_base is null or v_country is null then raise exception 'invalid_plan'; end if;

  v_p := public.best_promo(p_plan, p_duration, v_country);
  if v_p.id is not null then v_pct := v_p.discount_percent; end if;

  return jsonb_build_object(
    'base', v_base,
    'discount_percent', v_pct,
    'final', round(v_base * (100 - v_pct) / 100.0),
    'promo_id', v_p.id,
    'label', v_p.label,
    'ends_at', v_p.ends_at
  );
end;
$$;

-- Les promotions en cours, visibles de tous (pour afficher les prix barrés sur le site et dans l'application).
create or replace function public.public_promotions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'label', p.label, 'discount_percent', p.discount_percent,
           'plans', p.plans, 'durations', p.durations, 'countries', p.countries, 'ends_at', p.ends_at)
         order by p.discount_percent desc), '[]'::jsonb)
    from public.price_promotions p
   where p.active and now() >= p.starts_at and now() < p.ends_at;
$$;

revoke all on function public.best_promo(text, text, text) from public;
revoke all on function public.plan_price(text, text, text)  from public;
grant execute on function public.plan_price(text, text, text) to anon, authenticated, service_role;
grant execute on function public.public_promotions()          to anon, authenticated;

-- Demande d'abonnement par reçu : le montant est recalculé ici, promotion comprise (ce que l'étudiant voit = ce qu'il paie).
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
  v_price jsonb;
  v_id    uuid;
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

  v_price := public.plan_price(p_plan, p_duration, 'MRU');

  v_id := gen_random_uuid();
  insert into public.subscriptions
    (id, user_id, plan, status, receipt_url, method, duration, amount, list_price, discount_percent, promo_id,
     reference_code, student_name, subjects)
  values
    (v_id, p_user_id, p_plan, 'pending', p_screenshot_url, p_payment_method, p_duration,
     (v_price ->> 'final')::numeric, (v_price ->> 'base')::numeric, (v_price ->> 'discount_percent')::integer,
     nullif(v_price ->> 'promo_id', '')::uuid,
     p_reference_code, p_student_name, p_subjects);

  return v_id;
end;
$$;

grant execute on function public.submit_payment_request(text, text, text, text, numeric, text, text, text, text[])
  to anon, authenticated;

-- ═══ 20261011000000_promo_price_overrides ═══
-- Promotions : prix promo arrondis à la main.
-- price_overrides : { "offre:pays:durée": prix_final }, ex. { "standard:mr:monthly": 650 }.
-- Une clé absente = calcul automatique (prix de base − pourcentage). À exécuter après 20261010000000_promotions.sql.

alter table public.price_promotions
  add column if not exists price_overrides jsonb not null default '{}'::jsonb;

create or replace function public.plan_price(p_plan text, p_duration text, p_currency text default 'MRU')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base     numeric;
  v_country  text;
  v_p        public.price_promotions;
  v_final    numeric;
  v_override numeric;
begin
  if p_plan not in ('standard', 'premium') or p_duration not in ('monthly', 'yearly') then
    raise exception 'invalid_plan';
  end if;

  if p_currency = 'MRU' then
    v_country := 'mr';
    v_base := (select case when p_duration = 'yearly' then coalesce(price_yearly, price_monthly * 10) else price_monthly end
                 from public.plans where plan = p_plan);
  else
    v_country := case p_currency when 'XOF' then 'sn' when 'MAD' then 'ma' else null end;
    v_base := (select case when p_duration = 'yearly' then yearly else monthly end
                 from public.plan_prices where plan = p_plan and currency = p_currency);
  end if;
  if v_base is null or v_country is null then raise exception 'invalid_plan'; end if;

  v_final := v_base;
  v_p := public.best_promo(p_plan, p_duration, v_country);
  if v_p.id is not null then
    v_override := nullif(v_p.price_overrides ->> (p_plan || ':' || v_country || ':' || p_duration), '')::numeric;
    if v_override is not null and v_override > 0 and v_override <= v_base then
      v_final := v_override;
    else
      v_final := round(v_base * (100 - v_p.discount_percent) / 100.0);
    end if;
  end if;

  return jsonb_build_object(
    'base', v_base,
    -- pourcentage réel (il diffère du pourcentage de départ quand un prix a été arrondi à la main)
    'discount_percent', case when v_p.id is null or v_base = 0 then 0 else greatest(0, round((1 - v_final / v_base) * 100)) end,
    'final', v_final,
    'promo_id', v_p.id,
    'label', v_p.label,
    'ends_at', v_p.ends_at
  );
end;
$$;

create or replace function public.public_promotions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'label', p.label, 'discount_percent', p.discount_percent,
           'plans', p.plans, 'durations', p.durations, 'countries', p.countries, 'ends_at', p.ends_at,
           'price_overrides', p.price_overrides)
         order by p.discount_percent desc), '[]'::jsonb)
    from public.price_promotions p
   where p.active and now() >= p.starts_at and now() < p.ends_at;
$$;

grant execute on function public.plan_price(text, text, text) to anon, authenticated, service_role;
grant execute on function public.public_promotions()          to anon, authenticated;

-- ═══ 20261012000000_payment_accounts_admin ═══
-- Paiements : l'administrateur peut modifier les numéros de paiement (Bankily, Masrivi, Sedad, Click)
-- et le numéro WhatsApp du support depuis l'onglet « Paiements » des Paramètres.
-- La lecture reste publique (l'application affiche le numéro à l'étudiant).

drop policy if exists "payment_accounts_admin_write" on public.payment_accounts;
create policy "payment_accounts_admin_write" on public.payment_accounts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "app_config_admin_write" on public.app_config;
create policy "app_config_admin_write" on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());

-- ═══ 20261013000000_gift_subscription ═══
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

-- ═══ 20261014000000_admin_set_plan ═══
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

-- ═══ 20261015000000_admin_push ═══
-- Notifications push de l'administration : appareils de l'admin abonnés aux notifications
-- (un message à chaque abonnement à valider, envoyé par l'Edge Function notify-admin).
create table if not exists public.admin_push_subscriptions (
  endpoint   text primary key,
  user_id    uuid        not null,
  p256dh     text        not null,
  auth       text        not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.admin_push_subscriptions enable row level security;

-- Seul un administrateur peut enregistrer, lire ou retirer ses appareils.
drop policy if exists "admin_push_admin_all" on public.admin_push_subscriptions;
create policy "admin_push_admin_all" on public.admin_push_subscriptions
  for all using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
