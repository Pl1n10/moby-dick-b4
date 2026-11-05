-- 016 — Local login (email + password), stopgap while Entra is unavailable
--
-- Used only with AUTH_MODE=local. A user without password_hash has not
-- activated the account yet: during the claim window (LOCAL_AUTH_CLAIM_UNTIL)
-- they choose it themselves, once; afterwards only a superadmin can set a new
-- one. password_set_at doubles as the session version: changing or clearing
-- the password invalidates every token issued before (see localAuth.js).
--
-- password_set_by = 'self' or the email of the superadmin who reset it, so
-- the console can tell a self-activated account from a reset one.
--
-- Idempotent: re-runs at every boot.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_by TEXT;
