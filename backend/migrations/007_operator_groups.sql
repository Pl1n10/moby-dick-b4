-- KanbanOps — Migration 007
-- Adds operator_groups TEXT[] to users for per-pillar write scope.
--
-- Model: role stays scalar (admin | viewer). operator_groups is an additive
-- capability over viewer. A viewer with operator_groups = ['Commvault']
-- becomes read-only globally but can create/edit/delete tasks (and their
-- subtasks) inside the Commvault pillar. Admin users ignore this column —
-- they retain full access everywhere.
--
-- No CHECK constraint on values: enforced at the application layer (the
-- valid set matches src/data.js GROUPS, kept in sync server-side).
-- Idempotent: re-applied every backend boot, no-op once converged.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'operator_groups'
  ) THEN
    ALTER TABLE users
      ADD COLUMN operator_groups TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
