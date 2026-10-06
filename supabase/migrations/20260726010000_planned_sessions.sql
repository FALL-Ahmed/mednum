-- Sessions planifiées à l'avance (calendrier de planification)

CREATE TABLE IF NOT EXISTS planned_sessions (
  id           TEXT        PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  date         DATE        NOT NULL,
  time         TEXT,
  matiere      TEXT,
  sous_matiere TEXT,
  reminder     BOOLEAN     NOT NULL DEFAULT false,
  done         BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS planned_sessions_user_id_idx ON planned_sessions(user_id);

ALTER TABLE planned_sessions ENABLE ROW LEVEL SECURITY;

-- Chaque étudiant voit/modifie uniquement ses propres sessions planifiées
CREATE POLICY "planned_sessions_self" ON planned_sessions
  USING (user_id = auth.uid()::TEXT)
  WITH CHECK (user_id = auth.uid()::TEXT);
