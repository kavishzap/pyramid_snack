-- Per-document VAT treatment for expenses and purchases.
-- Additive: run AFTER 04-accounting.sql (safe to re-run).

BEGIN;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_claimable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_claimable BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
