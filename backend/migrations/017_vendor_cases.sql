-- 017 — Vendor support cases mirrored as tasks
--
-- A board can connect any number of vendor support portals ("integrations"):
-- each one has its own account/session, its own target section, and mirrors
-- that account's open cases as tasks on that board only. First provider:
-- Cohesity (backend/src/integrations/providers/). A new provider is a new
-- module in the registry, not a migration: `provider` is validated by the API.
--
--   integrations   one row per connected portal account on a board. Its
--                  session lives in `credentials` (provider-specific JSON) and
--                  is WRITE-ONLY through the API: never sent back to a client.
--   vendor_cases   the open cases seen by each integration (closed ones only
--                  while a task points to them), and the task each one is
--                  mirrored to. tenant_id is repeated from the integration so
--                  every board query keeps filtering on tenant_id.
--
-- vendor_cases.task_id has NO foreign key on purpose: when someone deletes a
-- mirrored task, the case row keeps the dangling id and the sync does not
-- recreate the task (a deletion is a decision). The undo-restore of that task
-- re-POSTs the same UUID, so the link comes back by itself.
--
-- Deleting an integration deletes its case rows: the tasks stay, without tab.
--
-- Idempotent: re-applied at every boot.

CREATE TABLE IF NOT EXISTS integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  name            TEXT NOT NULL CHECK (btrim(name) <> ''),
  enabled         BOOLEAN NOT NULL DEFAULT false,
  group_name      TEXT,
  credentials     JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_set_at  TIMESTAMPTZ,
  session_set_by  TEXT,
  last_sync_at    TIMESTAMPTZ,
  last_ok_at      TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

-- The target section must be a section of the SAME board. It follows
-- renames; deleting the section leaves the integration without a target
-- (the sync reports it) instead of blocking the deletion.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_integrations_pillar') THEN
    ALTER TABLE integrations ADD CONSTRAINT fk_integrations_pillar
      FOREIGN KEY (tenant_id, group_name) REFERENCES pillars(tenant_id, name)
      ON UPDATE CASCADE ON DELETE SET NULL (group_name);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_cases (
  integration_id  UUID NOT NULL,
  tenant_id       UUID NOT NULL,
  ext_id          TEXT NOT NULL,
  case_number     TEXT NOT NULL,
  subject         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL,
  priority        TEXT,
  product         TEXT,
  cluster_name    TEXT,
  origin          TEXT,
  opened_at       TIMESTAMPTZ,
  modified_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  task_id         UUID,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (integration_id, ext_id),
  -- (tenant_id, integration_id) together: a case row can never claim a board
  -- other than its integration's.
  FOREIGN KEY (tenant_id, integration_id) REFERENCES integrations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS vendor_cases_task_idx ON vendor_cases (task_id);
