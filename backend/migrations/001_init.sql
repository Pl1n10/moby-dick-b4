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
