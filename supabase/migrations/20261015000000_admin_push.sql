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
