-- Order amounts: subtotal, discount, net total (VAT-inclusive when registered).
-- Optional contra-revenue account 4090 Sales discounts.
-- Additive and safe to re-run (including after the earlier 4100 version).

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2);
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12, 2);

UPDATE orders
SET discount_amount = 0
WHERE discount_amount IS NULL;

UPDATE orders
SET subtotal_amount = ROUND(COALESCE(total_amount, 0) + COALESCE(discount_amount, 0), 2)
WHERE subtotal_amount IS NULL
   OR subtotal_amount IS DISTINCT FROM ROUND(COALESCE(total_amount, 0) + COALESCE(discount_amount, 0), 2);

ALTER TABLE orders
  ALTER COLUMN discount_amount SET DEFAULT 0,
  ALTER COLUMN discount_amount SET NOT NULL,
  ALTER COLUMN subtotal_amount SET DEFAULT 0,
  ALTER COLUMN subtotal_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_amount_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_discount_amount_check
      CHECK (discount_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_subtotal_amount_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_subtotal_amount_check
      CHECK (subtotal_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_lte_subtotal_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_discount_lte_subtotal_check
      CHECK (discount_amount <= subtotal_amount);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_is_net_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_total_is_net_check
      CHECK (total_amount = subtotal_amount - discount_amount);
  END IF;
END $$;

-- Move the earlier 4100 Sales discounts account to 4090 when 4090 is free.
UPDATE gl_accounts
SET code = '4090',
    name = 'Sales discounts'
WHERE code = '4100'
  AND NOT EXISTS (
    SELECT 1
    FROM gl_accounts existing
    WHERE existing.tenant_id = gl_accounts.tenant_id
      AND existing.code = '4090'
  );

CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO gl_accounts (tenant_id, code, name, account_type, is_control, is_system)
  VALUES
    (p_tenant_id, '1000', 'Cash on hand', 'asset', FALSE, TRUE),
    (p_tenant_id, '1010', 'Bank', 'asset', FALSE, TRUE),
    (p_tenant_id, '1100', 'Trade receivables (sales control)', 'asset', TRUE, TRUE),
    (p_tenant_id, '1200', 'Inventory of goods', 'asset', FALSE, TRUE),
    (p_tenant_id, '1300', 'Input VAT receivable', 'asset', FALSE, TRUE),
    (p_tenant_id, '2000', 'Trade payables (purchase control)', 'liability', TRUE, TRUE),
    (p_tenant_id, '2100', 'Output VAT payable', 'liability', FALSE, TRUE),
    (p_tenant_id, '3000', 'Capital', 'equity', FALSE, TRUE),
    (p_tenant_id, '4000', 'Restaurant sales', 'income', FALSE, TRUE),
    (p_tenant_id, '4090', 'Sales discounts', 'income', FALSE, TRUE),
    (p_tenant_id, '5000', 'Purchases of goods / cost of sales', 'expense', FALSE, TRUE),
    (p_tenant_id, '5100', 'Distribution costs', 'expense', FALSE, TRUE),
    (p_tenant_id, '5200', 'Administrative expenses', 'expense', FALSE, TRUE),
    (p_tenant_id, '5300', 'Other expenses', 'expense', FALSE, TRUE)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$;

SELECT public.seed_chart_of_accounts(id) FROM tenants;

COMMIT;
