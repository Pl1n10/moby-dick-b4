-- Moby Dick B4 — Migration 003
-- Removes the historical placeholder seed rows (pippo/pluto/paperino) that
-- were inserted by an earlier version of 002_users.sql. Idempotent:
-- DELETE on absent rows is a no-op, so this is safe to re-run every boot.
--
-- Real users are added by hand or via /api/users (when implemented), never
-- by seed file.

DELETE FROM users WHERE email IN (
  'pippo@example.com',
  'pluto@example.com',
  'paperino@example.com'
);
