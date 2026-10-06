-- Ajout du pays de l'étudiant (Mauritanie, Sénégal, Côte d'Ivoire, Maroc...)

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'Mauritanie';
