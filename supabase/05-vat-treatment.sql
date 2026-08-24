-- Per-document VAT treatment for expenses and purchases,
-- and cash vs bank on expenses.
-- Additive: run AFTER 04-accounting.sql (safe to re-run).

BEGIN;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_claimable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_claimable BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payment_method_check'
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_payment_method_check
      CHECK (payment_method IN ('cash', 'bank'));
  END IF;
END $$;

COMMIT;
