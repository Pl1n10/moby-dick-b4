-- 012 — Task number (MD001, MD002, …)
--
-- The backup team asked for a stable, human-friendly id on every task, the
-- old ones included. Stored as a plain ascending integer; the "MD" prefix and
-- the zero padding are presentation (formatTaskCode in src/utils.js and
-- backend/src/notify.js).
--
-- Existing tasks are numbered once, oldest first (created_at, then id to
-- break ties). New tasks take the next value from a sequence via the column
-- DEFAULT, so every INSERT path (API, recurring processor) gets one without
-- code changes. Deleted tasks leave a gap: a number is never reused, except
-- by the undo of that very deletion (see POST /api/tasks).
--
-- Idempotent: the whole block runs only while the column does not exist.
-- The sequence is created inside the block on purpose: 013 replaces it with
-- a per-board counter and drops it, and it must not come back at next boot.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'number'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS task_number_seq;
    ALTER TABLE tasks ADD COLUMN number INT;

    UPDATE tasks t SET number = n.rn
    FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM tasks) n
    WHERE n.id = t.id;

    -- is_called = false: the next nextval() returns exactly MAX + 1 (or 1 on
    -- an empty table).
    PERFORM setval('task_number_seq', COALESCE((SELECT MAX(number) FROM tasks), 0) + 1, false);

    ALTER TABLE tasks ALTER COLUMN number SET DEFAULT nextval('task_number_seq');
    ALTER TABLE tasks ALTER COLUMN number SET NOT NULL;
    ALTER TABLE tasks ADD CONSTRAINT tasks_number_unique UNIQUE (number);
    ALTER SEQUENCE task_number_seq OWNED BY tasks.number;
  END IF;
END $$;
