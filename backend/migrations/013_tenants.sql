-- 013 — Multi-tenant boards ("lavagne")
--
-- One deployment now serves several boards: the original backup-team board
-- plus the Service Manager one, and whatever comes next. Decision and
-- rationale in HANDOFF.md, "Strategia evoluzione" (2026-10-07).
--
--   tenants      one row per board. `settings` holds per-board customisation:
--                {"labels": {"reference": "Attività"}, "features": {"reperibile": false}}
--   pillars      the sections of each board (Commvault, Cohesity, …). They
--                replace the hardcoded GROUPS / VALID_GROUPS lists.
--   memberships  who belongs to which board and with which role. Role and
--                operator scope move here from `users`: being admin of one
--                board says nothing about the others.
--   users.is_superadmin   global role: creates boards, manages everyone.
--   users.home_tenant_id  the board a user picked at first login (NULL =
--                         never picked → the UI shows the board chooser).
--   tenants.last_task_number  per-board task counter: each board numbers
--                         its own tasks (MD001… on backup, its own prefix
--                         elsewhere — settings.idPrefix). Replaces the global
--                         task_number_seq of 012.
--
-- tasks, recurring_templates and app_settings get a tenant_id. Subtasks
-- inherit it from their parent task. bit_adder stays global (it is per
-- person, not per board).
--
-- users.role and users.operator_groups are no longer read by the API. They
-- stay because migrations 004/007/008 still write them on every boot.
--
-- Idempotent like every migration here (runMigrations re-applies all files at
-- each boot, and a multi-statement file runs as one transaction). The data
-- backfill runs ONCE, guarded by "tenants is empty": guarding on the slug
-- would re-create the board — and re-add every user to it — the day someone
-- renames it from the console.

CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_task_number INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pillars (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS memberships (
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE ON UPDATE CASCADE,
  role            user_role NOT NULL DEFAULT 'viewer',
  operator_groups TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships(email);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

-- RESTRICT: a board that still has tasks or templates cannot be deleted by
-- accident; it has to be emptied first.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE recurring_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- ── One-time backfill: everything that exists today is the backup board ──
DO $$
DECLARE
  backup_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM tenants) THEN
    RETURN;
  END IF;

  INSERT INTO tenants (slug, name, settings, position)
  VALUES ('backup', 'Backup', '{"idPrefix": "MD", "features": {"reperibile": true}}'::jsonb, 0)
  RETURNING id INTO backup_id;

  -- Task numbers become per board. The backup board continues from where the
  -- global sequence stopped (not from MAX(number): numbers of deleted tasks
  -- are never reused).
  UPDATE tenants SET last_task_number = GREATEST(
    COALESCE((SELECT MAX(number) FROM tasks), 0),
    COALESCE((SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM task_number_seq), 0)
  ) WHERE id = backup_id;
  ALTER TABLE tasks ALTER COLUMN number DROP DEFAULT;
  DROP SEQUENCE IF EXISTS task_number_seq;
  ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_number_unique;

  INSERT INTO pillars (tenant_id, name, position) VALUES
    (backup_id, 'Commvault',           0),
    (backup_id, 'Cohesity',            1),
    (backup_id, 'Data Domain - ZFS',   2),
    (backup_id, 'NBU - Banche Estere', 3);

  -- Any group value outside the canonical four becomes a pillar too, so the
  -- foreign keys below can never fail on real data. An unexpected section in
  -- the console is easy to spot and fix; a backend that does not boot is not.
  INSERT INTO pillars (tenant_id, name, position)
  SELECT backup_id, g, 100
  FROM (SELECT group_name AS g FROM tasks
        UNION SELECT group_name FROM recurring_templates) extra
  WHERE btrim(g) <> ''
  ON CONFLICT (tenant_id, name) DO NOTHING;

  UPDATE tasks               SET tenant_id = backup_id;
  UPDATE recurring_templates SET tenant_id = backup_id;
  UPDATE app_settings        SET tenant_id = backup_id;

  -- Everyone who could see the single board until now keeps the same role on
  -- it, and does not get the board chooser at next login.
  INSERT INTO memberships (tenant_id, email, role, operator_groups)
  SELECT backup_id, email, role, operator_groups FROM users;

  UPDATE users SET home_tenant_id = backup_id;
  UPDATE users SET is_superadmin = true WHERE email = 'roberto.novara@mauden.com';

  ALTER TABLE app_settings DROP CONSTRAINT app_settings_pkey;
  ALTER TABLE app_settings ADD PRIMARY KEY (tenant_id, key);
END $$;

ALTER TABLE tasks               ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE recurring_templates ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks (tenant_id, updated_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_tenant_number_unique') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_number_unique UNIQUE (tenant_id, number);
  END IF;
END $$;

-- Every INSERT without a number (API, recurring processor) takes the next one
-- of its board. The UPDATE row-locks the board, so concurrent inserts on the
-- same board are serialized and never get the same number.
CREATE OR REPLACE FUNCTION assign_task_number() RETURNS trigger AS $$
BEGIN
  IF NEW.number IS NULL THEN
    UPDATE tenants SET last_task_number = last_task_number + 1
    WHERE id = NEW.tenant_id
    RETURNING last_task_number INTO NEW.number;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_task_number ON tasks;
CREATE TRIGGER trg_assign_task_number BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION assign_task_number();

-- A task's section must exist on its own board. ON UPDATE CASCADE: renaming a
-- section from the console renames it on every task and template with no
-- extra code (operator_groups is an array and is renamed by the API).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_pillar') THEN
    ALTER TABLE tasks ADD CONSTRAINT fk_tasks_pillar
      FOREIGN KEY (tenant_id, group_name) REFERENCES pillars(tenant_id, name)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_recurring_pillar') THEN
    ALTER TABLE recurring_templates ADD CONSTRAINT fk_recurring_pillar
      FOREIGN KEY (tenant_id, group_name) REFERENCES pillars(tenant_id, name)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;
