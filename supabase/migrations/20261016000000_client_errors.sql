-- Suivi des erreurs : le site et l'application envoient ici les erreurs rencontrées par les étudiants
-- (visibles dans l'admin, page « Erreurs »). Aucun contenu de cours ni donnée personnelle : seulement le message,
-- la page, le type d'appareil et, si connecté, l'identifiant du compte.
create table if not exists public.client_errors (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid,
  kind       text        not null,
  message    text        not null check (char_length(message) between 1 and 500),
  stack      text        check (stack is null or char_length(stack) <= 2000),
  url        text        check (url is null or char_length(url) <= 200),
  user_agent text        check (user_agent is null or char_length(user_agent) <= 200),
  context    jsonb
);

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- N'importe quel visiteur peut signaler une erreur (jamais en lire).
drop policy if exists "client_errors_insert" on public.client_errors;
create policy "client_errors_insert" on public.client_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "client_errors_admin_read" on public.client_errors;
create policy "client_errors_admin_read" on public.client_errors
  for select using (public.is_admin());

drop policy if exists "client_errors_admin_delete" on public.client_errors;
create policy "client_errors_admin_delete" on public.client_errors
  for delete using (public.is_admin());
