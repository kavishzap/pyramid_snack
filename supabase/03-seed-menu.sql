-- Seed Pyramid Snack menu for admin@pyramidsnack.com
-- Creates restaurant if missing, then categories + 109 menu items.
-- Safe to re-run: clears existing categories/menu for that restaurant first.

BEGIN;

-- Allow same dish name in different categories / service periods
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_tenant_id_name_key;
DROP INDEX IF EXISTS menu_items_tenant_id_name_key;

DO $$
DECLARE
  v_email TEXT := 'admin@pyramidsnack.com';
  v_uid UUID;
  v_tenant_id UUID;
  v_cat_id UUID;
  v_slug TEXT;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Auth user % not found. Create it in Authentication → Users first.', v_email;
  END IF;

  SELECT id INTO v_tenant_id FROM tenants WHERE owner_id = v_uid;

  IF v_tenant_id IS NULL THEN
    v_slug := 'r-' || substr(replace(v_uid::text, '-', ''), 1, 16);
    INSERT INTO tenants (owner_id, slug, name, email, vat_registered)
    VALUES (v_uid, v_slug, 'Pyramid Snack', v_email, FALSE)
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE tenants SET name = 'Pyramid Snack', email = v_email WHERE id = v_tenant_id;
  END IF;

  -- Replace previous seed for this restaurant
  DELETE FROM menu_items WHERE tenant_id = v_tenant_id;
  DELETE FROM categories WHERE tenant_id = v_tenant_id;

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'snacks', 0)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'wantan frit', '(calamar, porc) x5', FALSE,
    120, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'oeufs rôti', '', FALSE,
    40, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'aile de poulet croustillant', '', FALSE,
    65, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'hakien poulet', '', FALSE,
    120, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'Chips', '', FALSE,
    110, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'tête de porc', '', FALSE,
    200, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'chassive porc', '', FALSE,
    230, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'soupe', 1)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'maïs au poulet', '', FALSE,
    120, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'moon-kiow', '(x10 wantan porc frit)', FALSE,
    270, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'soupe Pyramide', 'à base de crevettes et de piment, mine, poulet, oeuf miroir & b.poisson', FALSE,
    290, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'boulettes/pièce', 2)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'chouchou', 'chevrette, poulet ou porc', FALSE,
    22, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'saw-mai', 'calamar, poulet ou porc', FALSE,
    22, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'boeuf', '', FALSE,
    22, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poisson', '', FALSE,
    22, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'wantan', 'calamar, porc', FALSE,
    22, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'fishlong', '', FALSE,
    25, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'dim-sum/pièce', 3)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'siew-kiow', 'poulet, champignon', FALSE,
    32, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'chicken & chives', 'poulet, légumes', FALSE,
    32, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'gyoza au poulet', '', FALSE,
    32, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'bouchon', 'poulet, crevettes', FALSE,
    32, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'chicken & calamari', 'poulet, calamar', FALSE,
    32, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'ha kow', 'crevettes, bamboo', FALSE,
    32, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'mine bouille', 4)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'nature', '', FALSE,
    70, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'oeuf', 'rôti ou miroir', FALSE,
    110, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'brède', '', FALSE,
    110, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet', '', FALSE,
    180, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'tête de porc', '', FALSE,
    180, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'saucisses porc', '', FALSE,
    180, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'boeuf', '', FALSE,
    195, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'chassive porc', '', FALSE,
    210, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'curry ourite', '', FALSE,
    210, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'mine bouille suppléments', 5)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'oeuf ou brède', '', TRUE,
    40, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet ou tête de porc ou saucisses', '', TRUE,
    110, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'boeuf', '', TRUE,
    125, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'chassive', '', TRUE,
    140, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'meefoon frit/bouillon', 6)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'légumes', '', FALSE,
    180, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet & oeuf', '', FALSE,
    240, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf & crevettes', '', FALSE,
    290, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf, crevettes & saucisses', '', FALSE,
    340, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'au boeuf ou au porc supplément', '', TRUE,
    50, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'assiette découverte', 7)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, '6 variété dim-sum + 1 fishlong', '', FALSE,
    200, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'mine frit', 8)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'légumes', '', FALSE,
    170, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet & oeuf', '', FALSE,
    230, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf & crevettes', '', FALSE,
    280, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf, crevettes & saucisses', '', FALSE,
    330, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'au boeuf ou au porc supplément', '', TRUE,
    50, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'riz frit', 9)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'légumes', '', FALSE,
    180, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet & oeuf', '', FALSE,
    240, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf & crevettes', '', FALSE,
    290, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf, crevettes & saucisses', '', FALSE,
    340, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'au boeuf ou au porc supplément', '', TRUE,
    50, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'bol/mine renversé', 10)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'légumes', '', FALSE,
    190, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet & oeuf', '', FALSE,
    250, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf & crevettes', '', FALSE,
    300, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'poulet, oeuf, crevettes & saucisses', '', FALSE,
    350, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'au boeuf ou au porc supplément', '', TRUE,
    50, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'boissons', 11)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'eau 500ml', '', FALSE,
    45, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'eau 1lt', '', FALSE,
    60, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'gazeuse chopine', '', FALSE,
    55, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'pearona chopine', '', FALSE,
    65, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'thé au jasmin', '', FALSE,
    95, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'fuze tea', '', FALSE,
    90, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'bière chopine', '', FALSE,
    125, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'bière bouteille', '', FALSE,
    240, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smirnoff canette', '', FALSE,
    170, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'appetizer', 12)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'crispy calamari', 'house made crispy calamari. Recommended for two persons.', FALSE,
    275, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smoked porc ribs', 'house smoked american-chinese style ribs.', FALSE,
    275, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'gyoza', 'comes in 6pcs. house made chicken gyoza.', FALSE,
    180, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'spring rolls veg', 'our spring rolles comes in 4pcs.', FALSE,
    200, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'spring rolls seafood', 'our spring rolles comes in 4pcs.', FALSE,
    250, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'mix platter', 'shared platter: mix of all above, appetizers with two special extra.', FALSE,
    325, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'main course', 13)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smoked tonkotsu ramen', 'rich pork broth, housemade noodles, house smoked pork char siu, eggs, braised bok choy', FALSE,
    350, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smoked chicken shoyu ramen', 'clear chicken broth, housemade noodles, house smoked chicken char siu, eggs, braised bok choy', FALSE,
    300, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smoked char siu chicken fried noodles', '', FALSE,
    250, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'kimchi traditional fried rice', '', FALSE,
    225, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smoked char siu chicken kimchi fried rice', '', FALSE,
    255, 0,
    FALSE, TRUE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'bar selection', 14)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'schweppes', '', FALSE,
    60, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'pearona', '', FALSE,
    45, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'fuze tea', '', FALSE,
    60, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'water 1L', '', FALSE,
    60, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'water 0.5L', '', FALSE,
    45, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'fanta', '', FALSE,
    40, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'coca', '', FALSE,
    40, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'sprite', '', FALSE,
    40, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'mocktail (of the day)', '', FALSE,
    110, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'beer bottle', '', FALSE,
    175, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'beer 330ml', '', FALSE,
    90, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'beer corona', '', FALSE,
    110, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smirnoff original red', '', FALSE,
    120, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smirnoff original blue', '', FALSE,
    125, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'jack daniel''s', '', FALSE,
    250, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'red label', '', FALSE,
    150, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'jack daniel''s with coke', '', FALSE,
    260, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'cocktail (of the day)', '', FALSE,
    130, 0,
    FALSE, FALSE, TRUE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'beer phoenix bottle', '', FALSE,
    250, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'beer phoenix 330ml', '', FALSE,
    140, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'beer corona', '', FALSE,
    150, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smirnoff original red', '', FALSE,
    160, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'smirnoff original blue', '', FALSE,
    165, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'cocktail (of the day)', '', FALSE,
    180, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'soft drinks', 15)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'water 1L', '', FALSE,
    60, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'water 0.5L', '', FALSE,
    45, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'pearona', '', FALSE,
    60, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'fanta/coca/sprite', '', FALSE,
    50, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'fuze tea', '', FALSE,
    75, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'mocktail (of the day)', '', FALSE,
    140, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'spirits', 16)
  RETURNING id INTO v_cat_id;

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'jack daniel''s', '', FALSE,
    325, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'red label', '', FALSE,
    175, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  INSERT INTO menu_items (
    tenant_id, category_id, name, description, allow_add_on,
    selling_price, manufactured_price,
    available_day, available_night, available_happy_hour, is_active
  ) VALUES (
    v_tenant_id, v_cat_id, 'jack daniel''s with coke', '', FALSE,
    335, 0,
    TRUE, FALSE, FALSE, TRUE
  );

  RAISE NOTICE 'Seeded % categories and % menu items for %', 17, 109, v_email;
END $$;

COMMIT;
