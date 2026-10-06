-- Rattachement d'un compte (auth.uid()) à l'identifiant d'appareil sous lequel vivent quota et abonnement.
--
-- Contexte : quota_usage / subscriptions sont rangés sous un identifiant d'appareil (deviceId) généré
-- localement par l'app. Pour qu'un étudiant retrouve son plan sur un nouveau téléphone ou sur le site
-- (connexion Google), on relie son compte à SON identifiant d'origine, sans déplacer aucune donnée :
--   - l'app, une fois connectée, adopte cet identifiant (fonction link_device / account_quota_key) ;
--   - la fonction `ask` traduit uid -> identifiant pour le quota (voir supabase/functions/ask).
-- Aucun abonnement ni quota existant n'est modifié.
--
-- À APPLIQUER MANUELLEMENT après relecture (supabase db push ou éditeur SQL).

create table if not exists public.device_links (
  device_id  text        primary key,
  user_id    uuid        not null unique references auth.users(id) on delete cascade,
  linked_at  timestamptz not null default now()
);

alter table public.device_links enable row level security;
-- Aucune policy : la table n'est accessible que via les fonctions ci-dessous et la fonction `ask`.

-- Relie le compte connecté à l'identifiant d'appareil donné (le premier lien gagne).
-- Renvoie l'identifiant à utiliser pour le quota : celui déjà lié au compte s'il existe.
create or replace function public.link_device(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_device_id is null or length(p_device_id) < 8 then
    return jsonb_build_object('linked', false, 'reason', 'invalid_device_id');
  end if;

  v_key := (select device_id from public.device_links where user_id = auth.uid());
  if v_key is not null then
    return jsonb_build_object('linked', true, 'quota_key', v_key);
  end if;

  -- Cet appareil appartient déjà à un autre compte : on ne le partage pas.
  if exists (select 1 from device_links where device_id = p_device_id) then
    return jsonb_build_object('linked', false, 'reason', 'device_already_linked');
  end if;

  insert into device_links (device_id, user_id) values (p_device_id, auth.uid());
  return jsonb_build_object('linked', true, 'quota_key', p_device_id);
end;
$$;

-- Identifiant de quota du compte connecté (null si aucun appareil relié).
create or replace function public.account_quota_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select device_id from public.device_links where user_id = auth.uid();
$$;

revoke all on function public.link_device(text) from public;
revoke all on function public.account_quota_key() from public;
grant execute on function public.link_device(text) to authenticated;
grant execute on function public.account_quota_key() to authenticated;
