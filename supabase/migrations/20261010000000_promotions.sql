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
