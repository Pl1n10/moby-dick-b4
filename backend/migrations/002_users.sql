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

-- Placeholder admin seed using RFC 2606 reserved dummy emails. The real
-- mapping between Entra accounts and display_owner is done at deploy time
-- via UPDATE/INSERT against this table (or via the future /api/users CRUD),
-- so this seed only exists to make local/dev runs render correctly.
--
-- ON CONFLICT keeps re-runs idempotent: rows edited manually on a deployed
-- DB are never overwritten on restart.
INSERT INTO users (email, display_owner, role) VALUES
  ('pippo@example.com',     'Bob',    'admin'),
  ('pluto@example.com',     'Erica',  'admin'),
  ('paperino@example.com',  'Walker', 'admin')
ON CONFLICT (email) DO NOTHING;
