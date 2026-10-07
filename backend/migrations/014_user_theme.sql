-- 014 — Theme preference per user
--
-- NULL = follow the operating system (prefers-color-scheme); 'light' /
-- 'dark' = explicit choice from the header toggle. Stored server-side so the
-- choice follows the user on every PC; the browser keeps a localStorage copy
-- only to paint the right theme before /api/me answers.
--
-- Idempotent: guarded column add.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme TEXT CHECK (theme IN ('light', 'dark'));
