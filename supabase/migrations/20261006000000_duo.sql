-- Révision à deux (plan Duo) : une série de QCM partagée entre un abonné Duo et un invité (gratuit, le temps de la session).
--
-- Principe : l'abonné crée une session à partir d'une série de QCM ; les questions sont COPIÉES dans la session, donc
-- l'invité ne voit jamais le cours de l'abonné. Chacun répond à son rythme. On voit la progression de l'autre en direct
-- (le site relit l'état toutes les quelques secondes). Les réponses de l'autre ne s'affichent, question par question,
-- qu'une fois que l'on a soi-même validé cette question.
--
-- Tout passe par des fonctions (SECURITY DEFINER) : les tables ne sont lisibles par personne en direct.
--
-- À APPLIQUER MANUELLEMENT, un seul bloc, dans l'éditeur SQL du tableau de bord.

-- Le plan « premium » s'appelle Duo à l'écran (la clé interne reste « premium »).
update public.plans set label = 'Duo' where plan = 'premium';

create table if not exists public.duo_sessions (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null unique,
  host_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default '',
  questions   jsonb       not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '48 hours'
);

create table if not exists public.duo_members (
  session_id  uuid        not null references public.duo_sessions(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null default '',
  joined_at   timestamptz not null default now(),
  finished    boolean     not null default false,
  primary key (session_id, user_id)
);

create table if not exists public.duo_answers (
  session_id  uuid        not null references public.duo_sessions(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  idx         integer     not null,
  sel         jsonb       not null default '[]'::jsonb,
  points      integer     not null default 0,
  answered_at timestamptz not null default now(),
  primary key (session_id, user_id, idx)
);

create table if not exists public.duo_messages (
  id          bigint      generated always as identity primary key,
  session_id  uuid        not null references public.duo_sessions(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  body        text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists duo_members_user_idx on public.duo_members (user_id, joined_at desc);
create index if not exists duo_messages_session_idx on public.duo_messages (session_id, id);

alter table public.duo_sessions enable row level security;
alter table public.duo_members  enable row level security;
alter table public.duo_answers  enable row level security;
alter table public.duo_messages enable row level security;
-- Aucune politique : l'accès direct aux tables est refusé, tout passe par les fonctions ci-dessous.

-- Points d'une question : 10 si toutes les bonnes réponses (et rien d'autre), 5 si au moins une bonne, sinon 0.
-- (Même règle que sur le site et dans l'app.)
create or replace function public.duo_score(p_sel jsonb, p_good jsonb)
returns integer
language sql
immutable
as $$
  select case
    when jsonb_array_length(p_sel) = 0 then 0
    when (select count(*) from jsonb_array_elements_text(p_sel)) = jsonb_array_length(p_good)
         and not exists (select 1 from jsonb_array_elements_text(p_good) g where not (p_sel ? g)) then 10
    when exists (select 1 from jsonb_array_elements_text(p_good) g where p_sel ? g) then 5
    else 0
  end;
$$;

-- Création d'une session (réservée au plan Duo, ou à un administrateur). Renvoie le code à partager.
create or replace function public.duo_create(p_title text, p_questions jsonb, p_name text default '')
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
  v_plan := public.effective_plan(coalesce(public.account_quota_key(), v_uid::text));
  if v_plan <> 'premium' and not public.is_admin() then raise exception 'duo_plan_required'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 20 then
    raise exception 'invalid_questions';
  end if;

  -- Limite : 10 sessions créées par jour
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

  insert into public.duo_sessions (code, host_id, title, questions)
  values (v_code, v_uid, left(coalesce(p_title, ''), 200), p_questions)
  returning id into v_id;
  insert into public.duo_members (session_id, user_id, name) values (v_id, v_uid, left(coalesce(p_name, ''), 40));
  return v_code;
end;
$$;

-- Rejoindre une session avec son code (deux personnes au maximum).
create or replace function public.duo_join(p_code text, p_name text default '')
returns text
language plpgsql
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
  if v_s.expires_at < now() then raise exception 'duo_expired'; end if;
  if exists (select 1 from public.duo_members where session_id = v_s.id and user_id = v_uid) then
    return v_s.code;
  end if;
  if (select count(*) from public.duo_members where session_id = v_s.id) >= 2 then raise exception 'duo_full'; end if;
  insert into public.duo_members (session_id, user_id, name) values (v_s.id, v_uid, left(coalesce(p_name, ''), 40));
  return v_s.code;
end;
$$;

-- État complet de la session pour celui qui la regarde.
-- Les réponses de l'autre ne sont renvoyées que pour les questions que j'ai déjà validées.
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
    'title', v_s.title,
    'questions', v_s.questions,
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
        select g.id, g.user_id, g.body, g.created_at from public.duo_messages g
         where g.session_id = v_s.id order by g.id desc limit 60) x), '[]'::jsonb)
  );
end;
$$;

-- Valider sa réponse à une question (définitif : on ne peut pas la modifier ensuite).
create or replace function public.duo_answer(p_code text, p_idx integer, p_sel jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_s     public.duo_sessions;
  v_q     jsonb;
  v_pts   integer;
  v_total integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_s := (select s from public.duo_sessions s where s.code = upper(trim(p_code)));
  if v_s.id is null then raise exception 'duo_not_found'; end if;
  if not exists (select 1 from public.duo_members where session_id = v_s.id and user_id = v_uid) then
    raise exception 'duo_not_member';
  end if;
  if v_s.expires_at < now() then raise exception 'duo_expired'; end if;
  v_total := jsonb_array_length(v_s.questions);
  if p_idx < 0 or p_idx >= v_total then raise exception 'invalid_index'; end if;
  if p_sel is null or jsonb_typeof(p_sel) <> 'array' or jsonb_array_length(p_sel) > 5 then raise exception 'invalid_answer'; end if;

  v_q := v_s.questions -> p_idx;
  v_pts := public.duo_score(p_sel, v_q -> 'bonnesReponses');

  insert into public.duo_answers (session_id, user_id, idx, sel, points)
  values (v_s.id, v_uid, p_idx, p_sel, v_pts)
  on conflict (session_id, user_id, idx) do nothing;

  if (select count(*) from public.duo_answers where session_id = v_s.id and user_id = v_uid) >= v_total then
    update public.duo_members set finished = true where session_id = v_s.id and user_id = v_uid;
  end if;
  return v_pts;
end;
$$;

-- Petit message à l'autre personne.
create or replace function public.duo_send(p_code text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   public.duo_sessions;
  v_b   text := left(trim(coalesce(p_body, '')), 300);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_b = '' then return; end if;
  v_s := (select s from public.duo_sessions s where s.code = upper(trim(p_code)));
  if v_s.id is null then raise exception 'duo_not_found'; end if;
  if not exists (select 1 from public.duo_members where session_id = v_s.id and user_id = v_uid) then
    raise exception 'duo_not_member';
  end if;
  if v_s.expires_at < now() then raise exception 'duo_expired'; end if;
  if (select count(*) from public.duo_messages where session_id = v_s.id) >= 300 then raise exception 'duo_chat_full'; end if;
  insert into public.duo_messages (session_id, user_id, body) values (v_s.id, v_uid, v_b);
end;
$$;

-- Mes sessions récentes (pour les retrouver et les reprendre).
create or replace function public.duo_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
  from (
    select s.code, s.title, s.created_at, s.expires_at,
           jsonb_array_length(s.questions) as total,
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

revoke all on function public.duo_score(jsonb, jsonb)               from public;
revoke all on function public.duo_create(text, jsonb, text)         from public;
revoke all on function public.duo_join(text, text)                  from public;
revoke all on function public.duo_state(text)                       from public;
revoke all on function public.duo_answer(text, integer, jsonb)      from public;
revoke all on function public.duo_send(text, text)                  from public;
revoke all on function public.duo_list()                            from public;
grant execute on function public.duo_create(text, jsonb, text)      to authenticated;
grant execute on function public.duo_join(text, text)               to authenticated;
grant execute on function public.duo_state(text)                    to authenticated;
grant execute on function public.duo_answer(text, integer, jsonb)   to authenticated;
grant execute on function public.duo_send(text, text)               to authenticated;
grant execute on function public.duo_list()                         to authenticated;
