-- Ajout de la filière (Médecine / Pharmacie) aux promotions

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS filiere TEXT NOT NULL DEFAULT 'medecine';

UPDATE promotions SET filiere = 'medecine' WHERE filiere IS NULL OR filiere = '';

-- Promotions Pharmacie (mêmes années P1-P5, pas de Résidanat)
INSERT INTO promotions (name, description, sort_order, filiere)
SELECT * FROM (VALUES
  ('P1', '1ère année de pharmacie', 11, 'pharmacie'),
  ('P2', '2ème année de pharmacie', 12, 'pharmacie'),
  ('P3', '3ème année de pharmacie', 13, 'pharmacie'),
  ('P4', '4ème année de pharmacie', 14, 'pharmacie'),
  ('P5', '5ème année de pharmacie', 15, 'pharmacie')
) AS v(name, description, sort_order, filiere)
WHERE NOT EXISTS (
  SELECT 1 FROM promotions p WHERE p.name = v.name AND p.filiere = v.filiere
);
