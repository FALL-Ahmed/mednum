-- Planification : chaque jour à 9 h (heure de Nouakchott = UTC), la base appelle l'Edge Function send-email
-- pour envoyer les relances et les rappels de fin d'abonnement.
--
-- À exécuter UNE FOIS dans l'éditeur SQL de Supabase, après avoir remplacé :
--   MON_PROJET   par la référence du projet (la partie avant .supabase.co)
--   MON_CODE     par le même code que le secret NOTIFY_SECRET
-- Ne commite jamais ce fichier une fois les valeurs remplacées.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Retire l'ancienne planification si elle existe (permet de relancer ce fichier)
select cron.unschedule('axone-daily-emails') where exists (select 1 from cron.job where jobname = 'axone-daily-emails');

select cron.schedule(
  'axone-daily-emails',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://MON_PROJET.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', 'MON_CODE'),
    body    := '{"type":"daily"}'::jsonb
  );
  $$
);
