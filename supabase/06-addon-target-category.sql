-- Targeted category for add-on menu items (e.g. category "Ad ons").
-- Additive: run AFTER 05-vat-treatment.sql (safe to re-run).

BEGIN;

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS target_category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_items_target_category
  ON menu_items(tenant_id, target_category_id);

COMMIT;
