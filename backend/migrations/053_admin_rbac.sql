-- ============================================================
-- Migration: 053_admin_rbac.sql
-- Description: RBAC Foundation — 4 tables + roles + permissions + seeds
-- Runner: run-admin-migration.js (053_admin_rbac.sql already in whitelist)
-- Idempotency: CREATE TABLE IF NOT EXISTS + INSERT IGNORE
-- Additive only: no existing tables modified
-- FK note: admin_user_roles.admin_id has NO physical FK to admin.id (C4)
-- ============================================================

-- Step 1: Roles table
CREATE TABLE IF NOT EXISTS admin_roles (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_name   VARCHAR(64)  NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_superadmin TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ar_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Permissions table
-- append-only — no updated_at by design
CREATE TABLE IF NOT EXISTS admin_permissions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  permission_key VARCHAR(64)  NOT NULL,
  description    VARCHAR(255) NOT NULL DEFAULT '',
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ap_permission_key (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Role-permission join table
-- FKs: role_id → admin_roles, permission_id → admin_permissions (both CASCADE)
CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_arp_role       FOREIGN KEY (role_id)
    REFERENCES admin_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_arp_permission FOREIGN KEY (permission_id)
    REFERENCES admin_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 4: Admin-role assignment table
-- admin_id: logical reference to admin.id — NO physical FK (C4: conservative isolation)
-- granted_by: INT UNSIGNED NULL — who assigned the role (NULL = seeded or manual)
CREATE TABLE IF NOT EXISTS admin_user_roles (
  admin_id   INT UNSIGNED NOT NULL,
  role_id    INT UNSIGNED NOT NULL,
  granted_by INT UNSIGNED NULL,
  granted_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (admin_id, role_id),
  KEY idx_aur_admin_id (admin_id),
  CONSTRAINT fk_aur_role FOREIGN KEY (role_id)
    REFERENCES admin_roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Step 5: Seed roles (INSERT IGNORE — safe to re-run)
-- ============================================================
INSERT IGNORE INTO admin_roles (role_name, description, is_superadmin) VALUES
  ('superadmin', 'Bypass all permission checks — full platform access', 1),
  ('moderator',  'Shop approval, product moderation, RFQ read access', 0),
  ('analyst',    'Read-only analytics, billing, shops, RFQ access',    0),
  ('operator',   'Shop management, RFQ operations, part knowledge',     0);

-- ============================================================
-- Step 6: Seed permissions (INSERT IGNORE — safe to re-run)
-- 20 total: resource:action format
-- ============================================================
INSERT IGNORE INTO admin_permissions (permission_key, description) VALUES
  ('shops:read',                'List and view shop details'),
  ('shops:write',               'Approve, suspend, or update shops'),
  ('shops:delete',              'Delete a shop and its data'),
  ('platform:read',             'Read admin platform configuration'),
  ('rfq:admin:read',            'View all RFQ requests and conversations'),
  ('rfq:admin:write',           'Manage RFQ escalations and status'),
  ('part_knowledge:read',       'Read part knowledge base'),
  ('part_knowledge:write',      'Manage part knowledge base entries'),
  ('moderation:read',           'View moderation queue and decisions'),
  ('moderation:write',          'Execute moderation actions'),
  ('billing:read',              'View billing records and subscription status'),
  ('billing:write',             'Manage billing plans and overrides'),
  ('analytics:read',            'Access analytics dashboards and data'),
  ('risk:read',                 'View risk flags and fraud signals'),
  ('risk:write',                'Manage risk rules and dispositions'),
  ('crm:read',                  'View seller CRM profiles and notes'),
  ('crm:write',                 'Manage seller CRM entries and labels'),
  ('rbac:read',                 'View roles, permissions, and admin assignments'),
  ('rbac:manage',               'Assign and revoke admin roles'),
  ('audit_log:read',            'Access the operational audit log');

-- ============================================================
-- Step 7: Seed role-permission assignments (INSERT IGNORE via subquery)
-- Dependency: Steps 5 and 6 must complete first (enforced by sequence above)
-- ID-safe: subquery pattern avoids hardcoded AUTO_INCREMENT IDs
-- superadmin has NO rows here — bypass is via is_superadmin=1 flag
-- Total: 5 (moderator) + 4 (analyst) + 5 (operator) = 14 rows
-- ============================================================

-- moderator: shops:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'moderator' AND p.permission_key = 'shops:read';

-- moderator: shops:write
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'moderator' AND p.permission_key = 'shops:write';

-- moderator: moderation:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'moderator' AND p.permission_key = 'moderation:read';

-- moderator: moderation:write
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'moderator' AND p.permission_key = 'moderation:write';

-- moderator: rfq:admin:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'moderator' AND p.permission_key = 'rfq:admin:read';

-- analyst: shops:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'analyst' AND p.permission_key = 'shops:read';

-- analyst: analytics:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'analyst' AND p.permission_key = 'analytics:read';

-- analyst: rfq:admin:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'analyst' AND p.permission_key = 'rfq:admin:read';

-- analyst: billing:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'analyst' AND p.permission_key = 'billing:read';

-- operator: shops:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'operator' AND p.permission_key = 'shops:read';

-- operator: shops:write
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'operator' AND p.permission_key = 'shops:write';

-- operator: rfq:admin:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'operator' AND p.permission_key = 'rfq:admin:read';

-- operator: rfq:admin:write
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'operator' AND p.permission_key = 'rfq:admin:write';

-- operator: part_knowledge:read
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'operator' AND p.permission_key = 'part_knowledge:read';
