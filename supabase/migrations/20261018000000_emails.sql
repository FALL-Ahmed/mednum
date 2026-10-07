-- E-mails automatiques (via Resend) : bienvenue, relance du premier cours, fin d'abonnement proche.
-- email_log garde ce qui a déjà été envoyé : un même e-mail ne part jamais deux fois à la même personne.
create table if not exists public.email_log (
  user_id uuid        not null references auth.users(id) on delete cascade,
  kind    text        not null,
  ref     text        not null default '',
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

-- Aucune politique : seule l'Edge Function (clé de service) lit et écrit ce journal.
alter table public.email_log enable row level security;

-- Les e-mails à envoyer maintenant (appelée chaque jour par l'Edge Function send-email).
create or replace function public.emails_due()
returns table (user_id uuid, email text, name text, kind text, ref text, plan text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  -- Relance : inscrit depuis 2 à 14 jours et n'a encore déposé aucun cours
  select u.id, u.email::text, s.name, 'nudge_no_course'::text, ''::text, null::text, null::timestamptz
    from public.students s
    join auth.users u on u.id::text = s.user_id
   where u.email is not null
     and s.created_at < now() - interval '2 days'
     and s.created_at > now() - interval '14 days'
     and not exists (select 1 from public.documents d where d.user_id::text = s.user_id)
     and not exists (select 1 from public.email_log l where l.user_id = u.id and l.kind = 'nudge_no_course')

  union all

  -- Fin d'abonnement dans les 3 jours, sans renouvellement déjà en place
  select u.id, u.email::text, st.name, 'expiry_soon'::text, to_char(sub.expires_at, 'YYYY-MM-DD'), sub.plan, sub.expires_at
    from public.subscriptions sub
    left join public.device_links dl on dl.device_id = sub.user_id
    join auth.users u on u.id::text = coalesce(dl.user_id::text, sub.user_id)
    left join public.students st on st.user_id = u.id::text
   where u.email is not null
     and sub.status = 'active'
     and sub.expires_at > now() and sub.expires_at <= now() + interval '3 days'
     and not exists (
       select 1 from public.subscriptions n
        where n.user_id = sub.user_id and n.status = 'active' and n.expires_at > sub.expires_at)
     and not exists (
       select 1 from public.email_log l
        where l.user_id = u.id and l.kind = 'expiry_soon' and l.ref = to_char(sub.expires_at, 'YYYY-MM-DD'));
$$;

revoke all on function public.emails_due() from public, anon, authenticated;
grant execute on function public.emails_due() to service_role;
