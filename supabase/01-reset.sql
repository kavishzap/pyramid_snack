-- Wipe all app tables / functions / types from previous setups.
-- Does NOT delete Auth users (Authentication → Users).
-- Run this first in the Supabase SQL Editor.

BEGIN;

DROP FUNCTION IF EXISTS public.ensure_my_restaurant();
DROP FUNCTION IF EXISTS public.user_tenant_ids();
DROP FUNCTION IF EXISTS public.link_auth_user_to_tenant(text, text);

DROP TABLE IF EXISTS public.expense_lines CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.expense_categories CASCADE;
DROP TABLE IF EXISTS public.order_line_addons CASCADE;
DROP TABLE IF EXISTS public.order_lines CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.dining_tables CASCADE;
DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.tenant_memberships CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

DROP TYPE IF EXISTS public.user_role CASCADE;
DROP TYPE IF EXISTS public.order_status CASCADE;
DROP TYPE IF EXISTS public.expense_bucket CASCADE;

COMMIT;
