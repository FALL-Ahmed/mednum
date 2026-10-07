-- Banque de cours : chaque cours déposé par un étudiant est conservé (fichier d'origine) dans un espace PRIVÉ,
-- jamais visible par les autres étudiants, pour améliorer le service. L'équipe y accède depuis l'admin
-- (page « Cours des élèves »), classé par année d'étude, module et date.
-- Le fichier est supprimé quand l'étudiant supprime le cours ou son compte.

alter table public.documents
  add column if not exists file_path  text,      -- fichier (PDF, texte) ou dossier (plusieurs photos) dans le stockage
  add column if not exists file_count integer,   -- nombre de fichiers conservés pour ce cours
  add column if not exists file_size  bigint,    -- poids total conservé (octets)
  add column if not exists file_mime  text;

-- Espace privé : un dossier par étudiant (identifiant du compte), 40 Mo par fichier
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-files', 'course-files', false, 41943040,
        array['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

drop policy if exists "course_files_insert" on storage.objects;
create policy "course_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- L'étudiant relit et supprime ses propres fichiers ; l'administrateur lit tout (pour la banque de cours).
drop policy if exists "course_files_select" on storage.objects;
create policy "course_files_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'course-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "course_files_delete" on storage.objects;
create policy "course_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Liste de la banque pour l'admin : le cours, son module, l'année d'étude de l'étudiant, sa date, son fichier.
drop function if exists public.admin_course_bank(integer);
create function public.admin_course_bank(p_limit integer default 1000)
returns table (
  id text, name text, subject_name text, pages integer, chars integer,
  owner_name text, owner_promotion text, owner_school text, owner_country text,
  created_at timestamptz, has_fiche boolean, has_flashcards boolean, has_cases boolean,
  file_path text, file_count integer, file_size bigint, file_mime text, file_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select d.id, d.name, nullif(trim(d.subject_name), ''), d.pages, length(d.content),
         s.name, s.promotion_name, s.school_name, s.country,
         d.created_at,
         (d.fiche is not null and d.fiche <> ''),
         (d.flashcards is not null and d.flashcards <> ''),
         (d.clinical_case is not null and d.clinical_case <> ''),
         d.file_path, d.file_count, d.file_size, d.file_mime, d.file_name
    from public.documents d
    left join public.students s on s.user_id = d.user_id::text
   order by d.created_at desc
   limit greatest(1, least(coalesce(p_limit, 1000), 5000));
end;
$$;

revoke all on function public.admin_course_bank(integer) from public, anon;
grant execute on function public.admin_course_bank(integer) to authenticated;
