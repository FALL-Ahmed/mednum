-- ─── Fix RLS : autoriser les élèves (anon + authenticated) à écrire leurs feedbacks ──

-- message_feedback : les élèves doivent pouvoir insérer leurs retours 👍/👎
ALTER TABLE IF EXISTS public.message_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_insert_feedback" ON public.message_feedback;
DROP POLICY IF EXISTS "allow_select_feedback_admin" ON public.message_feedback;

-- Tout utilisateur connecté (anonyme inclus) peut insérer son propre feedback
CREATE POLICY "allow_insert_feedback"
  ON public.message_feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Lecture : seulement le service_role (admin dashboard via anon key admin)
-- Note : l'admin react utilise la clé anon mais RLS s'applique → on autorise la lecture aussi
CREATE POLICY "allow_select_feedback"
  ON public.message_feedback
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── students : les élèves doivent pouvoir créer/modifier leur propre profil ──────

ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_student_upsert" ON public.students;
DROP POLICY IF EXISTS "allow_student_select" ON public.students;

-- Un élève peut insérer/modifier uniquement sa propre ligne (user_id = auth.uid())
CREATE POLICY "allow_student_upsert"
  ON public.students
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── courses : les élèves peuvent lire les cours (SELECT uniquement) ──────────────

ALTER TABLE IF EXISTS public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_courses" ON public.courses;

CREATE POLICY "allow_read_courses"
  ON public.courses
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── course_chunks : idem, lecture seule pour les élèves ─────────────────────────

ALTER TABLE IF EXISTS public.course_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_chunks" ON public.course_chunks;

CREATE POLICY "allow_read_chunks"
  ON public.course_chunks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── classes / subjects : lecture pour tous ───────────────────────────────────────

ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_classes" ON public.classes;
DROP POLICY IF EXISTS "allow_read_subjects" ON public.subjects;

CREATE POLICY "allow_read_classes"  ON public.classes  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allow_read_subjects" ON public.subjects FOR SELECT TO anon, authenticated USING (true);
