-- 015 — Manual task order (drag & drop, "stile Jira")
--
-- The team asked to drag tasks into the order they want. Until now every
-- section was sorted by updated_at desc, so any edit sent the row to the top:
-- with a manual order, an edit no longer moves the row (decision 2026-10-16).
--
--   tasks.position  ascending = top of the section. Shared by the whole team.
--                   Moves renumber the section 0..n-1 (POST /tasks/:id/move);
--                   values are only meaningful within one section.
--
-- Existing tasks are ranked once by today's order (updated_at desc), so the
-- board looks exactly the same right after the deploy.
--
-- Every INSERT without a position (API, recurring processor) lands on top of
-- its board: MIN - 1. Negative values are fine. The trigger takes the board
-- row lock like trg_assign_task_number does, so concurrent inserts on the
-- same board never compute the same MIN.
--
-- Idempotent: the backfill runs only while the column does not exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'position'
  ) THEN
    ALTER TABLE tasks ADD COLUMN position INT;

    UPDATE tasks t SET position = n.rn - 1
    FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY tenant_id, group_name ORDER BY updated_at DESC, id
      ) AS rn
      FROM tasks
    ) n
    WHERE n.id = t.id;

    ALTER TABLE tasks ALTER COLUMN position SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_position ON tasks (tenant_id, group_name, position);

CREATE OR REPLACE FUNCTION assign_task_position() RETURNS trigger AS $$
BEGIN
  IF NEW.position IS NULL THEN
    PERFORM 1 FROM tenants WHERE id = NEW.tenant_id FOR UPDATE;
    SELECT COALESCE(MIN(position), 0) - 1 INTO NEW.position
    FROM tasks WHERE tenant_id = NEW.tenant_id AND group_name = NEW.group_name;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_task_position ON tasks;
CREATE TRIGGER trg_assign_task_position BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION assign_task_position();
