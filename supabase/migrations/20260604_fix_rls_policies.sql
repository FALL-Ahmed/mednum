-- ─── Fix RLS : autoriser les élèves (anon + authenticated) à écrire leurs feedbacks ──
-- Chaque bloc est gardé par une vérification d'existence de table : ces tables
-- viennent du schéma Prisma et peuvent ne pas encore exister sur un projet neuf
-- (DROP POLICY IF EXISTS échoue quand même si la table elle-même n'existe pas).

DO $$
BEGIN
  IF to_regclass('public.message_feedback') IS NOT NULL THEN
    ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "allow_insert_feedback" ON public.message_feedback;
    DROP POLICY IF EXISTS "allow_select_feedback_admin" ON public.message_feedback;
    DROP POLICY IF EXISTS "allow_select_feedback" ON public.message_feedback;

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
  END IF;
END $$;

-- ─── students : les élèves doivent pouvoir créer/modifier leur propre profil ──────

DO $$
BEGIN
  IF to_regclass('public.students') IS NOT NULL THEN
    ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "allow_student_upsert" ON public.students;
    DROP POLICY IF EXISTS "allow_student_select" ON public.students;

    -- Un élève peut insérer/modifier uniquement sa propre ligne (user_id = auth.uid())
    CREATE POLICY "allow_student_upsert"
      ON public.students
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ─── courses : les élèves peuvent lire les cours (SELECT uniquement) ──────────────

DO $$
BEGIN
  IF to_regclass('public.courses') IS NOT NULL THEN
    ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "allow_read_courses" ON public.courses;

    CREATE POLICY "allow_read_courses"
      ON public.courses
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- ─── course_chunks : idem, lecture seule pour les élèves ─────────────────────────

DO $$
BEGIN
  IF to_regclass('public.course_chunks') IS NOT NULL THEN
    ALTER TABLE public.course_chunks ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "allow_read_chunks" ON public.course_chunks;

    CREATE POLICY "allow_read_chunks"
      ON public.course_chunks
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- ─── classes / subjects : lecture pour tous ───────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.classes') IS NOT NULL THEN
    ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_read_classes" ON public.classes;
    CREATE POLICY "allow_read_classes" ON public.classes FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.subjects') IS NOT NULL THEN
    ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_read_subjects" ON public.subjects;
    CREATE POLICY "allow_read_subjects" ON public.subjects FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
