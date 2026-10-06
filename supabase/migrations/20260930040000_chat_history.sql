-- Historique des discussions du site (comme ChatGPT) : conversations + messages, propres à chaque étudiant.
--
-- Les pièces jointes (images) vont dans un espace de stockage privé « chat-attachments », rangées dans un
-- dossier portant l'identifiant de l'étudiant (voir le bloc STOCKAGE, à exécuter séparément).
--
-- Le fichier est découpé en 2 blocs à exécuter un par un dans l'éditeur SQL du tableau de bord.

-- ═══ BLOC 1 : tables et sécurité ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.chat_conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title      text        not null default 'Nouvelle discussion',
  course_id  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_idx
  on public.chat_conversations (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.chat_conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null,
  attachments     jsonb       not null default '[]'::jsonb,   -- [{ "path": "...", "name": "...", "type": "image/jpeg" }]
  source          text,
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_conv_idx
  on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;

drop policy if exists "chat_conversations_own" on public.chat_conversations;
create policy "chat_conversations_own" on public.chat_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "chat_messages_own" on public.chat_messages;
create policy "chat_messages_own" on public.chat_messages
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- ═══ BLOC 2 : STOCKAGE des images jointes (privé, un dossier par étudiant) ═════════════════════════════════

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

drop policy if exists "chat_attachments_insert" on storage.objects;
create policy "chat_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat_attachments_select" on storage.objects;
create policy "chat_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat_attachments_delete" on storage.objects;
create policy "chat_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
