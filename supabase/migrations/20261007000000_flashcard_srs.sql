-- Progression des flashcards sur le site (répétition espacée) : une ligne par carte révisée.
-- Même algorithme que l'application mobile (FSRS). Chaque étudiant ne voit que ses propres lignes.
--
-- À APPLIQUER MANUELLEMENT, un seul bloc, dans l'éditeur SQL du tableau de bord.

create table if not exists public.flashcard_srs (
  user_id      uuid             not null references auth.users(id) on delete cascade,
  document_id  text             not null,
  card_index   integer          not null,
  stability    double precision not null,
  difficulty   double precision not null,
  due          date             not null,
  last_review  date             not null,
  primary key (user_id, document_id, card_index)
);

alter table public.flashcard_srs enable row level security;

drop policy if exists "flashcard_srs_select_own" on public.flashcard_srs;
create policy "flashcard_srs_select_own" on public.flashcard_srs for select using (auth.uid() = user_id);

drop policy if exists "flashcard_srs_insert_own" on public.flashcard_srs;
create policy "flashcard_srs_insert_own" on public.flashcard_srs for insert with check (auth.uid() = user_id);

drop policy if exists "flashcard_srs_update_own" on public.flashcard_srs;
create policy "flashcard_srs_update_own" on public.flashcard_srs for update using (auth.uid() = user_id);

drop policy if exists "flashcard_srs_delete_own" on public.flashcard_srs;
create policy "flashcard_srs_delete_own" on public.flashcard_srs for delete using (auth.uid() = user_id);
