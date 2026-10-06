-- Relire les erreurs signalées par les étudiants (à coller dans l'éditeur SQL du tableau de bord).

-- Les signalements à traiter, les plus récents d'abord, avec le message de l'étudiant et le contenu signalé
select created_at, kind, item_ref, message, snapshot, id
from public.content_reports
where status = 'new'
order by created_at desc;

-- Marquer un signalement comme traité (remplace l'identifiant)
-- update public.content_reports set status = 'fixed' where id = '00000000-0000-0000-0000-000000000000';
-- statuts possibles : new, reviewed, fixed, dismissed

-- Nombre de signalements par type de contenu
select kind, count(*) from public.content_reports group by kind order by count(*) desc;
