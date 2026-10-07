-- 014 — Theme preference per user
--
-- NULL = follow the operating system (prefers-color-scheme); 'light' /
-- 'dark' = explicit choice from the header toggle. Stored server-side so the
-- choice follows the user on every PC; the browser keeps a localStorage copy
-- only to paint the right theme before /api/me answers.
--
-- Users who exist when the column is created start on 'dark': that is what
-- they have always seen, and the light theme must not appear on its own on a
-- PC set to light mode (the deploy should go unnoticed). Users who arrive
-- later get NULL and follow their OS.
--
-- Idempotent: the column and its one-time backfill happen together, only
-- when the column does not exist yet — re-running at boot never overrides a
-- choice made since (including "follow the OS").

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'theme'
  ) THEN
    ALTER TABLE users ADD COLUMN theme TEXT CHECK (theme IN ('light', 'dark'));
    UPDATE users SET theme = 'dark';
  END IF;
END $$;
