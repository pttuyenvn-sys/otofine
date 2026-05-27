-- ============================================================
-- Rollback: 053_admin_rbac.rollback.sql
-- Drops all 4 RBAC tables in FK-safe order (child before parent)
-- and removes the migration tracking row.
-- WARNING: Destructive. Run only if full RBAC teardown is required.
-- ============================================================

-- Drop child tables first (FK dependencies)
DROP TABLE IF EXISTS admin_user_roles;
DROP TABLE IF EXISTS admin_role_permissions;

-- Drop parent tables after children are removed
DROP TABLE IF EXISTS admin_permissions;
DROP TABLE IF EXISTS admin_roles;

-- Remove tracking row from migration registry
DELETE FROM schema_migrations WHERE filename = '053_admin_rbac.sql';
