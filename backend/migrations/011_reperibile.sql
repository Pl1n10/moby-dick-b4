-- 011 — Info Reperibile
--
-- Two independent pieces:
--
-- 1. tasks.reperibile — a flag, NOT a copy. The "Info Reperibile" tab is a
--    filtered view over all pillars (WHERE reperibile AND status <> 'Closed'),
--    so editing/closing a task from that tab edits/closes the one and only
--    task. Deliberate: a real clone would drift from the original within a
--    day and raise the "what if the source is deleted?" question.
--
-- 2. app_settings — generic key/value store for singleton app-wide settings.
--    First (and so far only) key: 'on_call' = display_owner of the colleague
--    currently on call. Kept as a table rather than an env var because admins
--    change it from the UI, at any hour, without a redeploy.
--
-- Idempotent: guarded column add + CREATE TABLE IF NOT EXISTS, so re-running
-- on every boot (see runMigrations) is a no-op once applied.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reperibile BOOLEAN NOT NULL DEFAULT false;

-- Partial index: the tab reads only the flagged rows, which are a small
-- fraction of the table.
CREATE INDEX IF NOT EXISTS idx_tasks_reperibile
  ON tasks (updated_at DESC) WHERE reperibile;

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- Seed the on_call key with a NULL value so GET always finds a row and the
-- UI can render "nessun reperibile impostato" without a special case.
INSERT INTO app_settings (key, value) VALUES ('on_call', NULL)
  ON CONFLICT (key) DO NOTHING;
