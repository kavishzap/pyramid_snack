-- Fresh schema: 1 Auth login = 1 restaurant (no staff / multi-user logins).
-- Run AFTER 01-reset.sql in the Supabase SQL Editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE order_status AS ENUM ('new', 'completed', 'cancelled');
CREATE TYPE expense_bucket AS ENUM ('cogs', 'distribution', 'admin', 'other');

-- ---------------------------------------------------------------------------
-- Restaurant (owned by exactly one Auth user)
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  address              TEXT NOT NULL DEFAULT '',
  phone                TEXT NOT NULL DEFAULT '',
  email                TEXT NOT NULL DEFAULT '',
  brn                  TEXT NOT NULL DEFAULT '',
  vat_registered       BOOLEAN NOT NULL DEFAULT FALSE,
  vat_number           TEXT NOT NULL DEFAULT '',
  logo_url             TEXT NOT NULL DEFAULT '',
  currency_code        CHAR(3) NOT NULL DEFAULT 'MUR',
  vat_rate             NUMERIC(5, 4) NOT NULL DEFAULT 0.1500,
  corporate_tax_rate   NUMERIC(5, 4) NOT NULL DEFAULT 0.1500,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_owner ON tenants(owner_id);

CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE menu_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id          UUID REFERENCES categories(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  allow_add_on         BOOLEAN NOT NULL DEFAULT FALSE,
  selling_price        NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  manufactured_price   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (manufactured_price >= 0),
  available_day        BOOLEAN NOT NULL DEFAULT TRUE,
  available_night      BOOLEAN NOT NULL DEFAULT FALSE,
  available_happy_hour BOOLEAN NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same dish name allowed across categories / day-night-happy-hour price variants
CREATE INDEX idx_menu_items_tenant_category ON menu_items(tenant_id, category_id);

CREATE TABLE dining_tables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_number    INT NOT NULL CHECK (table_number > 0),
  capacity        INT NOT NULL DEFAULT 2 CHECK (capacity > 0),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, table_number)
);

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number    TEXT NOT NULL,
  client_name     TEXT NOT NULL DEFAULT 'Walk-in guest',
  table_number    INT NOT NULL CHECK (table_number > 0),
  dining_table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
  status          order_status NOT NULL DEFAULT 'new',
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  order_time      TIME NOT NULL DEFAULT LOCALTIME,
  total_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes           TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_number)
);

CREATE TABLE order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id    UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  qty             NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_line_addons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_line_id   UUID NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  menu_item_id    UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  price           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expense_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  bucket          expense_bucket NOT NULL DEFAULT 'other',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_expense_categories_tenant_name
  ON expense_categories (tenant_id, name)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX uq_expense_categories_global_name
  ON expense_categories (name)
  WHERE tenant_id IS NULL;

CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_date    DATE NOT NULL,
  category_id     UUID NOT NULL REFERENCES expense_categories(id),
  notes           TEXT NOT NULL DEFAULT '',
  total_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expense_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_id      UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  qty             NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (qty >= 0),
  unit_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_amount >= 0),
  line_total      NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(qty * unit_amount, 2)) STORED,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO expense_categories (tenant_id, name, bucket)
VALUES
  (NULL, 'Produce', 'cogs'),
  (NULL, 'Meat & seafood', 'cogs'),
  (NULL, 'Dairy', 'cogs'),
  (NULL, 'Dry goods', 'cogs'),
  (NULL, 'Beverages', 'cogs'),
  (NULL, 'Alcohol', 'cogs'),
  (NULL, 'Packaging', 'cogs'),
  (NULL, 'Marketing', 'distribution'),
  (NULL, 'Transportation', 'distribution'),
  (NULL, 'Payroll', 'admin'),
  (NULL, 'Rent', 'admin'),
  (NULL, 'Utilities', 'admin'),
  (NULL, 'Insurance', 'admin'),
  (NULL, 'Licenses & permits', 'admin'),
  (NULL, 'Software & subscriptions', 'admin'),
  (NULL, 'Cleaning supplies', 'admin'),
  (NULL, 'Kitchen equipment', 'admin'),
  (NULL, 'Furniture & fixtures', 'admin'),
  (NULL, 'Maintenance & repairs', 'admin'),
  (NULL, 'Miscellaneous', 'other');

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER — no membership table)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tenants WHERE owner_id = auth.uid();
$$;

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

  SELECT row_to_json(t) INTO v_tenant
  FROM tenants t
  WHERE t.id = v_tenant_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Restaurant missing after provision';
  END IF;

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.user_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_tenant_ids() TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_my_restaurant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_restaurant() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON tenants
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY tenants_update ON tenants
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY categories_all ON categories
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY menu_items_all ON menu_items
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY dining_tables_all ON dining_tables
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY orders_all ON orders
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY order_lines_all ON order_lines
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY order_line_addons_all ON order_line_addons
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY expense_categories_select ON expense_categories
  FOR SELECT USING (
    tenant_id IS NULL OR tenant_id IN (SELECT public.user_tenant_ids())
  );
CREATE POLICY expense_categories_write ON expense_categories
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY expenses_all ON expenses
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

CREATE POLICY expense_lines_all ON expense_lines
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

COMMIT;

-- Usage:
-- 1) Run 01-reset.sql
-- 2) Run this file
-- 3) Create a user in Authentication → Users (email + password)
-- 4) Sign in with that email/password — their restaurant is created automatically
-- 5) Another Auth user = another separate restaurant
