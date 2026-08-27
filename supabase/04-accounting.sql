-- Accounting books for Pyramid Snack (Mauritius SME / IFRS for SMEs style).
-- Additive: run this AFTER 02-setup.sql on an existing restaurant database.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT).

BEGIN;

-- ---------------------------------------------------------------------------
-- Orders: cash vs credit vs bank (sales receivable vs cash book)
-- ---------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('cash', 'bank', 'credit'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gl_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  account_type    TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  description     TEXT NOT NULL DEFAULT '',
  is_control      BOOLEAN NOT NULL DEFAULT FALSE,
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant ON gl_accounts(tenant_id, code);

-- ---------------------------------------------------------------------------
-- Journals (general ledger)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_no        TEXT NOT NULL,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  source          TEXT NOT NULL CHECK (source IN ('manual', 'sale', 'purchase', 'receipt', 'payment', 'expense')),
  source_ref      TEXT NOT NULL DEFAULT '',
  memo            TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entry_no)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date ON journal_entries(tenant_id, entry_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_auto_source
  ON journal_entries (tenant_id, source, source_ref)
  WHERE source <> 'manual' AND source_ref <> '';

CREATE TABLE IF NOT EXISTS journal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  journal_id      UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES gl_accounts(id),
  description     TEXT NOT NULL DEFAULT '',
  party_name      TEXT NOT NULL DEFAULT '',
  debit           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit          NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debit = 0 OR credit = 0)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(tenant_id, account_id);

-- ---------------------------------------------------------------------------
-- Purchases of goods (supplier invoices → purchases + trade payables)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_no     TEXT NOT NULL,
  purchase_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  payment_method  TEXT NOT NULL DEFAULT 'credit' CHECK (payment_method IN ('cash', 'bank', 'credit')),
  status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
  total_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  vat_inclusive   BOOLEAN NOT NULL DEFAULT TRUE,
  vat_claimable   BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, purchase_no)
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_id     UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  qty             NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (qty >= 0),
  unit_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_amount >= 0),
  line_total      NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(qty * unit_amount, 2)) STORED,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Cash / bank receipts (against sales receivable) and supplier payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS money_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  receipt_no      TEXT NOT NULL,
  receipt_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name   TEXT NOT NULL DEFAULT '',
  order_number    TEXT NOT NULL DEFAULT '',
  method          TEXT NOT NULL CHECK (method IN ('cash', 'bank')),
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  memo            TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, receipt_no)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_no      TEXT NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id     UUID REFERENCES purchases(id) ON DELETE SET NULL,
  method          TEXT NOT NULL CHECK (method IN ('cash', 'bank')),
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  memo            TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, payment_no)
);

-- ---------------------------------------------------------------------------
-- Seed a standard restaurant chart of accounts for one tenant
-- ---------------------------------------------------------------------------

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

REVOKE ALL ON FUNCTION public.seed_chart_of_accounts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_chart_of_accounts(UUID) TO authenticated;

-- Backfill CoA for restaurants that already exist
SELECT public.seed_chart_of_accounts(id) FROM tenants;

-- Seed CoA whenever a restaurant is created on first login
CREATE OR REPLACE FUNCTION public.ensure_my_restaurant()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_tenant_id UUID;
  v_slug TEXT;
  v_name TEXT;
  v_tenant json;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE owner_id = v_uid;

  IF v_tenant_id IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    v_email := COALESCE(v_email, '');
    v_name := COALESCE(
      NULLIF(initcap(replace(split_part(v_email, '@', 1), '.', ' ')), ''),
      'My restaurant'
    );
    v_slug := 'r-' || substr(replace(v_uid::text, '-', ''), 1, 16);

    INSERT INTO tenants (owner_id, slug, name, email, vat_registered)
    VALUES (v_uid, v_slug, v_name, v_email, FALSE)
    RETURNING id INTO v_tenant_id;
  END IF;

  PERFORM public.seed_chart_of_accounts(v_tenant_id);

  SELECT row_to_json(t) INTO v_tenant
  FROM tenants t
  WHERE t.id = v_tenant_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Restaurant missing after provision';
  END IF;

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_restaurant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_restaurant() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gl_accounts_all ON gl_accounts;
CREATE POLICY gl_accounts_all ON gl_accounts
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS journal_entries_all ON journal_entries;
CREATE POLICY journal_entries_all ON journal_entries
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS journal_lines_all ON journal_lines;
CREATE POLICY journal_lines_all ON journal_lines
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS suppliers_all ON suppliers;
CREATE POLICY suppliers_all ON suppliers
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS purchases_all ON purchases;
CREATE POLICY purchases_all ON purchases
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS purchase_lines_all ON purchase_lines;
CREATE POLICY purchase_lines_all ON purchase_lines
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS money_receipts_all ON money_receipts;
CREATE POLICY money_receipts_all ON money_receipts
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS supplier_payments_all ON supplier_payments;
CREATE POLICY supplier_payments_all ON supplier_payments
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_claimable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

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

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vat_claimable BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
