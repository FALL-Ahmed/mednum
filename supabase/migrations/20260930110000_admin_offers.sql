-- Gestion des offres depuis le panneau d'administration : prix et limites de chaque plan.
--
-- Les tables plans, plan_prices et plan_limits sont lisibles par tous mais ne peuvent être modifiées que côté serveur.
-- Ces fonctions permettent aux administrateurs (table admin_users) de les modifier ; tout changement s'applique tout de
-- suite sur le site, l'application et le contrôle des quotas (qui lisent ces tables en direct).
--
-- À APPLIQUER MANUELLEMENT, un seul bloc.

-- Prix d'un plan en ouguiyas (MRU) : mensuel et annuel.
create or replace function public.admin_set_plan_price_mru(p_plan text, p_monthly numeric, p_yearly numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_plan not in ('standard', 'premium') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_monthly is null or p_monthly <= 0 or p_yearly is null or p_yearly <= 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;
  update public.plans set price_monthly = p_monthly, price_yearly = p_yearly where plan = p_plan;
end;
$$;

-- Prix d'un plan dans une autre devise : XOF (FCFA) ou MAD (dirham).
create or replace function public.admin_set_plan_price_fx(p_plan text, p_currency text, p_monthly numeric, p_yearly numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_plan not in ('standard', 'premium') or p_currency not in ('XOF', 'MAD') then
    raise exception 'invalid_plan_or_currency' using errcode = 'P0001';
  end if;
  if p_monthly is null or p_monthly <= 0 or p_yearly is null or p_yearly <= 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;
  insert into public.plan_prices (plan, currency, monthly, yearly) values (p_plan, p_currency, p_monthly, p_yearly)
  on conflict (plan, currency) do update set monthly = excluded.monthly, yearly = excluded.yearly;
end;
$$;

-- Limites d'un plan. NULL = illimité pour le nombre de documents et la durée d'historique.
create or replace function public.admin_set_plan_limits(
  p_plan text,
  p_daily_questions integer,
  p_daily_qcm integer,
  p_daily_contents integer,
  p_max_documents integer,
  p_pdf_export boolean,
  p_history_days integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_plan not in ('freemium', 'standard', 'premium') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_daily_questions is null or p_daily_questions < 0 or p_daily_qcm is null or p_daily_qcm < 0
     or p_daily_contents is null or p_daily_contents < 0 then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  if (p_max_documents is not null and p_max_documents < 0) or (p_history_days is not null and p_history_days < 0) then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;

  update public.plan_limits
     set daily_questions = p_daily_questions,
         daily_qcm       = p_daily_qcm,
         daily_contents  = p_daily_contents,
         max_documents   = p_max_documents,
         pdf_export      = coalesce(p_pdf_export, false),
         history_days    = p_history_days
   where plan = p_plan;

  -- L'essai gratuit suit les limites du plan gratuit.
  if p_plan = 'freemium' then
    update public.plan_limits
       set daily_questions = p_daily_questions,
           daily_qcm       = p_daily_qcm,
           daily_contents  = p_daily_contents,
           max_documents   = p_max_documents,
           pdf_export      = coalesce(p_pdf_export, false),
           history_days    = p_history_days
     where plan = 'trial';
  end if;
end;
$$;

revoke all on function public.admin_set_plan_price_mru(text, numeric, numeric) from public, anon;
revoke all on function public.admin_set_plan_price_fx(text, text, numeric, numeric) from public, anon;
revoke all on function public.admin_set_plan_limits(text, integer, integer, integer, integer, boolean, integer) from public, anon;
grant execute on function public.admin_set_plan_price_mru(text, numeric, numeric) to authenticated;
grant execute on function public.admin_set_plan_price_fx(text, text, numeric, numeric) to authenticated;
grant execute on function public.admin_set_plan_limits(text, integer, integer, integer, integer, boolean, integer) to authenticated;
