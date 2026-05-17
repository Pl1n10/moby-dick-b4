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
   'In Progress', 'Roberto Novara', false, NULL, '2026-02-07T09:30:00Z'),

  ('a1b2c3d4-0002-4000-8000-000000000002', 'Commvault',
   'Email: RE: License renewal Q1', 'Commvault license expiring March 15 — need PO approval from client',
   'Waiting', 'Amilcare Iacono', true, '2026-03-15', '2026-02-06T14:00:00Z'),

  ('a1b2c3d4-0003-4000-8000-000000000003', 'Cohesity',
   'INC00398877', 'Cohesity DataProtect node offline after firmware update',
   'New', 'Alessio Coletta', false, NULL, '2026-02-08T11:15:00Z'),

  ('a1b2c3d4-0004-4000-8000-000000000004', 'Cohesity',
   'Email: Cohesity cluster expansion', 'Client requested 3 additional nodes — sizing document needed',
   'In Progress', 'Amilcare Iacono', false, NULL, '2026-02-05T16:45:00Z'),

  ('a1b2c3d4-0005-4000-8000-000000000005', 'NBU - Banche Estere',
   'INC00420100', 'NetBackup master server certificate expired — all policies suspended',
   'In Progress', 'Roberto Novara', false, NULL, '2026-02-09T08:00:00Z'),

  ('a1b2c3d4-0006-4000-8000-000000000006', 'Data Domain',
   'Email: DD replication lag alert', 'Data Domain replication to DR site lagging >24h — bandwidth issue suspected',
   'Waiting', 'Alessio Coletta', true, NULL, '2026-02-08T17:30:00Z'),

  ('a1b2c3d4-0007-4000-8000-000000000007', 'Commvault',
   'INC00408234', 'CommServe gridstore offline dopo patch — ripristinato da backup config',
   'Resolved', 'Alessio Coletta', false, NULL, '2026-01-30T15:00:00Z'),

  ('a1b2c3d4-0008-4000-8000-000000000008', 'Cohesity',
   'Email: Report mensile gennaio', 'Report capacity + jobs gennaio inviato al cliente — archiviato',
   'Closed', 'Roberto Novara', false, NULL, '2026-01-31T16:00:00Z'),

  ('a1b2c3d4-0009-4000-8000-000000000009', 'Data Domain',
   'INC00425667', 'DD9300 allarme ventola — RMA sostituzione hardware programmata',
   'New', 'Amilcare Iacono', false, '2026-05-20', '2026-02-10T10:00:00Z'),

  ('a1b2c3d4-0010-4000-8000-000000000010', 'Data Domain',
   'Email: Aumento spazio Mtree banking', 'Cliente richiede +20TB su mtree /data/banking — design sizing in corso',
   'In Progress', 'Roberto Novara', false, '2026-06-30', '2026-02-09T15:00:00Z'),

  ('a1b2c3d4-0011-4000-8000-000000000011', 'NBU - Banche Estere',
   'INC00423901', 'Restore job stuck su client RHEL7 — case vendor aperto, in attesa patch',
   'Waiting', 'Amilcare Iacono', true, NULL, '2026-02-10T14:00:00Z'),

  ('a1b2c3d4-0012-4000-8000-000000000012', 'NBU - Banche Estere',
   'Email: Policy refresh trimestrale', 'Refresh policy SLP + verifica retention completato — report inviato',
   'Resolved', 'Alessio Coletta', false, NULL, '2026-02-04T12:00:00Z')
ON CONFLICT (id) DO NOTHING;
