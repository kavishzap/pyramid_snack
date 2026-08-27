-- Multiple targeted categories per add-on menu item.
-- Run AFTER 06-addon-target-category.sql (safe to re-run).
-- Copies any existing single target_category_id, then drops that column.

BEGIN;

CREATE TABLE IF NOT EXISTS menu_item_target_categories (
  menu_item_id  UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_item_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_target_categories_tenant
  ON menu_item_target_categories(tenant_id, category_id);

ALTER TABLE menu_item_target_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_item_target_categories_all ON menu_item_target_categories;
CREATE POLICY menu_item_target_categories_all ON menu_item_target_categories
  FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name = 'target_category_id'
  ) THEN
    INSERT INTO menu_item_target_categories (menu_item_id, category_id, tenant_id)
    SELECT id, target_category_id, tenant_id
    FROM menu_items
    WHERE target_category_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    DROP INDEX IF EXISTS idx_menu_items_target_category;
    ALTER TABLE menu_items DROP COLUMN target_category_id;
  END IF;
END $$;

COMMIT;
