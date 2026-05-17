-- Moby Dick B4 — Migration 005
-- Removes the redundant `waiting` boolean column (the status 'Waiting'
-- already carries the same info) and clears the historical example seed
-- rows (UUIDs a1b2c3d4-0001..0012) — production starts empty, real tasks
-- only.
--
-- Idempotent:
--   - DROP COLUMN IF EXISTS is a no-op when the column is already gone
--   - DELETE by fixed UUID never touches user-created rows

DELETE FROM tasks WHERE id IN (
  'a1b2c3d4-0001-4000-8000-000000000001',
  'a1b2c3d4-0002-4000-8000-000000000002',
  'a1b2c3d4-0003-4000-8000-000000000003',
  'a1b2c3d4-0004-4000-8000-000000000004',
  'a1b2c3d4-0005-4000-8000-000000000005',
  'a1b2c3d4-0006-4000-8000-000000000006',
  'a1b2c3d4-0007-4000-8000-000000000007',
  'a1b2c3d4-0008-4000-8000-000000000008',
  'a1b2c3d4-0009-4000-8000-000000000009',
  'a1b2c3d4-0010-4000-8000-000000000010',
  'a1b2c3d4-0011-4000-8000-000000000011',
  'a1b2c3d4-0012-4000-8000-000000000012'
);

ALTER TABLE tasks DROP COLUMN IF EXISTS waiting;
