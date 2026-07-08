-- Migration : bucket Storage pour l'extraction PDF par lots (Edge Function extract-pdf)
-- À appliquer via : supabase db push
-- Ou manuellement dans Supabase Dashboard → SQL Editor

-- ─── Bucket privé ───────────────────────────────────────────────────────────
-- Les PDF y transitent le temps de l'extraction côté serveur (Edge Function les
-- télécharge, découpe par lots de pages, puis les supprime après traitement).

insert into storage.buckets (id, name, public)
values ('course-pdfs', 'course-pdfs', false)
on conflict (id) do nothing;

-- ─── RLS : chaque utilisateur (authentifié, y compris anonyme) ne peut
-- lire/écrire/supprimer que dans son propre dossier, préfixé par son auth.uid() ─
-- Convention de chemin côté client : `${auth.uid()}/${timestamp}_${fileName}`

create policy "Users can upload their own course PDFs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'course-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read their own course PDFs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'course-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own course PDFs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'course-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Note : le service_role utilisé par l'Edge Function bypass RLS par défaut,
-- donc pas besoin de policy dédiée pour le téléchargement/suppression côté serveur.
