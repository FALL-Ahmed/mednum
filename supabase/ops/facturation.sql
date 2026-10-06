-- Mode d'emploi facturation : requêtes à copier dans l'éditeur SQL de Supabase (une par une).
-- Ce fichier n'est PAS une migration : ne le lance pas en entier.

-- ═══ 1. À faire UNE FOIS après avoir appliqué 20260930010000 et 20260930020000 ═══════════════════

-- 1a. Te déclarer administrateur (remplace l'adresse par celle de ton compte Supabase Auth).
--     Il faut d'abord te connecter une fois à l'admin ou au site pour que ton compte existe.
insert into public.admin_users (user_id)
select id from auth.users where email = 'TON_ADRESSE_EMAIL'
on conflict do nothing;

-- 1b. Numéros de paiement affichés dans l'app (remplace les valeurs, supprime les lignes inutiles).
insert into public.payment_accounts (method, account_number) values
  ('bankily', 'NUMERO_BANKILY'),
  ('masrivi', 'NUMERO_MASRIVI'),
  ('sedad',   'NUMERO_SEDAD'),
  ('click',   'NUMERO_CLICK')
on conflict (method) do update set account_number = excluded.account_number;

-- 1c. Stockage des reçus de paiement (si le bucket n'existe pas encore).
insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', true)
on conflict (id) do nothing;

drop policy if exists "payment_screenshots_insert" on storage.objects;
create policy "payment_screenshots_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-screenshots');

-- ═══ 2. Au quotidien ═══════════════════════════════════════════════════════════════════════════

-- 2a. Voir les demandes de paiement à vérifier (avec le lien du reçu).
select id, created_at, student_name, plan, duration, amount, method, reference_code, receipt_url
from public.subscriptions
where status = 'pending'
order by created_at;

-- 2b. Activer un abonnement après avoir vérifié le reçu (remplace l'identifiant).
--     Nécessite d'être connecté en tant qu'admin : depuis l'éditeur SQL, utilise plutôt la version 2c.
-- select public.activate_subscription('ID_DE_LA_DEMANDE');

-- 2c. Version pour l'éditeur SQL (qui n'a pas de session utilisateur) : active directement.
update public.subscriptions
set status = 'active',
    activated_at = now(),
    expires_at = greatest(now(), coalesce((select max(s2.expires_at) from public.subscriptions s2
                                           where s2.user_id = subscriptions.user_id
                                             and s2.status = 'active' and s2.expires_at > now()), now()))
                 + case when duration = 'yearly' then interval '1 year' else interval '1 month' end
where id = 'ID_DE_LA_DEMANDE' and status = 'pending';

-- 2d. Refuser une demande.
update public.subscriptions set status = 'rejected' where id = 'ID_DE_LA_DEMANDE' and status = 'pending';

-- 2e. Abonnements actifs et revenus mensuels approximatifs.
select plan, duration, count(*) as abonnes, sum(amount) as total
from public.subscriptions
where status = 'active' and expires_at > now()
group by plan, duration;

-- 2f. Changer les limites d'un plan (exemple : Gratuit passe à 10 questions par jour).
-- update public.plan_limits set daily_questions = 10 where plan = 'freemium';

-- 2g. Changer un prix (exemple : Standard à 900 MRU par mois).
-- update public.plans set price_monthly = 900 where plan = 'standard';

-- ── Prix en FCFA (Sénégal) et MAD (Maroc) ─────────────────────────────────────────────
-- update public.plan_prices set monthly = 13000, yearly = 117000 where plan = 'standard' and currency = 'XOF';
-- update public.plan_prices set monthly = 25000, yearly = 225000 where plan = 'premium'  and currency = 'XOF';
