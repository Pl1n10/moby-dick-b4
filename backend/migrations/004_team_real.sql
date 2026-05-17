-- Moby Dick B4 — Migration 004
-- Onboarding real Mauden team. Three changes, all idempotent:
--   1. Schema: display_owner enum → TEXT (more flexibility; new admins can
--      become owners without ALTER TYPE every time).
--   2. Seed: four real admins (Roberto, Amilcare, Alessio, Marco) with
--      display_owner valued — full name "Nome Cognome".
--   3. Data remap: example task seed owners Bob/Erica/Walker → real names.
--
-- ON CONFLICT/DO UPDATE keeps re-runs safe; UPDATEs are no-ops once values
-- are settled.

-- 1) Convert display_owner enum → TEXT. Drop the enum type once unused.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'display_owner'
      AND udt_name = 'user_display_owner'
  ) THEN
    ALTER TABLE users ALTER COLUMN display_owner TYPE TEXT USING display_owner::text;
  END IF;
END $$;

DROP TYPE IF EXISTS user_display_owner;

-- 2) Real admin seed. ON CONFLICT updates display_owner + role so re-runs
-- and migration tweaks converge to the latest values.
INSERT INTO users (email, display_owner, role) VALUES
  ('roberto.novara@mauden.com',  'Roberto Novara',  'admin'),
  ('amilcare.iacono@mauden.com', 'Amilcare Iacono', 'admin'),
  ('alessio.coletta@mauden.com', 'Alessio Coletta', 'admin'),
  ('marco.fauci@mauden.com',     'Marco Fauci',     'admin')
ON CONFLICT (email) DO UPDATE
  SET display_owner = EXCLUDED.display_owner,
      role          = EXCLUDED.role;

-- 3) Remap any pre-existing seed rows from placeholder owners to real ones.
-- No-op once converged.
UPDATE tasks SET owner = 'Roberto Novara'  WHERE owner = 'Bob';
UPDATE tasks SET owner = 'Amilcare Iacono' WHERE owner = 'Erica';
UPDATE tasks SET owner = 'Alessio Coletta' WHERE owner = 'Walker';

UPDATE recurring_templates SET owner = 'Roberto Novara'  WHERE owner = 'Bob';
UPDATE recurring_templates SET owner = 'Amilcare Iacono' WHERE owner = 'Erica';
UPDATE recurring_templates SET owner = 'Alessio Coletta' WHERE owner = 'Walker';
