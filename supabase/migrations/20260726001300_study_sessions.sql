-- Sessions d'étude (Pomodoro) — alimente le futur calendrier de planification

CREATE TABLE IF NOT EXISTS study_sessions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      TEXT        NOT NULL,
  matiere      TEXT,
  sous_matiere TEXT,
  minutes      INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS study_sessions_user_id_idx ON study_sessions(user_id);

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

-- Chaque étudiant voit/insère uniquement ses propres sessions
CREATE POLICY "study_sessions_self" ON study_sessions
  USING (user_id = auth.uid()::TEXT)
  WITH CHECK (user_id = auth.uid()::TEXT);
