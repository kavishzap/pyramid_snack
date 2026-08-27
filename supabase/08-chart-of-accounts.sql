-- Optional description on chart of accounts.
-- gl_accounts already exists from 04-accounting.sql.
-- Additive: safe to re-run.

BEGIN;

ALTER TABLE gl_accounts
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

COMMIT;
