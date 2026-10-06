-- Axone — migration initiale
-- Appliquée via : npx prisma migrate deploy

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Promotions médicales ─────────────────────────────────────────────────────
CREATE TABLE promotions (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT        NOT NULL,
  year       INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Données initiales
INSERT INTO promotions (name, year) VALUES
  ('P1', 2025),
  ('P2', 2025),
  ('P3', 2025),
  ('P4', 2025),
  ('P5', 2025),
  ('Résidanat', 2025);

-- ─── Étudiants ───────────────────────────────────────────────────────────────
CREATE TABLE students (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        TEXT        NOT NULL UNIQUE,
  name           TEXT        NOT NULL,
  promotion_id   UUID        REFERENCES promotions(id) ON DELETE SET NULL,
  promotion_name TEXT,
  school_name    TEXT,
  parent_phone   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Cours PDF ────────────────────────────────────────────────────────────────
CREATE TABLE courses (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT        NOT NULL,
  subject_name TEXT        NOT NULL,
  file_name    TEXT        NOT NULL,
  file_url     TEXT,
  pages        INTEGER     NOT NULL DEFAULT 0,
  content      TEXT,
  language     TEXT        DEFAULT 'fr',
  promotion_id UUID        REFERENCES promotions(id) ON DELETE SET NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE course_chunks (
  id        UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title     TEXT    NOT NULL,
  content   TEXT    NOT NULL,
  index     INTEGER NOT NULL
);

-- ─── Quota journalier ─────────────────────────────────────────────────────────
CREATE TABLE quota_usage (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      TEXT        NOT NULL UNIQUE,
  daily_used   INTEGER     NOT NULL DEFAULT 0,
  daily_limit  INTEGER     NOT NULL DEFAULT 20,
  plan         TEXT        NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Plans d'abonnement ───────────────────────────────────────────────────────
CREATE TABLE plans (
  id             UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan           TEXT    NOT NULL UNIQUE,
  label          TEXT    NOT NULL,
  price_monthly  NUMERIC NOT NULL,
  price_yearly   NUMERIC,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

INSERT INTO plans (plan, label, price_monthly, price_yearly, sort_order) VALUES
  ('trial',          'Essai gratuit',     0,    null, 0),
  ('freemium',       'Freemium',          0,    null, 1),
  ('one_subject',    '1 matière',      1000,    null, 2),
  ('three_subjects', '3 matières',     2500,    null, 3),
  ('full',           'Accès complet',  4000,   40000, 4);

-- ─── Demandes d'abonnement ────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      TEXT        NOT NULL,
  plan         TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending',
  receipt_url  TEXT,
  method       TEXT,
  duration     TEXT,
  activated_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Fonctions RPC (appelées par l'app mobile) ───────────────────────────────

-- Vérifie et incrémente le quota (appelé par la Edge Function ask)
CREATE OR REPLACE FUNCTION check_and_increment_quota(p_user_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row  quota_usage%ROWTYPE;
  v_today DATE := CURRENT_DATE;
BEGIN
  INSERT INTO quota_usage (user_id, daily_used, daily_limit, plan, updated_at)
  VALUES (p_user_id, 0, 20, 'trial', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM quota_usage WHERE user_id = p_user_id FOR UPDATE;

  -- Reset si updated_at date d'un autre jour
  IF v_row.updated_at::DATE < v_today THEN
    UPDATE quota_usage SET daily_used = 0, updated_at = NOW() WHERE user_id = p_user_id;
    v_row.daily_used := 0;
  END IF;

  IF v_row.daily_used >= v_row.daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_row.daily_used, 'limit', v_row.daily_limit, 'plan', v_row.plan);
  END IF;

  UPDATE quota_usage SET daily_used = daily_used + 1, updated_at = NOW() WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'used', v_row.daily_used + 1, 'limit', v_row.daily_limit, 'plan', v_row.plan);
END;
$$;

-- Retourne le statut quota (appelé par syncQuota dans l'app)
CREATE OR REPLACE FUNCTION get_quota_status(p_user_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row quota_usage%ROWTYPE;
  v_today DATE := CURRENT_DATE;
BEGIN
  INSERT INTO quota_usage (user_id, daily_used, daily_limit, plan, updated_at)
  VALUES (p_user_id, 0, 20, 'trial', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM quota_usage WHERE user_id = p_user_id;

  IF v_row.updated_at::DATE < v_today THEN
    UPDATE quota_usage SET daily_used = 0, updated_at = NOW() WHERE user_id = p_user_id;
    v_row.daily_used := 0;
  END IF;

  RETURN jsonb_build_object(
    'daily_used',    v_row.daily_used,
    'daily_limit',   v_row.daily_limit,
    'plan',          v_row.plan,
    'trial_ends_at', v_row.trial_ends_at
  );
END;
$$;

-- Numéro WhatsApp du parent
CREATE OR REPLACE FUNCTION get_parent_phone(p_student_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT parent_phone FROM students WHERE user_id = p_student_id);
END;
$$;

CREATE OR REPLACE FUNCTION save_parent_phone(p_student_id TEXT, p_phone TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE students SET parent_phone = p_phone WHERE user_id = p_student_id;
END;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE students       ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_chunks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_usage    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans          ENABLE ROW LEVEL SECURITY;

-- Les étudiants voient/modifient uniquement leur propre ligne
CREATE POLICY "students_self" ON students
  USING (user_id = auth.uid()::TEXT)
  WITH CHECK (user_id = auth.uid()::TEXT);

-- Lecture des promotions pour tous les utilisateurs authentifiés
CREATE POLICY "promotions_read" ON promotions
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Les cours sont lisibles par tous (l'admin les uploade via service_role)
CREATE POLICY "courses_read" ON courses
  FOR SELECT USING (true);

CREATE POLICY "course_chunks_read" ON course_chunks
  FOR SELECT USING (true);

-- Plans visibles par tous
CREATE POLICY "plans_read" ON plans
  FOR SELECT USING (true);

-- Quota : chaque utilisateur voit son quota
CREATE POLICY "quota_self" ON quota_usage
  USING (user_id = auth.uid()::TEXT);

-- Abonnements : chaque utilisateur voit le sien
CREATE POLICY "subscriptions_self" ON subscriptions
  USING (user_id = auth.uid()::TEXT)
  WITH CHECK (user_id = auth.uid()::TEXT);
