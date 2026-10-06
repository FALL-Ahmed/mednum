-- Signalements d'erreurs par les étudiants sur le contenu généré (fiche, QCM, flashcards, cas cliniques).
-- Chaque signalement garde une copie du contenu signalé, pour pouvoir le relire et corriger les consignes.
--
-- À APPLIQUER MANUELLEMENT, un seul bloc, dans l'éditeur SQL du tableau de bord.

create table if not exists public.content_reports (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  document_id text        not null default '',
  kind        text        not null check (kind in ('case', 'fiche', 'flashcard', 'qcm')),
  item_ref    text        not null default '',          -- numéro de la carte, de la question, du cas…
  snapshot    jsonb       not null default '{}'::jsonb,  -- copie du contenu signalé
  message     text        not null default '',
  status      text        not null default 'new' check (status in ('new', 'reviewed', 'fixed', 'dismissed')),
  created_at  timestamptz not null default now()
);

create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

drop policy if exists "content_reports_insert_own" on public.content_reports;
create policy "content_reports_insert_own" on public.content_reports for insert with check (auth.uid() = user_id);

drop policy if exists "content_reports_select_own" on public.content_reports;
create policy "content_reports_select_own" on public.content_reports for select using (auth.uid() = user_id);

-- Les administrateurs (table admin_users) lisent tous les signalements et changent leur statut.
drop policy if exists "content_reports_admin_read" on public.content_reports;
create policy "content_reports_admin_read" on public.content_reports for select using (public.is_admin());

drop policy if exists "content_reports_admin_update" on public.content_reports;
create policy "content_reports_admin_update" on public.content_reports for update using (public.is_admin());
