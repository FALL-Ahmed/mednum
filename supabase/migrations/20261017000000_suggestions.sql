-- Messages à l'équipe : une lettre privée que l'étudiant écrit depuis l'application (idée, problème, demande).
-- L'équipe la lit dans l'admin (page « Messages ») avec le nom et l'e-mail de l'auteur, et répond par e-mail.
create table if not exists public.suggestions (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  email       text,
  kind        text        not null check (kind in ('idea', 'bug', 'exam', 'other')),
  message     text        not null check (char_length(message) between 5 and 2000),
  file_path   text,
  file_name   text,
  status      text        not null default 'new' check (status in ('new', 'planned', 'done', 'dismissed')),
  admin_note  text        check (admin_note is null or char_length(admin_note) <= 500)
);

-- Si la table existait déjà sans l'e-mail
alter table public.suggestions add column if not exists email text;

create index if not exists suggestions_created_idx on public.suggestions (created_at desc);

alter table public.suggestions enable row level security;

-- Un étudiant envoie en son nom, au plus 10 messages par jour (anti-abus).
drop policy if exists "suggestions_insert_own" on public.suggestions;
create policy "suggestions_insert_own" on public.suggestions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'new'
    and (select count(*) from public.suggestions s where s.user_id = auth.uid() and s.created_at > now() - interval '1 day') < 10
  );

-- Il relit ses envois (et la réponse de l'équipe) ; l'administrateur lit tout.
drop policy if exists "suggestions_select" on public.suggestions;
create policy "suggestions_select" on public.suggestions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "suggestions_admin_update" on public.suggestions;
create policy "suggestions_admin_update" on public.suggestions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "suggestions_admin_delete" on public.suggestions;
create policy "suggestions_admin_delete" on public.suggestions
  for delete to authenticated
  using (public.is_admin());

-- Fichiers joints (photos, PDF) : espace privé, un dossier par étudiant, 10 Mo maximum.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suggestion-files', 'suggestion-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "suggestion_files_insert" on storage.objects;
create policy "suggestion_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'suggestion-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "suggestion_files_select" on storage.objects;
create policy "suggestion_files_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'suggestion-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
