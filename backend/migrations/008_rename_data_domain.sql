-- KanbanOps — Migration 008
-- Renames the 'Data Domain' pillar to 'Data Domain - ZFS' across all
-- referencing tables. Idempotent: subsequent runs find no rows to update
-- (the WHERE clause stops matching once values are migrated).
--
-- Tables touched:
--   tasks.group_name                TEXT
--   recurring_templates.group_name  TEXT
--   users.operator_groups           TEXT[]   (array_replace per element)
--
-- VALID_GROUPS in backend/src/auth.js and GROUPS in src/data.js must stay
-- in lockstep with this migration.

UPDATE tasks
SET group_name = 'Data Domain - ZFS'
WHERE group_name = 'Data Domain';

UPDATE recurring_templates
SET group_name = 'Data Domain - ZFS'
WHERE group_name = 'Data Domain';

UPDATE users
SET operator_groups = array_replace(operator_groups, 'Data Domain', 'Data Domain - ZFS')
WHERE 'Data Domain' = ANY(operator_groups);
