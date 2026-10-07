-- Déclencheur : à chaque nouvelle demande d'abonnement par reçu, la base appelle l'Edge Function notify-admin,
-- qui envoie la notification push aux appareils de l'admin.
--
-- À exécuter UNE FOIS dans l'éditeur SQL de Supabase, après avoir remplacé :
--   MON_PROJET   par la référence du projet (la partie avant .supabase.co dans l'adresse du projet)
--   MON_CODE     par le même code que le secret NOTIFY_SECRET de la fonction
-- Ne commite jamais ce fichier une fois les valeurs remplacées.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_admin_new_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'pending' and coalesce(new.provider, 'manual') = 'manual' then
    perform net.http_post(
      url     := 'https://MON_PROJET.supabase.co/functions/v1/notify-admin',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', 'MON_CODE'),
      body    := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new))
    );
  end if;
  return new;
exception when others then
  -- une panne de notification ne doit jamais empêcher l'élève d'envoyer sa demande
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_new_subscription on public.subscriptions;
create trigger trg_notify_admin_new_subscription
  after insert on public.subscriptions
  for each row execute function public.notify_admin_new_subscription();
