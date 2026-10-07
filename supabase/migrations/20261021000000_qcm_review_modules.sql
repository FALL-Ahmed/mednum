-- 1) « Mes erreurs » : les questions de QCM ratées par l'étudiant, qui reviennent au bon moment (J+1, J+3, J+9),
--    puis sortent de la liste après 3 réussites de suite. Aucune IA, aucun coût : tout est déjà dans qcm_sets.
-- 2) Tableau par module pour l'admin (cours, pages, élèves par année et par module).

create table if not exists public.qcm_review (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  qkey          text        not null,                 -- empreinte de l'énoncé : la même question n'est comptée qu'une fois
  document_id   text,
  doc_name      text        not null default '',
  chapter_title text        not null default '',
  question      jsonb       not null,                 -- énoncé, propositions, corrections : la révision n'a pas besoin du cours
  wrong_count   integer     not null default 1,
  streak        integer     not null default 0,       -- réussites de suite pendant la révision
  mastered      boolean     not null default false,
  due_at        timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, qkey)
);

create index if not exists qcm_review_due_idx on public.qcm_review (user_id, mastered, due_at);

alter table public.qcm_review enable row level security;

drop policy if exists "qcm_review_own" on public.qcm_review;
create policy "qcm_review_own" on public.qcm_review
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Enregistre une réponse. Faux ou partiel : la question entre dans les erreurs (ou y revient) et reviendra demain.
-- Juste pendant une révision : prochaine échéance à +2, +6 jours, puis la question est maîtrisée (3 réussites).
create or replace function public.qcm_review_record(
  p_doc text, p_doc_name text, p_chapter text, p_question jsonb, p_correct boolean, p_review boolean default false
) returns void
language plpgsql
set search_path = public
as $$
declare
  k  text := encode(sha256(convert_to(btrim(coalesce(p_question->>'question', '')), 'UTF8')), 'hex');
  r  public.qcm_review;
  ns integer;
begin
  if auth.uid() is null or coalesce(p_question->>'question', '') = '' then
    return;
  end if;

  if not p_correct then
    insert into public.qcm_review (user_id, qkey, document_id, doc_name, chapter_title, question, due_at)
    values (auth.uid(), k, p_doc, coalesce(p_doc_name, ''), coalesce(p_chapter, ''), p_question, now() + interval '1 day')
    on conflict (user_id, qkey) do update
      set wrong_count = public.qcm_review.wrong_count + 1,
          streak      = 0,
          mastered    = false,
          due_at      = now() + interval '1 day',
          question    = excluded.question,
          updated_at  = now();
  elsif p_review then
    select * into r from public.qcm_review where user_id = auth.uid() and qkey = k;
    if not found then
      return;
    end if;
    ns := r.streak + 1;
    update public.qcm_review
       set streak     = ns,
           mastered   = ns >= 3,
           due_at     = case ns when 1 then now() + interval '2 days' when 2 then now() + interval '6 days' else null end,
           updated_at = now()
     where id = r.id;
  end if;
end;
$$;

grant execute on function public.qcm_review_record(text, text, text, jsonb, boolean, boolean) to authenticated;

-- Reprise de l'historique : les erreurs déjà faites dans les anciennes séries comptent dès le premier jour.
insert into public.qcm_review (user_id, qkey, document_id, doc_name, chapter_title, question, wrong_count, due_at, created_at)
select distinct on (x.user_id, x.qkey)
       x.user_id, x.qkey, x.document_id, x.doc_name, x.chapter_title, x.q, 1, now(), x.created_at
  from (
    select s.user_id,
           encode(sha256(convert_to(btrim(q.value->>'question'), 'UTF8')), 'hex') as qkey,
           s.document_id,
           coalesce(d.name, '') as doc_name,
           s.chapter_title,
           q.value as q,
           s.created_at,
           coalesce((s.answers -> (q.n::int - 1)) -> 'sel', '[]'::jsonb) as sel,
           coalesce(q.value -> 'bonnesReponses', '[]'::jsonb) as good
      from public.qcm_sets s
     cross join lateral jsonb_array_elements(s.questions) with ordinality as q(value, n)
      left join public.documents d on d.id = s.document_id and d.user_id::text = s.user_id::text
     where coalesce(((s.answers -> (q.n::int - 1)) ->> 'done')::boolean, false)
       and coalesce(q.value ->> 'question', '') <> ''
  ) x
 where not (jsonb_array_length(x.sel) > 0 and x.sel @> x.good and x.good @> x.sel)
 order by x.user_id, x.qkey, x.created_at desc
on conflict (user_id, qkey) do nothing;

-- Tableau par module pour l'admin : un module écrit « Immuno » ou « immuno » compte pour un seul.
drop function if exists public.admin_module_stats(timestamptz);
create function public.admin_module_stats(p_since timestamptz default null)
returns table (promotion text, module text, courses bigint, pages bigint, students bigint, with_file bigint, last_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select coalesce(nullif(btrim(s.promotion_name), ''), '—'),
         mode() within group (order by coalesce(nullif(btrim(d.subject_name), ''), 'Sans module')),
         count(*),
         coalesce(sum(d.pages), 0)::bigint,
         count(distinct d.user_id),
         count(*) filter (where d.file_path is not null),
         max(d.created_at)
    from public.documents d
    left join public.students s on s.user_id = d.user_id::text
   where p_since is null or d.created_at >= p_since
   group by coalesce(nullif(btrim(s.promotion_name), ''), '—'), lower(coalesce(btrim(d.subject_name), ''))
   order by count(*) desc;
end;
$$;

revoke all on function public.admin_module_stats(timestamptz) from public, anon;
grant execute on function public.admin_module_stats(timestamptz) to authenticated;
