-- « Mes cartes » : flashcards créées par l'étudiant lui-même (à la main, depuis une fiche, une discussion ou un QCM raté).
-- Les cartes générées par l'IA ne changent pas (elles restent dans chaque cours, avec flashcard_srs).
-- Chaque étudiant ne voit que ses propres cartes. Gratuit : 5 cartes ; Standard : 50 par mois ; Premium : illimité.

create table if not exists public.user_cards (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  document_id text,                                                    -- cours d'origine (facultatif)
  chapter     text        check (chapter is null or char_length(chapter) <= 120),
  front       text        not null check (char_length(front) between 1 and 600),
  back        text        not null check (char_length(back) between 1 and 1500),
  source      text        not null default 'manual' check (source in ('manual', 'selection', 'chat', 'qcm')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_cards_user_idx on public.user_cards (user_id, created_at desc);

alter table public.user_cards enable row level security;

drop policy if exists "user_cards_select_own" on public.user_cards;
create policy "user_cards_select_own" on public.user_cards for select using (auth.uid() = user_id);
drop policy if exists "user_cards_insert_own" on public.user_cards;
create policy "user_cards_insert_own" on public.user_cards for insert with check (auth.uid() = user_id);
drop policy if exists "user_cards_update_own" on public.user_cards;
create policy "user_cards_update_own" on public.user_cards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_cards_delete_own" on public.user_cards;
create policy "user_cards_delete_own" on public.user_cards for delete using (auth.uid() = user_id);

-- Limites : offre Gratuit = 5 cartes au total ; Standard = 50 nouvelles cartes par mois ; Premium = illimité.
create or replace function public.enforce_user_card_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key   text;
  v_plan  text;
  v_count integer;
begin
  v_key  := coalesce((select dl.device_id from public.device_links dl where dl.user_id = new.user_id), new.user_id::text);
  v_plan := public.effective_plan(v_key);
  if v_plan in ('freemium', 'trial') then
    select count(*) into v_count from public.user_cards where user_id = new.user_id;
    if v_count >= 5 then
      raise exception 'card_limit_reached' using errcode = 'P0001';
    end if;
  elsif v_plan in ('standard', 'one_subject', 'three_subjects') then
    select count(*) into v_count from public.user_cards
     where user_id = new.user_id and created_at >= date_trunc('month', now());
    if v_count >= 50 then
      raise exception 'card_limit_reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_card_limit on public.user_cards;
create trigger trg_user_card_limit
  before insert on public.user_cards
  for each row execute function public.enforce_user_card_limit();

-- Progression de révision (répétition espacée, même algorithme que les cartes de l'IA), une ligne par carte révisée.
create table if not exists public.user_card_srs (
  user_id     uuid             not null references auth.users(id) on delete cascade,
  card_id     uuid             not null references public.user_cards(id) on delete cascade,
  stability   double precision not null,
  difficulty  double precision not null,
  due         date             not null,
  last_review date             not null,
  primary key (user_id, card_id)
);

alter table public.user_card_srs enable row level security;

drop policy if exists "user_card_srs_select_own" on public.user_card_srs;
create policy "user_card_srs_select_own" on public.user_card_srs for select using (auth.uid() = user_id);
drop policy if exists "user_card_srs_insert_own" on public.user_card_srs;
create policy "user_card_srs_insert_own" on public.user_card_srs for insert with check (auth.uid() = user_id);
drop policy if exists "user_card_srs_update_own" on public.user_card_srs;
create policy "user_card_srs_update_own" on public.user_card_srs for update using (auth.uid() = user_id);
drop policy if exists "user_card_srs_delete_own" on public.user_card_srs;
create policy "user_card_srs_delete_own" on public.user_card_srs for delete using (auth.uid() = user_id);
