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

-- Initial admin seed. ON CONFLICT keeps re-runs idempotent and lets the team
-- update rows manually (or via /api/users) without losing edits on restart.
INSERT INTO users (email, display_owner, role) VALUES
  ('bob@mauden.com',    'Bob',    'admin'),
  ('erica@mauden.com',  'Erica',  'admin'),
  ('walker@mauden.com', 'Walker', 'admin')
ON CONFLICT (email) DO NOTHING;
