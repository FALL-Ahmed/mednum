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
