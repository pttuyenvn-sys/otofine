# Otofine Admin Platform — Phase 1A Slice 3: RBAC Foundation
## Implementation Files Specification

**Status:** SPECIFICATION ONLY — no files written  
**Date:** 2026-05-27  
**Source of truth:** `phase-1a-slice3-rbac-design.md` v1.1, `phase-1a-slice3-rbac-final-review.md`  
**Applied corrections:** B1, B2, B3, C1–C6 (design), C1–C3 (final review)

---

## File Inventory

| # | Path | Type | Action |
|---|---|---|---|
| 1 | `backend/migrations/053_admin_rbac.sql` | SQL | NEW |
| 2 | `backend/migrations/053_admin_rbac.rollback.sql` | SQL | NEW |
| 3 | `backend/modules/admin/core/rbac/rbac.service.js` | ESM | NEW |
| 4 | `backend/modules/admin/core/rbac/rbac.middleware.js` | ESM | NEW |
| 5 | `backend/modules/admin/rbac/controllers/rbac.admin.controller.js` | ESM | NEW |
| 6 | `backend/modules/admin/rbac/routes/rbac.admin.routes.js` | ESM | NEW |
| 7 | `backend/modules/admin/index.js` | ESM | MODIFY (additive) |
| 8 | `backend/server.js` | ESM | MODIFY (additive) |
| 9 | `backend/package.json` | JSON | MODIFY (additive) |

---

## File 1: `backend/migrations/053_admin_rbac.sql`

```sql
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
```

---

## File 2: `backend/migrations/053_admin_rbac.rollback.sql`

```sql
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
```

---

## File 3: `backend/modules/admin/core/rbac/rbac.service.js`

```javascript
/**
 * RBAC permission resolution service.
 *
 * Provides:
 *   getAdminRbac(adminId)         — resolves an admin's roles + permissions from Redis/DB
 *   hasPermission(adminId, key)   — returns true if admin has the given permission (or is superadmin)
 *   invalidateAdminRbacCache(id)  — invalidates per-admin or all RBAC cache entries
 *
 * Cache strategy:
 *   Key:    admin:rbac:{adminId}:perms
 *   TTL:    RBAC_CACHE_TTL_MS (300 000 ms = 5 minutes)
 *   Value:  JSON string: { "permissions": ["rbac:read", ...], "isSuperadmin": false }
 *
 * Cache key format (with redisCache.service.js namespace prefix applied):
 *   {CACHE_KEY_PREFIX}dv{CACHE_DATA_VERSION}:admin:rbac:{adminId}:perms
 *   Example: otofine:v1:dv1:admin:rbac:7:perms
 *
 * Per-admin invalidation prefix: 'admin:rbac:' + adminId + ':'
 *   Colon-terminated — prevents numeric prefix collision (B2).
 *   'admin:rbac:7:' does NOT match 'admin:rbac:70:perms'.
 *
 * Fail-safe behavior (C1 final-review):
 *   When DB is unavailable, getAdminRbac catches the error internally and returns
 *   { permissions: new Set(), isSuperadmin: false }. hasPermission then returns false.
 *   requirePermission receives false and returns 403 (deny). This is NOT a 500 path —
 *   infrastructure failures are absorbed here and produce a deterministic deny at the
 *   middleware layer. The 500 path in requirePermission is reserved for programming errors
 *   (unexpected throws from hasPermission itself).
 *
 * Superadmin detection (C1 design-review):
 *   The DB query LEFT JOINs admin_role_permissions. For a superadmin with no permission
 *   rows, the result contains one NULL-permission_key row with is_superadmin=1.
 *   The iteration MUST check is_superadmin on ALL rows (including the NULL row) to
 *   correctly detect superadmin status. A non-iterating approach (e.g. rows[0]) is WRONG.
 */

import { getRaw, setRaw, invalidateByLogicalPrefix } from "../../../../services/redisCache.service.js";
import { pool } from "../../../../config/db.js";

/**
 * Redis TTL for RBAC cache entries.
 * Unit: milliseconds. redisCache.service.js setRaw converts ms to seconds internally.
 * 300_000 ms = 300 s = 5 minutes.
 * DO NOT use literal 300 or 60 here — both are wrong (300 = 300ms, 60 = 60ms).
 */
export const RBAC_CACHE_TTL_MS = 300_000;

/**
 * Resolve an admin's RBAC state: their full permission Set and superadmin status.
 *
 * Resolution order:
 *   1. Redis / in-memory LRU (via getRaw)
 *   2. DB query (admin_user_roles JOIN admin_roles LEFT JOIN admin_role_permissions)
 *   3. On DB failure: return empty result (deny-safe)
 *
 * @param {number} adminId  The admin's numeric id from req.user.id
 * @returns {Promise<{ permissions: Set<string>, isSuperadmin: boolean }>}
 */
export async function getAdminRbac(adminId) {
  const cacheKey = `admin:rbac:${adminId}:perms`;

  // Layer 1: Redis / LRU cache
  try {
    const cached = await getRaw(cacheKey);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      return {
        permissions: new Set(parsed.permissions),
        isSuperadmin: Boolean(parsed.isSuperadmin),
      };
    }
  } catch (err) {
    console.warn(`[rbac:service] Redis read error for admin ${adminId}:`, err.message);
    // Fall through to DB
  }

  // Layer 2: DB query
  try {
    // C1: LEFT JOIN ensures superadmin role's NULL permission_key row is returned.
    // GROUP BY p.permission_key groups NULL values together (MySQL treats NULL = NULL in GROUP BY).
    // MAX(r.is_superadmin) per group ensures superadmin flag is detected even when
    // the admin holds both a superadmin role and a regular role simultaneously.
    const [rows] = await pool.query(
      `SELECT p.permission_key, MAX(r.is_superadmin) AS is_superadmin
       FROM admin_user_roles aur
       JOIN admin_roles r ON r.id = aur.role_id
       LEFT JOIN admin_role_permissions arp ON arp.role_id = r.id
       LEFT JOIN admin_permissions p ON p.id = arp.permission_id
       WHERE aur.admin_id = ?
       GROUP BY p.permission_key`,
      [adminId],
    );

    // C1: iterate ALL rows — superadmin detection requires checking every row,
    // including the NULL-permission_key row that carries is_superadmin=1
    // for a superadmin role with no permission assignments.
    let isSuperadmin = false;
    const permissions = new Set();
    for (const row of rows) {
      if (row.is_superadmin) isSuperadmin = true;
      if (row.permission_key) permissions.add(row.permission_key);
    }

    // Cache the resolved state — fire-and-forget (cache failure does not fail the request)
    setRaw(
      cacheKey,
      JSON.stringify({ permissions: [...permissions], isSuperadmin }),
      RBAC_CACHE_TTL_MS,
    ).catch(() => {});

    return { permissions, isSuperadmin };
  } catch (err) {
    console.warn(`[rbac:service] DB error resolving RBAC for admin ${adminId}:`, err.message);
    // Return deny-safe empty state — requirePermission will return 403
    return { permissions: new Set(), isSuperadmin: false };
  }
}

/**
 * Check whether an admin has a specific permission.
 * Superadmin bypass: if isSuperadmin is true, all permission checks return true.
 *
 * @param {number} adminId       The admin's numeric id
 * @param {string} permissionKey e.g. 'shops:read', 'rbac:manage'
 * @returns {Promise<boolean>}
 */
export async function hasPermission(adminId, permissionKey) {
  const { permissions, isSuperadmin } = await getAdminRbac(adminId);
  if (isSuperadmin) return true;
  return permissions.has(permissionKey);
}

/**
 * Invalidate RBAC cache entries.
 *
 * Per-admin invalidation (adminId provided):
 *   Prefix: 'admin:rbac:{adminId}:'
 *   Colon-terminated to prevent numeric collision (B2).
 *   Only affects the specific admin's cache entry.
 *
 * Bulk invalidation (adminId = null or undefined):
 *   Prefix: 'admin:rbac:'
 *   Use when a role's permission set changes — affects all admins holding that role.
 *
 * Both cases are fire-and-forget at the call site (controller).
 *
 * @param {number|null} adminId  Specific admin id, or null/undefined for bulk invalidation
 */
export async function invalidateAdminRbacCache(adminId) {
  if (adminId != null) {
    await invalidateByLogicalPrefix(`admin:rbac:${adminId}:`);
  } else {
    await invalidateByLogicalPrefix("admin:rbac:");
  }
}
```

---

## File 4: `backend/modules/admin/core/rbac/rbac.middleware.js`

```javascript
/**
 * RBAC permission middleware factory.
 *
 * Usage:
 *   router.get("/roles", requireAuth, requireAdmin, requirePermission("rbac:read"), handler);
 *
 * requirePermission(permissionKey) returns an async Express middleware that:
 *   1. Checks ADMIN_RBAC_ENABLED feature flag
 *      - If disabled: calls next() (RBAC is not enforced — requireAdmin already ran)
 *      - On flag resolution error: falls back to adminPlatformConfig.rbacEnabled (ENV) (B3)
 *   2. Defensive role check (belt-and-suspenders after requireAdmin)
 *   3. Sets req.adminPermissionChecked BEFORE calling next() (C3 — audit-log-ready)
 *   4. Resolves permission via hasPermission (Redis → DB)
 *      - If denied: 403 { error: "Forbidden", required: permissionKey }
 *      - If allowed: next()
 *      - On infrastructure failure: getAdminRbac absorbs internally → hasPermission returns false → 403
 *      - On programming error (unexpected throw): 500
 *
 * Middleware ordering requirement (MANDATORY):
 *   requireAuth → requireAdmin → requirePermission
 *   Deviation from this order is a security bug.
 *
 * 403 response shape: { error: "Forbidden", required: permissionKey }
 *   (Differs from requireAdmin's shape { message: "..." } — documented divergence C6)
 */

import { isFeatureEnabled } from "../featureFlags/featureFlag.service.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";
import { hasPermission } from "./rbac.service.js";

/**
 * @param {string} permissionKey  e.g. 'rbac:read', 'shops:write'
 * @returns {import("express").RequestHandler}
 */
export function requirePermission(permissionKey) {
  return async function (req, res, next) {
    // Step 1: Check RBAC feature flag
    // B3: isFeatureEnabled error falls back to ENV value — never unconditional next()
    let rbacEnabled;
    try {
      rbacEnabled = await isFeatureEnabled("ADMIN_RBAC_ENABLED");
    } catch (err) {
      console.error("[rbac:middleware] isFeatureEnabled error:", err.message);
      rbacEnabled = adminPlatformConfig.rbacEnabled; // ENV fallback (B3)
    }

    // RBAC disabled: next() is safe because requireAdmin has already verified role
    if (!rbacEnabled) return next();

    // Step 2: Defensive role check (belt-and-suspenders after requireAdmin)
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!req.user.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Step 3: Set audit marker BEFORE next() (C3)
    // Downstream handlers (e.g. future audit log middleware) can read this field.
    req.adminPermissionChecked = permissionKey;

    // Step 4: Resolve permission
    try {
      const allowed = await hasPermission(req.user.id, permissionKey);
      if (!allowed) {
        return res.status(403).json({ error: "Forbidden", required: permissionKey });
      }
      return next();
    } catch (err) {
      // Programming error only — infrastructure failures are absorbed by getAdminRbac
      // and produce a false return from hasPermission (leading to 403 above).
      console.error("[rbac:middleware] hasPermission unexpected error:", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
```

---

## File 5: `backend/modules/admin/rbac/controllers/rbac.admin.controller.js`

```javascript
/**
 * RBAC management controller.
 *
 * All routes require: requireAuth → requireAdmin → requirePermission(key)
 *
 * Handlers:
 *   getRoles      GET  /api/admin/rbac/roles                     — rbac:read
 *   getPermissions GET /api/admin/rbac/permissions               — rbac:read
 *   getAdminRoles  GET /api/admin/rbac/admins/:adminId/roles     — rbac:read
 *   assignRole     POST /api/admin/rbac/admins/:adminId/roles    — rbac:manage
 *   revokeRole     DELETE /api/admin/rbac/admins/:adminId/roles/:roleId — rbac:manage
 *
 * C2: Privilege escalation guard on assignRole:
 *   Only a superadmin may assign the superadmin role.
 *
 * C5: Last-superadmin lockout guard on revokeRole:
 *   Cannot revoke the last remaining superadmin assignment.
 *
 * Cache invalidation ordering (final-review C2):
 *   invalidateAdminRbacCache is called AFTER a successful DB write, as fire-and-forget.
 *   Never before — stale cache is preferable to a race condition that restores old data.
 */

import { pool } from "../../../../config/db.js";
import { getAdminRbac, invalidateAdminRbacCache } from "../../core/rbac/rbac.service.js";

/**
 * GET /api/admin/rbac/roles
 * Returns all defined roles.
 */
export async function getRoles(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, role_name, description, is_superadmin, created_at FROM admin_roles ORDER BY id ASC",
    );
    return res.json(rows);
  } catch (err) {
    console.error("[rbac:controller] getRoles error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/rbac/permissions
 * Returns all registered permissions.
 */
export async function getPermissions(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, permission_key, description, created_at FROM admin_permissions ORDER BY permission_key ASC",
    );
    return res.json(rows);
  } catch (err) {
    console.error("[rbac:controller] getPermissions error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/rbac/admins/:adminId/roles
 * Returns all roles assigned to the specified admin.
 */
export async function getAdminRoles(req, res) {
  const adminId = parseInt(req.params.adminId, 10);
  if (!adminId || isNaN(adminId)) {
    return res.status(400).json({ error: "Invalid adminId" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.role_name, r.description, r.is_superadmin,
              aur.granted_by, aur.granted_at
       FROM admin_user_roles aur
       JOIN admin_roles r ON r.id = aur.role_id
       WHERE aur.admin_id = ?
       ORDER BY r.id ASC`,
      [adminId],
    );
    return res.json(rows);
  } catch (err) {
    console.error("[rbac:controller] getAdminRoles error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/rbac/admins/:adminId/roles
 * Body: { roleId: number }
 *
 * Assigns a role to an admin.
 * C2: If the target role has is_superadmin=1, the requester must also be a superadmin.
 * Invalidates the target admin's RBAC cache AFTER the successful INSERT.
 */
export async function assignRole(req, res) {
  const adminId = parseInt(req.params.adminId, 10);
  const roleId  = parseInt(req.body?.roleId,   10);

  if (!adminId || isNaN(adminId)) {
    return res.status(400).json({ error: "Invalid adminId" });
  }
  if (!roleId || isNaN(roleId)) {
    return res.status(400).json({ error: "roleId is required and must be a number" });
  }

  try {
    // Look up the target role to verify it exists and check is_superadmin
    const [roleRows] = await pool.query(
      "SELECT id, role_name, is_superadmin FROM admin_roles WHERE id = ?",
      [roleId],
    );
    if (roleRows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    const targetRole = roleRows[0];

    // C2: Privilege escalation guard
    // Only a superadmin may assign the superadmin role.
    if (targetRole.is_superadmin) {
      const requesterRbac = await getAdminRbac(req.user.id);
      if (!requesterRbac.isSuperadmin) {
        return res.status(403).json({
          error: "Only superadmins may assign the superadmin role",
        });
      }
    }

    // DB write: INSERT IGNORE prevents duplicate-assignment errors
    // C1 file-review: capture result to distinguish new vs idempotent assignment
    const [insertResult] = await pool.query(
      "INSERT IGNORE INTO admin_user_roles (admin_id, role_id, granted_by) VALUES (?, ?, ?)",
      [adminId, roleId, req.user.id],
    );

    // Cache invalidation: only on actual insert (affectedRows=0 means already assigned — no-op)
    // C1: avoids unnecessary invalidation when assignment already existed
    // Ordering: after DB write, fire-and-forget (cache miss on next request is safe)
    if (insertResult.affectedRows > 0) {
      invalidateAdminRbacCache(adminId).catch(() => {});
    }

    // 201 Created for new assignment, 200 OK for idempotent re-assignment
    const statusCode = insertResult.affectedRows > 0 ? 201 : 200;
    return res.status(statusCode).json({ ok: true, adminId, roleId });
  } catch (err) {
    console.error("[rbac:controller] assignRole error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /api/admin/rbac/admins/:adminId/roles/:roleId
 *
 * Revokes a role from an admin.
 * C5: If revoking a superadmin role assignment, verify at least one other
 *     superadmin assignment will remain. Prevents total superadmin lockout.
 * Invalidates the target admin's RBAC cache AFTER the successful DELETE.
 */
export async function revokeRole(req, res) {
  const adminId = parseInt(req.params.adminId, 10);
  const roleId  = parseInt(req.params.roleId,  10);

  if (!adminId || isNaN(adminId)) {
    return res.status(400).json({ error: "Invalid adminId" });
  }
  if (!roleId || isNaN(roleId)) {
    return res.status(400).json({ error: "Invalid roleId" });
  }

  try {
    // Look up the role to check is_superadmin
    const [roleRows] = await pool.query(
      "SELECT id, is_superadmin FROM admin_roles WHERE id = ?",
      [roleId],
    );
    if (roleRows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    const targetRole = roleRows[0];

    // C5: Last-superadmin lockout guard
    // Count superadmin assignments that would remain after this revocation.
    if (targetRole.is_superadmin) {
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS remaining
         FROM admin_user_roles aur
         JOIN admin_roles r ON r.id = aur.role_id
         WHERE r.is_superadmin = 1
           AND NOT (aur.admin_id = ? AND aur.role_id = ?)`,
        [adminId, roleId],
      );
      const remaining = Number(countRows[0].remaining);
      if (remaining === 0) {
        return res.status(403).json({
          error: "Cannot revoke last superadmin assignment",
        });
      }
    }

    // DB write
    const [result] = await pool.query(
      "DELETE FROM admin_user_roles WHERE admin_id = ? AND role_id = ?",
      [adminId, roleId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // C2 final-review: invalidate AFTER successful DB write (fire-and-forget)
    invalidateAdminRbacCache(adminId).catch(() => {});

    return res.json({ ok: true, adminId, roleId });
  } catch (err) {
    console.error("[rbac:controller] revokeRole error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
```

---

## File 6: `backend/modules/admin/rbac/routes/rbac.admin.routes.js`

```javascript
/**
 * RBAC management routes.
 *
 * All routes require: requireAuth → requireAdmin → requirePermission(key)
 *
 * Startup gate:
 *   If ADMIN_RBAC_ENABLED=false in ENV at process start, a catch-all handler is
 *   appended AFTER all named routes. It returns 404 for any request reaching it.
 *   Named routes are registered unconditionally — the per-request requirePermission
 *   check provides the secondary gate when RBAC is enabled at runtime.
 *
 * Express 5 / path-to-regexp@8 compatibility:
 *   router.use((req, res) => ...)  ← CORRECT
 *   router.use("*", ...)           ← WRONG (startup crash in Express 5)
 *
 * export default router is REQUIRED — admin/index.js barrel uses:
 *   export { default as rbacRouter } from "./rbac/routes/rbac.admin.routes.js"
 */

import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import { requirePermission } from "../../core/rbac/rbac.middleware.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";
import {
  getRoles,
  getPermissions,
  getAdminRoles,
  assignRole,
  revokeRole,
} from "../controllers/rbac.admin.controller.js";

const router = express.Router();

// ── Startup gate (MUST be registered BEFORE named routes) ───────────────────
// B1 fix: Express matches routes in registration order. router.use() (catch-all)
// only fires for requests not matched by earlier named routes. To guarantee that
// ALL requests to this router return 404 when RBAC is disabled, the catch-all
// must be registered FIRST — before any router.get/post/delete call.
//
// When ADMIN_RBAC_ENABLED=false in ENV at process start:
//   → This block executes → catch-all registered first
//   → ALL requests to /api/admin/rbac/* return 404 immediately
//   → No named route below is ever consulted (including requireAuth/requireAdmin)
//
// When ADMIN_RBAC_ENABLED=true in ENV at process start:
//   → This block does NOT execute → no catch-all registered
//   → Named routes below match normally
//   → requirePermission provides the per-request runtime gate
//
// Express 5 / path-to-regexp@8 safe: router.use(handler) with no path argument.
if (!adminPlatformConfig.rbacEnabled) {
  router.use((req, res) => {
    return res.status(404).json({ error: "not found" });
  });
}

// ── Read routes (rbac:read) ──────────────────────────────────────────────────
// Reachable only when adminPlatformConfig.rbacEnabled = true at startup.
// requirePermission provides a secondary per-request runtime gate (e.g. for
// DB-driven toggling while process is running).

router.get(
  "/roles",
  requireAuth, requireAdmin, requirePermission("rbac:read"),
  getRoles,
);

router.get(
  "/permissions",
  requireAuth, requireAdmin, requirePermission("rbac:read"),
  getPermissions,
);

router.get(
  "/admins/:adminId/roles",
  requireAuth, requireAdmin, requirePermission("rbac:read"),
  getAdminRoles,
);

// ── Write routes (rbac:manage) ───────────────────────────────────────────────

router.post(
  "/admins/:adminId/roles",
  requireAuth, requireAdmin, requirePermission("rbac:manage"),
  assignRole,
);

router.delete(
  "/admins/:adminId/roles/:roleId",
  requireAuth, requireAdmin, requirePermission("rbac:manage"),
  revokeRole,
);

export default router;
```

---

## File 7: `backend/modules/admin/index.js` (FULL MODIFIED CONTENT)

The complete file after Slice 3 additive modifications. All Slice 2 exports are preserved exactly.

```javascript
/**
 * Admin platform module barrel.
 *
 * Re-exports platformRouter using `{ default as platformRouter }` — requires
 * platform.admin.routes.js to use `export default router` (B2 constraint).
 * Re-exports rbacRouter using `{ default as rbacRouter }` — requires
 * rbac.admin.routes.js to use `export default router` (same constraint).
 *
 * server.js consumes:
 *   import { platformRouter, rbacRouter } from "./modules/admin/index.js"
 */

// ── Slice 2: Platform routes and feature flag services ──────────────────────
export { default as platformRouter } from "./platform/routes/platform.admin.routes.js";
export {
  isFeatureEnabled,
  getAllFlagStates,
  invalidateFlagCache,
} from "./core/featureFlags/featureFlag.service.js";
export {
  adminPlatformConfig,
  FLAG_KEY_MAP,
  ALL_FLAG_KEYS,
  FLAG_CACHE_TTL_MS,
} from "./config/adminPlatform.config.js";

// ── Slice 3: RBAC routes and services ───────────────────────────────────────
export { default as rbacRouter } from "./rbac/routes/rbac.admin.routes.js";
export {
  getAdminRbac,
  hasPermission,
  invalidateAdminRbacCache,
  RBAC_CACHE_TTL_MS,
} from "./core/rbac/rbac.service.js";
export { requirePermission } from "./core/rbac/rbac.middleware.js";
```

---

## File 8: `backend/server.js` — Additive Changes Only

### Change 1: Extend import on line 54

**Current line 54:**
```javascript
import { platformRouter } from "./modules/admin/index.js";
```

**Replace with:**
```javascript
import { platformRouter, rbacRouter } from "./modules/admin/index.js";
```

### Change 2: Add `app.use` mount after line 213

**Current line 213:**
```javascript
app.use("/api/admin/platform", platformRouter);
```

**After that line, add:**
```javascript
app.use("/api/admin/rbac", rbacRouter);
```

**Full resulting block (lines 213–214):**
```javascript
app.use("/api/admin/platform", platformRouter);
app.use("/api/admin/rbac", rbacRouter);
```

No other lines in `server.js` are modified. No existing mounts are removed or reordered.

---

## File 9: `backend/package.json` — Additive Script Entries

Add two entries after line 48 (`"migrate:admin:ff:dry": ...`):

```json
"migrate:admin:rbac":     "node scripts/run-admin-migration.js --file 053_admin_rbac.sql",
"migrate:admin:rbac:dry": "node scripts/run-admin-migration.js --file 053_admin_rbac.sql --dry-run",
```

**Resulting scripts block (relevant lines):**
```json
"migrate:admin:ff":       "node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql",
"migrate:admin:ff:dry":   "node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql --dry-run",
"migrate:admin:rbac":     "node scripts/run-admin-migration.js --file 053_admin_rbac.sql",
"migrate:admin:rbac:dry": "node scripts/run-admin-migration.js --file 053_admin_rbac.sql --dry-run",
```

---

## Runtime Verification Commands

All commands run from **project root** `/var/www/otofine`. (C3 final-review: relative paths require project-root CWD.)

### Syntax checks (run before PM2 restart)

```bash
# New files
node --check backend/modules/admin/core/rbac/rbac.service.js
node --check backend/modules/admin/core/rbac/rbac.middleware.js
node --check backend/modules/admin/rbac/controllers/rbac.admin.controller.js
node --check backend/modules/admin/rbac/routes/rbac.admin.routes.js

# Modified files
node --check backend/modules/admin/index.js
node --check backend/server.js
```

### Barrel import verification (run before PM2 restart)

```bash
# Run from project root /var/www/otofine
node -e "
import('./backend/modules/admin/index.js').then(m => {
  const keys = Object.keys(m);
  const required = [
    'platformRouter', 'isFeatureEnabled', 'getAllFlagStates', 'invalidateFlagCache',
    'adminPlatformConfig', 'FLAG_KEY_MAP', 'ALL_FLAG_KEYS', 'FLAG_CACHE_TTL_MS',
    'rbacRouter', 'getAdminRbac', 'hasPermission', 'invalidateAdminRbacCache',
    'RBAC_CACHE_TTL_MS', 'requirePermission'
  ];
  const missing = required.filter(k => !keys.includes(k));
  if (missing.length) {
    console.error('MISSING exports:', missing);
    process.exit(1);
  }
  console.log('OK: all required exports present');
}).catch(err => { console.error('IMPORT FAILED:', err.message); process.exit(1); });
"
```

### Post-migration validation queries

```sql
-- 1. Confirm all 5 admin tables exist (4 new + 1 from Slice 2)
SHOW TABLES LIKE 'admin_%';
-- Expected: admin_feature_flags, admin_permissions, admin_role_permissions,
--           admin_roles, admin_user_roles

-- 2. Confirm seed row counts
SELECT COUNT(*) AS role_count FROM admin_roles;              -- expect 4
SELECT COUNT(*) AS perm_count FROM admin_permissions;        -- expect 20
SELECT COUNT(*) AS rp_count   FROM admin_role_permissions;   -- expect 14
SELECT COUNT(*) AS aur_count  FROM admin_user_roles;         -- expect 0

-- 3. Confirm migration runner tracking
SELECT filename, applied_at, checksum
FROM schema_migrations
WHERE filename = '053_admin_rbac.sql';
-- Expected: 1 row with a sha256 checksum

-- 4. Confirm FK structure (no FK from admin_user_roles to admin table)
SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('admin_role_permissions', 'admin_user_roles');
-- Expected: fk_arp_role (→ admin_roles), fk_arp_permission (→ admin_permissions),
--           fk_aur_role (→ admin_roles)
-- Expected: NO FK from admin_user_roles to admin table

-- 5. Confirm superadmin role has is_superadmin=1 and zero permission rows
SELECT r.role_name, r.is_superadmin, COUNT(arp.permission_id) AS perm_count
FROM admin_roles r
LEFT JOIN admin_role_permissions arp ON arp.role_id = r.id
GROUP BY r.id;
-- Expected: superadmin → is_superadmin=1, perm_count=0
--           moderator  → is_superadmin=0, perm_count=5
--           analyst    → is_superadmin=0, perm_count=4
--           operator   → is_superadmin=0, perm_count=5
```

### Smoke tests (after PM2 restart, RBAC still disabled)

```bash
export ADMIN_TOKEN="<valid admin JWT>"

# 1. Existing admin routes unaffected
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/shops \
  | jq 'if type=="array" then "PASS" else "FAIL" end'
# Expected: "PASS"

# 2. Slice 2 feature flags unaffected
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/platform/features \
  | jq '{rbacEnabled, platformEnabled}'
# Expected: { "rbacEnabled": false, "platformEnabled": false }

# 3. New RBAC routes hidden (startup gate returns 404)
# C2 dependency (file-review): this 404 is correct ONLY because the startup gate
# is registered BEFORE named routes (B1 fix). With the gate first, ALL requests
# to /api/admin/rbac/* return 404 before requireAuth even runs — including
# requests with a valid admin JWT. Without the B1 fix this would return 200.
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/rbac/roles
# Expected: 404

# 4. Storefront regression check
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/
# Expected: 200
```

### Smoke tests (after RBAC activation with superadmin assigned)

```bash
# 5. RBAC routes accessible with superadmin JWT
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/rbac/roles \
  | jq 'if type=="array" then "PASS (array of roles)" else "FAIL" end'
# Expected: "PASS (array of roles)"

# 6. rbacEnabled is now true
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/platform/features \
  | jq .rbacEnabled
# Expected: true

# 7. No token → 401 (requireAuth fires before requirePermission)
curl -s -o /dev/null -w "%{http_code}" \
  https://api.otofine.com/api/admin/rbac/roles
# Expected: 401

# 8. Existing routes still work after RBAC activation
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/shops \
  | jq 'if type=="array" then "PASS" else "FAIL" end'
# Expected: "PASS"
```

---

## Superadmin Bootstrap (Run After Deployment, Before Activation)

```sql
-- Step 1: Identify the production admin to bootstrap
SELECT id, email FROM admin LIMIT 10;
-- Note: <ADMIN_ID>

-- Step 2: Get the superadmin role id
SELECT id, role_name, is_superadmin FROM admin_roles WHERE is_superadmin = 1;
-- Note: <SUPERADMIN_ROLE_ID>

-- Step 3: Assign the superadmin role
INSERT INTO admin_user_roles (admin_id, role_id, granted_by)
VALUES (<ADMIN_ID>, <SUPERADMIN_ROLE_ID>, NULL);

-- Step 4: Verify assignment
SELECT aur.admin_id, r.role_name, r.is_superadmin, aur.granted_at
FROM admin_user_roles aur
JOIN admin_roles r ON r.id = aur.role_id
WHERE aur.admin_id = <ADMIN_ID>;
-- Expected: 1 row, role_name='superadmin', is_superadmin=1
```

### Activate RBAC (After Bootstrap Verified)

```sql
-- Option A: DB toggle (takes effect within 60s via feature flag TTL)
UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_RBAC_ENABLED';

-- Option B: ENV + restart (immediate)
-- Set ADMIN_RBAC_ENABLED=true in backend/.env → pm2 restart api --update-env
```

---

## Rollback Commands

### Code rollback (if PM2 restart fails or existing routes regress)

```bash
# From project root
git revert <slice3-commit-sha> --no-edit
grep "rbacRouter" backend/server.js     # Expected: no output
node --check backend/modules/admin/index.js
node --check backend/server.js
pm2 restart api --update-env
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/shops
# Expected: 200
```

### Migration rollback (only if RBAC tables cause issues)

```bash
# Run from project root
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME \
  < backend/migrations/053_admin_rbac.rollback.sql

mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "SHOW TABLES LIKE 'admin_%';"
# Expected: only admin_feature_flags
```

### RBAC deactivation (without full rollback)

```sql
-- DB toggle (takes effect within 60s via flag TTL)
UPDATE admin_feature_flags SET is_enabled = 0 WHERE flag_key = 'ADMIN_RBAC_ENABLED';
-- OR: set ADMIN_RBAC_ENABLED=false in .env → pm2 restart api --update-env
```

---

## Safety Constraints Summary

| Constraint | File(s) Affected | What to Enforce |
|---|---|---|
| Never modify `requireAdmin` | `auth.middleware.js` | DO NOT TOUCH |
| Never modify JWT payload | `token.service.js` | DO NOT TOUCH |
| Never add `requirePermission` to existing routes | `admin.routes.js` | DO NOT TOUCH |
| `router.use(handler)` NOT `router.use("*", handler)` | `rbac.admin.routes.js` | Express 5 crash |
| Cache key format: `admin:rbac:{adminId}:perms` | `rbac.service.js` | Colon after adminId (B2) |
| `RBAC_CACHE_TTL_MS = 300_000` | `rbac.service.js` | Not literal 60 or 300 |
| `req.adminPermissionChecked` set BEFORE `next()` | `rbac.middleware.js` | C3 audit timing |
| B3 fallback: `adminPlatformConfig.rbacEnabled` on flag error | `rbac.middleware.js` | Not unconditional `next()` |
| C1 iteration: check `is_superadmin` on ALL rows | `rbac.service.js` | Including NULL-key rows |
| C2 escalation guard: before INSERT | `rbac.admin.controller.js` | Checked before DB write |
| C2 cache invalidation: AFTER INSERT | `rbac.admin.controller.js` | Fire-and-forget post-write |
| C5 lockout guard: before DELETE | `rbac.admin.controller.js` | Count remaining superadmins |
| `export default router` | `rbac.admin.routes.js` | Required for barrel import |
| Slice 2 exports unchanged in barrel | `admin/index.js` | All 8 existing exports preserved |
| No other `server.js` lines touched | `server.js` | Only line 54 and line 213+1 |
| Activate RBAC only after superadmin bootstrap | deployment | Sequence enforced |

---

*Document version: 1.1 — Specification only. No files have been written.*  
*Patches applied: B1 (startup gate before named routes), C1 (assignRole idempotent response), C2 (smoke test dependency annotation).*  
*Next step: Write real implementation files using this document as the source of truth.*
