-- Migration : persistance serveur des documents/cours (texte extrait uniquement)
-- Objectif : survivre à une désinstallation / changement d'appareil, sans stocker
-- les PDF eux-mêmes (déjà supprimés après extraction — voir extract-pdf).
-- On ne garde que le texte extrait + les chunks, ce qui reste très léger
-- (quelques centaines de Ko par document, même pour un cours de 200 pages).

create table if not exists public.documents (
  id            text        primary key,           -- même id que côté client (Course.id)
  user_id       uuid        not null references auth.users(id) on delete cascade,
  name          text        not null,
  subject_name  text        default '',
  file_name     text,
  pages         integer     not null default 1,
  content       text        not null,
  chunks        jsonb       not null default '[]'::jsonb,
  language      text,
  -- Fiche de révision déjà générée pour ce document (un seul niveau : le document entier).
  -- Évite de regénérer (coût + temps) si l'étudiant revient dessus plus tard.
  fiche         text,
  fiche_hash    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.documents is 'Cours uploadés par les étudiants — texte extrait + chunks, pas de PDF binaire.';

create index if not exists documents_user_id_idx on public.documents (user_id);

-- ─── RLS : chaque utilisateur ne voit/modifie que ses propres documents ───────

alter table public.documents enable row level security;

drop policy if exists "Users can read their own documents" on public.documents;
create policy "Users can read their own documents"
  on public.documents for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own documents" on public.documents;
create policy "Users can insert their own documents"
  on public.documents for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own documents" on public.documents;
create policy "Users can update their own documents"
  on public.documents for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own documents" on public.documents;
create policy "Users can delete their own documents"
  on public.documents for delete
  to authenticated
  using (auth.uid() = user_id);
