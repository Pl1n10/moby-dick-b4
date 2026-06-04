-- 010 — Task priority (P0..P5)
-- Adds a numeric priority to tasks. Convention: 0 = most urgent ("P0",
-- drop-everything), 5 = lowest. Default 3 (medium) so existing rows and new
-- tasks always carry a value. Idempotent: column add is guarded by IF NOT
-- EXISTS, so re-running on every boot is a no-op once applied.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 3
    CHECK (priority BETWEEN 0 AND 5);
