-- Paiement automatique des abonnements en Mauritanie via KitPay (validation par SMS d'opérateur).
--
-- Principe : la fonction `kitpay-intent` crée un paiement chez KitPay et enregistre une demande « pending »
-- (reference_code = référence KitPay). Quand KitPay confirme le paiement (webhook signé reçu par la fonction
-- `kitpay-webhook`), activate_subscription_by_ref() active l'abonnement sans intervention humaine.
--
-- À APPLIQUER MANUELLEMENT après les migrations des plans (20260930020000). Un seul bloc, sans « select into ».

alter table public.subscriptions
  add column if not exists provider text not null default 'manual';   -- 'manual' (reçu envoyé) ou 'kitpay'

create index if not exists subscriptions_reference_idx on public.subscriptions (reference_code);

-- Active une demande en attente à partir de sa référence. Réservée au serveur (service_role).
-- Idempotente : renvoie true seulement la première fois. La durée s'ajoute à un abonnement déjà actif.
create or replace function public.activate_subscription_by_ref(p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_user     text;
  v_duration text;
  v_start    timestamptz;
begin
  v_id := (select id from public.subscriptions
            where reference_code = p_ref and status = 'pending'
            order by created_at desc limit 1);
  if v_id is null then
    return false;
  end if;

  v_user     := (select user_id  from public.subscriptions where id = v_id);
  v_duration := (select duration from public.subscriptions where id = v_id);

  v_start := (
    select greatest(now(), coalesce(max(expires_at), now()))
      from public.subscriptions
     where user_id = v_user and status = 'active' and expires_at > now());

  update public.subscriptions
     set status = 'active',
         activated_at = now(),
         expires_at = v_start + case when v_duration = 'yearly' then interval '1 year' else interval '1 month' end
   where id = v_id and status = 'pending';

  return found;
end;
$$;

revoke all on function public.activate_subscription_by_ref(text) from public, anon, authenticated;
grant execute on function public.activate_subscription_by_ref(text) to service_role;

-- Statut d'un paiement pour l'étudiant connecté (la page d'abonnement l'interroge au retour du paiement).
-- Un étudiant ne voit que ses propres demandes (clé de quota de son compte : appareil relié, sinon uid).
create or replace function public.payment_status(p_ref text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.status
    from public.subscriptions s
   where s.reference_code = p_ref
     and (
       s.user_id = auth.uid()::text
       or s.user_id = (select d.device_id from public.device_links d where d.user_id = auth.uid())
     )
   order by s.created_at desc
   limit 1;
$$;

revoke all on function public.payment_status(text) from public, anon;
grant execute on function public.payment_status(text) to authenticated;
