-- Moby Dick B4 — Migration 006
-- Adds checklist-style subitems to tasks. Each task can have an arbitrary
-- number of subtasks (text + done flag). When a parent task is closed,
-- the API enforces that all subtasks are done first (rigid constraint).
--
-- ON DELETE CASCADE: deleting the parent task wipes its checklist.

CREATE TABLE IF NOT EXISTS subtasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  done        BOOLEAN NOT NULL DEFAULT false,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
