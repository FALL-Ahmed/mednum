-- Historique des QCM d'un cours : chaque série générée est enregistrée avec les réponses et le score,
-- pour pouvoir la reprendre ou la revoir plus tard (site web).
--
-- À APPLIQUER MANUELLEMENT, un seul bloc, dans l'éditeur SQL du tableau de bord.

create table if not exists public.qcm_sets (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  document_id   text        not null,
  chapter_title text        not null default '',
  questions     jsonb       not null,
  answers       jsonb       not null default '[]'::jsonb,
  points        integer     not null default 0,
  total         integer     not null default 0,
  finished      boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists qcm_sets_user_doc_idx on public.qcm_sets (user_id, document_id, created_at desc);

alter table public.qcm_sets enable row level security;

drop policy if exists "qcm_sets_select_own" on public.qcm_sets;
create policy "qcm_sets_select_own" on public.qcm_sets for select using (auth.uid() = user_id);

drop policy if exists "qcm_sets_insert_own" on public.qcm_sets;
create policy "qcm_sets_insert_own" on public.qcm_sets for insert with check (auth.uid() = user_id);

drop policy if exists "qcm_sets_update_own" on public.qcm_sets;
create policy "qcm_sets_update_own" on public.qcm_sets for update using (auth.uid() = user_id);

drop policy if exists "qcm_sets_delete_own" on public.qcm_sets;
create policy "qcm_sets_delete_own" on public.qcm_sets for delete using (auth.uid() = user_id);
