-- Prix par devise (Sénégal en FCFA via PayDunya, Maroc en MAD) et paiement automatique PayDunya.
--
-- plan_prices : prix affichés et facturés hors Mauritanie. Le prix en MRU reste dans `plans`.
-- La fonction `paydunya-intent` lit le montant ici (jamais dans la requête du navigateur).
-- Les prix ci-dessous sont des valeurs de départ (conversion indicative) : à ajuster quand tu veux, voir supabase/ops/facturation.sql.
--
-- À APPLIQUER MANUELLEMENT, un seul bloc, après les migrations précédentes.

create table if not exists public.plan_prices (
  plan     text    not null,
  currency text    not null,          -- 'XOF' (FCFA) | 'MAD'
  monthly  numeric not null,
  yearly   numeric not null,
  primary key (plan, currency)
);

alter table public.plan_prices enable row level security;
drop policy if exists "plan_prices_read" on public.plan_prices;
create policy "plan_prices_read" on public.plan_prices for select using (true);

insert into public.plan_prices (plan, currency, monthly, yearly) values
  ('standard', 'XOF', 13000, 117000),
  ('premium',  'XOF', 25000, 225000),
  ('standard', 'MAD', 220,   1980),
  ('premium',  'MAD', 400,   3600)
on conflict (plan, currency) do nothing;
