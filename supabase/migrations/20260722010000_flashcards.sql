-- Flashcards générées par document (mise en cache serveur, comme la fiche)

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS flashcards TEXT,
  ADD COLUMN IF NOT EXISTS flashcards_hash TEXT;
