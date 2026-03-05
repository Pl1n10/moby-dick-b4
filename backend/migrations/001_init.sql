-- Moby Dick B4 — Database Schema
-- Run automatically on first PostgreSQL container start

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name    TEXT NOT NULL,
  reference     TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'New'
                  CHECK (status IN ('New','In Progress','Waiting','Resolved','Closed')),
  owner         TEXT NOT NULL,
  waiting       BOOLEAN NOT NULL DEFAULT false,
  deadline      DATE,
  recurring_template_id UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name      TEXT NOT NULL,
  reference       TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  owner           TEXT NOT NULL,
  frequency       TEXT NOT NULL DEFAULT 'daily'
                    CHECK (frequency IN ('daily','weekly','monthly')),
  scheduled_time  TEXT NOT NULL DEFAULT '08:00',
  last_created_date DATE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign key: tasks → recurring_templates (SET NULL on delete keeps task, clears link)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_tasks_recurring_template'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_recurring_template
      FOREIGN KEY (recurring_template_id) REFERENCES recurring_templates(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Seed data (only inserted on first run)
INSERT INTO tasks (id, group_name, reference, description, status, owner, waiting, deadline, updated_at)
VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Commvault',
   'INC00412301', 'Backup job failing on SQL Server prod cluster — timeout after 4h',
   'In Progress', 'Bob', false, NULL, '2026-02-07T09:30:00Z'),

  ('a1b2c3d4-0002-4000-8000-000000000002', 'Commvault',
   'Email: RE: License renewal Q1', 'Commvault license expiring March 15 — need PO approval from client',
   'Waiting', 'Erica', true, '2026-03-15', '2026-02-06T14:00:00Z'),

  ('a1b2c3d4-0003-4000-8000-000000000003', 'Cohesity',
   'INC00398877', 'Cohesity DataProtect node offline after firmware update',
   'New', 'Walker', false, NULL, '2026-02-08T11:15:00Z'),

  ('a1b2c3d4-0004-4000-8000-000000000004', 'Cohesity',
   'Email: Cohesity cluster expansion', 'Client requested 3 additional nodes — sizing document needed',
   'In Progress', 'Erica', false, NULL, '2026-02-05T16:45:00Z'),

  ('a1b2c3d4-0005-4000-8000-000000000005', 'NetBackup + Data Domain',
   'INC00420100', 'NetBackup master server certificate expired — all policies suspended',
   'In Progress', 'Bob', false, NULL, '2026-02-09T08:00:00Z'),

  ('a1b2c3d4-0006-4000-8000-000000000006', 'NetBackup + Data Domain',
   'Email: DD replication lag alert', 'Data Domain replication to DR site lagging >24h — bandwidth issue suspected',
   'Waiting', 'Walker', true, NULL, '2026-02-08T17:30:00Z')
ON CONFLICT (id) DO NOTHING;
