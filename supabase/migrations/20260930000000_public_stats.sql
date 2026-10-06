-- Chiffres publics pour le site vitrine (aucune donnée personnelle, uniquement des totaux).
-- Le site appelle cette fonction avec la clé anon ; les tables restent protégées par RLS.

create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'students',       (select count(*) from public.students),
    'questions_week', (select count(*) from public.api_usage where created_at > now() - interval '7 days')
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
