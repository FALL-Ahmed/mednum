-- Révision à deux, suite : trois nouvelles façons de réviser à deux, en plus des QCM.
--   • « room »       : une salle avec Dr. Ahmed, où les deux étudiants lui posent des questions et se parlent.
--   • « case »       : un cas clinique fait à deux, étape par étape, puis comparaison des raisonnements.
--   • « flashcards » : un jeu de flashcards parcouru à deux, avec le score de chacun.
--
-- Même principe que les QCM : le contenu est COPIÉ dans la session, l'invité ne voit jamais les autres documents de l'hôte.
-- À APPLIQUER MANUELLEMENT, un seul bloc, dans l'éditeur SQL du tableau de bord (après 20261006000000_duo.sql).

update public.plans set label = 'Premium' where plan = 'premium';

alter table public.duo_sessions
  add column if not exists kind    text  not null default 'qcm',
  add column if not exists payload jsonb;

alter table public.duo_messages
  add column if not exists is_ai boolean not null default false,
  add column if not exists tag   text;
alter table public.duo_messages alter column user_id drop not null;

-- Création d'une session non-QCM (réservée au plan Premium ou à un administrateur).
create or replace function public.duo_create_v2(p_kind text, p_title text, p_payload jsonb, p_name text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_plan  text;
  v_code  text;
  v_id    uuid;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i       int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('room', 'case', 'flashcards') then raise exception 'invalid_kind'; end if;
  v_plan := public.effective_plan(coalesce(public.account_quota_key(), v_uid::text));
  if v_plan <> 'premium' and not public.is_admin() then raise exception 'duo_plan_required'; end if;
  if p_payload is null or length(p_payload::text) > 400000 then raise exception 'invalid_payload'; end if;

  if p_kind = 'flashcards' then
    if jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) < 1 or jsonb_array_length(p_payload) > 30 then
      raise exception 'invalid_payload';
    end if;
  elsif p_kind = 'case' then
    if jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload -> 'stages') <> 'array'
       or jsonb_array_length(p_payload -> 'stages') <> 4 then
      raise exception 'invalid_payload';
    end if;
  else
    if jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload -> 'chunks') <> 'array'
       or jsonb_array_length(p_payload -> 'chunks') < 1 then
      raise exception 'invalid_payload';
    end if;
  end if;

  if (select count(*) from public.duo_sessions where host_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'duo_daily_limit';
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.duo_sessions where code = v_code);
  end loop;

  insert into public.duo_sessions (code, host_id, title, questions, kind, payload)
  values (v_code, v_uid, left(coalesce(p_title, ''), 200), '[]'::jsonb, p_kind, p_payload)
  returning id into v_id;
  insert into public.duo_members (session_id, user_id, name) values (v_id, v_uid, left(coalesce(p_name, ''), 40));
  return v_code;
end;
$$;

-- État de la session (ajoute le type, le contenu, et les messages de Dr. Ahmed).
create or replace function public.duo_state(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   public.duo_sessions;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_s := (select s from public.duo_sessions s where s.code = upper(trim(p_code)));
  if v_s.id is null then raise exception 'duo_not_found'; end if;
  if not exists (select 1 from public.duo_members where session_id = v_s.id and user_id = v_uid) then
    raise exception 'duo_not_member';
  end if;

  return jsonb_build_object(
    'code', v_s.code,
    'kind', v_s.kind,
    'title', v_s.title,
    'questions', v_s.questions,
    'payload', v_s.payload,
    'expires_at', v_s.expires_at,
    'me', v_uid,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'name', m.name,
        'is_host', m.user_id = v_s.host_id,
        'finished', m.finished,
        'answered', (select count(*) from public.duo_answers a where a.session_id = v_s.id and a.user_id = m.user_id)
      ) order by m.joined_at)
      from public.duo_members m where m.session_id = v_s.id), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'idx', a.idx, 'sel', a.sel, 'points', a.points) order by a.idx)
      from public.duo_answers a
      where a.session_id = v_s.id
        and (a.user_id = v_uid
             or exists (select 1 from public.duo_answers mine
                         where mine.session_id = v_s.id and mine.user_id = v_uid and mine.idx = a.idx))), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(x order by x.id) from (
        select g.id, g.user_id, g.body, g.created_at, g.is_ai, g.tag from public.duo_messages g
         where g.session_id = v_s.id order by g.id desc limit 80) x), '[]'::jsonb)
  );
end;
$$;

-- Cas clinique : réponse écrite à une étape (0 à 3 : les quatre étapes, 4 : diagnostic final). Définitive.
create or replace function public.duo_submit_text(p_code text, p_idx integer, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_s    public.duo_sessions;
  v_done integer;
  v_t    text := left(trim(coalesce(p_text, '')), 1500);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_s := (select s from public.duo_sessions s where s.code = upper(trim(p_code)));
  if v_s.id is null then raise exception 'duo_not_found'; end if;
  if v_s.kind <> 'case' then raise exception 'invalid_kind'; end if;
  if not exists (select 1 from public.duo_members where session_id = v_s.id and user_id = v_uid) then
    raise exception 'duo_not_member';
  end if;
  if v_s.expires_at < now() then raise exception 'duo_expired'; end if;
  if p_idx < 0 or p_idx > 4 then raise exception 'invalid_index'; end if;
  if v_t = '' then raise exception 'invalid_answer'; end if;

  v_done := (select count(*) from public.duo_answers where session_id = v_s.id and user_id = v_uid);
  if p_idx > v_done then raise exception 'invalid_index'; end if;

  insert into public.duo_answers (session_id, user_id, idx, sel, points)
  values (v_s.id, v_uid, p_idx, to_jsonb(v_t), 0)
  on conflict (session_id, user_id, idx) do nothing;

  if (select count(*) from public.duo_answers where session_id = v_s.id and user_id = v_uid) >= 5 then
    update public.duo_members set finished = true where session_id = v_s.id and user_id = v_uid;
  end if;
end;
$$;

-- Flashcards : « je savais » ou « je ne savais pas » pour une carte. Définitif.
create or replace function public.duo_rate(p_code text, p_idx integer, p_known boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_s     public.duo_sessions;
  v_total integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_s := (select s from public.duo_sessions s where s.code = upper(trim(p_code)));
  if v_s.id is null then raise exception 'duo_not_found'; end if;
  if v_s.kind <> 'flashcards' then raise exception 'invalid_kind'; end if;
  if not exists (select 1 from public.duo_members where session_id = v_s.id and user_id = v_uid) then
    raise exception 'duo_not_member';
  end if;
  if v_s.expires_at < now() then raise exception 'duo_expired'; end if;
  v_total := jsonb_array_length(v_s.payload);
  if p_idx < 0 or p_idx >= v_total then raise exception 'invalid_index'; end if;

  insert into public.duo_answers (session_id, user_id, idx, sel, points)
  values (v_s.id, v_uid, p_idx, case when p_known then '["known"]'::jsonb else '["unknown"]'::jsonb end, case when p_known then 1 else 0 end)
  on conflict (session_id, user_id, idx) do nothing;

  if (select count(*) from public.duo_answers where session_id = v_s.id and user_id = v_uid) >= v_total then
    update public.duo_members set finished = true where session_id = v_s.id and user_id = v_uid;
  end if;
end;
$$;

-- Mes sessions récentes : ajoute le type et le total adapté.
create or replace function public.duo_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
  from (
    select s.code, s.title, s.created_at, s.expires_at, s.kind,
           case s.kind
             when 'qcm' then jsonb_array_length(s.questions)
             when 'flashcards' then jsonb_array_length(s.payload)
             when 'case' then 5
             else 0
           end as total,
           (s.host_id = auth.uid()) as is_host,
           (select count(*) from public.duo_answers a where a.session_id = s.id and a.user_id = auth.uid()) as answered,
           (select coalesce(sum(a.points), 0) from public.duo_answers a where a.session_id = s.id and a.user_id = auth.uid()) as points,
           (select string_agg(m2.name, ' · ' order by m2.joined_at) from public.duo_members m2
             where m2.session_id = s.id and m2.user_id <> auth.uid()) as partner
      from public.duo_sessions s
      join public.duo_members m on m.session_id = s.id and m.user_id = auth.uid()
     order by s.created_at desc
     limit 20) r;
$$;

revoke all on function public.duo_create_v2(text, text, jsonb, text) from public;
revoke all on function public.duo_submit_text(text, integer, text)   from public;
revoke all on function public.duo_rate(text, integer, boolean)       from public;
grant execute on function public.duo_create_v2(text, text, jsonb, text) to authenticated;
grant execute on function public.duo_submit_text(text, integer, text)   to authenticated;
grant execute on function public.duo_rate(text, integer, boolean)       to authenticated;
