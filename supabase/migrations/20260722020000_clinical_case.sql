-- Cas clinique interactif généré par document (mise en cache serveur, comme la fiche)

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS clinical_case TEXT,
  ADD COLUMN IF NOT EXISTS clinical_case_hash TEXT;
