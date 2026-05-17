-- Moby Dick B4 — Migration 002
-- Adds users table for Entra ID → owner/role mapping.
-- Idempotent: safe to re-run on every backend startup.

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_display_owner AS ENUM ('Bob', 'Erica', 'Walker');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  display_owner  user_display_owner,
  role           user_role NOT NULL DEFAULT 'viewer',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bootstrap admin: Roberto (dev/owner del progetto). display_owner = NULL
-- perché non è uno degli owner di task (Bob/Erica/Walker). Gli altri user
-- (Bob/Erica/Walker reali) verranno aggiunti via UPDATE/INSERT manuale o
-- tramite /api/users (quando implementato), non via seed.
--
-- ON CONFLICT keeps re-runs idempotent: rows edited manually on a deployed
-- DB are never overwritten on restart.
INSERT INTO users (email, display_owner, role) VALUES
  ('roberto.novara@mauden.com', NULL, 'admin')
ON CONFLICT (email) DO NOTHING;
