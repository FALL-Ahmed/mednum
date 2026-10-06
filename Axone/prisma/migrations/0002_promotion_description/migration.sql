-- Ajout d'une description lisible et d'un ordre d'affichage aux promotions
-- Appliquée via : npx prisma migrate deploy

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

-- Mise à jour des données existantes
UPDATE promotions SET description = '1ère année de médecine', sort_order = 1 WHERE name = 'P1';
UPDATE promotions SET description = '2ème année de médecine', sort_order = 2 WHERE name = 'P2';
UPDATE promotions SET description = '3ème année de médecine', sort_order = 3 WHERE name = 'P3';
UPDATE promotions SET description = '4ème année de médecine', sort_order = 4 WHERE name = 'P4';
UPDATE promotions SET description = '5ème année de médecine', sort_order = 5 WHERE name = 'P5';
UPDATE promotions SET description = 'Post-graduée — Spécialisation', sort_order = 6 WHERE name = 'Résidanat';
