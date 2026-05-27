# Otofine Admin Platform — Phase 1A Slice 3: RBAC Foundation
## Implementation Plan

**Status:** PLANNING ONLY — no implementation  
**Date:** 2026-05-27  
**Source of truth:** `phase-1a-slice3-rbac-design.md` v1.1 (all blockers + corrections applied)  
**Deployed baseline:** Slice 1 (schema_migrations + migration runner), Slice 2 (admin_feature_flags + feature flag service + adminPlatformConfig + platformRouter)

---

## Table of Contents

1. [File Inventory](#1-file-inventory)
2. [Migration Plan](#2-migration-plan)
3. [RBAC Runtime Flow](#3-rbac-runtime-flow)
4. [Redis Cache Strategy](#4-redis-cache-strategy)
5. [Permission Resolution Flow](#5-permission-resolution-flow)
6. [Middleware Chain Design](#6-middleware-chain-design)
7. [Route Registration Strategy](#7-route-registration-strategy)
8. [Seed Strategy](#8-seed-strategy)
9. [Superadmin Bootstrap Flow](#9-superadmin-bootstrap-flow)
10. [Deployment Order](#10-deployment-order)
11. [PM2 Restart Safety](#11-pm2-restart-safety)
12. [Hidden Deployment Sequence](#12-hidden-deployment-sequence)
13. [Production Smoke Tests](#13-production-smoke-tests)
14. [Runtime Verification Plan](#14-runtime-verification-plan)
15. [Rollback Strategy](#15-rollback-strategy)
16. [Recovery Procedures](#16-recovery-procedures)
17. [Dangerous File List](#17-dangerous-file-list)
18. [Forbidden Modification List](#18-forbidden-modification-list)
19. [Regression Test Checklist](#19-regression-test-checklist)
20. [Implementation Review Checklist](#20-implementation-review-checklist)

---

## 1. File Inventory

### 1.1 New Files (8 files)

| # | Path | Type | Description |
|---|---|---|---|
| 1 | `backend/migrations/053_admin_rbac.sql` | SQL | 4 RBAC tables + 4 roles + 20 permissions + role_permission seed |
| 2 | `backend/migrations/053_admin_rbac.rollback.sql` | SQL | DROP in FK-safe order |
| 3 | `backend/modules/admin/core/rbac/rbac.service.js` | ESM | `getAdminRbac`, `hasPermission`, `invalidateAdminRbacCache`, `RBAC_CACHE_TTL_MS` |
| 4 | `backend/modules/admin/core/rbac/rbac.middleware.js` | ESM | `requirePermission(key)` factory |
| 5 | `backend/modules/admin/rbac/controllers/rbac.admin.controller.js` | ESM | `getRoles`, `getPermissions`, `getAdminRoles`, `assignRole`, `revokeRole` |
| 6 | `backend/modules/admin/rbac/routes/rbac.admin.routes.js` | ESM | 5 routes + feature gate + `export default router` |
| 7 | `frontend/contexts/` | dir | Already created in Slice 2 |
| 8 | `frontend/hooks/` | dir | Already created in Slice 2 |

No frontend files are added in Slice 3. RBAC has no frontend component in this slice.

### 1.2 Modified Files (3 files)

| # | Path | Change | Safety |
|---|---|---|---|
| 1 | `backend/modules/admin/index.js` | Add `rbacRouter`, `rbac.service` exports | Additive barrel export only |
| 2 | `backend/server.js` | Add 1 import line + 1 `app.use` mount | Additive only |
| 3 | `backend/package.json` | Add 2 npm scripts for migration | Additive only |

### 1.3 Explicitly Unchanged Files

```
backend/domains/auth/middlewares/auth.middleware.js    ← NEVER TOUCH
backend/domains/auth/services/token.service.js         ← NEVER TOUCH
backend/domains/auth/services/adminAuth.service.js     ← NEVER TOUCH
backend/routes/admin.routes.js                         ← NEVER TOUCH
backend/controllers/adminController.js                 ← NEVER TOUCH
backend/modules/admin/config/adminPlatform.config.js   ← NEVER TOUCH
backend/modules/admin/core/featureFlags/               ← NEVER TOUCH
backend/modules/admin/platform/                        ← NEVER TOUCH
backend/scripts/run-admin-migration.js                 ← NEVER TOUCH (053_admin_rbac.sql already in whitelist)
backend/.env                                           ← NEVER TOUCH (ADMIN_RBAC_ENABLED=false already set in Slice 2)
frontend/                                              ← NEVER TOUCH in Slice 3
```

### 1.4 Directory Structure After Slice 3

```
backend/modules/admin/
├── config/
│   └── adminPlatform.config.js         (Slice 2 — unchanged)
├── core/
│   ├── featureFlags/
│   │   └── featureFlag.service.js      (Slice 2 — unchanged)
│   └── rbac/
│       ├── rbac.service.js             (Slice 3 NEW)
│       └── rbac.middleware.js          (Slice 3 NEW)
├── platform/
│   ├── controllers/
│   │   └── platform.admin.controller.js (Slice 2 — unchanged)
│   └── routes/
│       └── platform.admin.routes.js    (Slice 2 — unchanged)
├── rbac/
│   ├── controllers/
│   │   └── rbac.admin.controller.js    (Slice 3 NEW)
│   └── routes/
│       └── rbac.admin.routes.js        (Slice 3 NEW)
└── index.js                            (Slice 2, additive modification in Slice 3)
```

---

## 2. Migration Plan

### 2.1 Migration File: `053_admin_rbac.sql`

**Runner whitelist status:** `"053_admin_rbac.sql"` is already present in the `ADMIN_MIGRATION_FILES` array in `run-admin-migration.js` (line 52). No runner modification needed.

**Execution sequence within the file:**

```
1. CREATE TABLE IF NOT EXISTS admin_roles
2. CREATE TABLE IF NOT EXISTS admin_permissions
3. CREATE TABLE IF NOT EXISTS admin_role_permissions  ← FKs: admin_roles, admin_permissions
4. CREATE TABLE IF NOT EXISTS admin_user_roles        ← FK: admin_roles only
5. INSERT IGNORE INTO admin_roles (4 seed rows)
6. INSERT IGNORE INTO admin_permissions (20 seed rows)
7. INSERT IGNORE INTO admin_role_permissions (role-permission assignments)
```

**Table DDL summary:**

```sql
-- admin_roles: id, role_name (UNIQUE), description, is_superadmin (DEFAULT 0),
--              created_at DATETIME(3), updated_at DATETIME(3)

-- admin_permissions: id, permission_key (UNIQUE, format: resource:action),
--                    description, created_at DATETIME(3)
--                    (no updated_at — append-only)

-- admin_role_permissions: (role_id, permission_id) composite PK
--   FK role_id → admin_roles.id ON DELETE CASCADE
--   FK permission_id → admin_permissions.id ON DELETE CASCADE

-- admin_user_roles: (admin_id, role_id) composite PK
--   admin_id: INT UNSIGNED — logical reference to admin.id, NO physical FK (C4)
--   KEY idx_aur_admin_id (admin_id)
--   FK role_id → admin_roles.id ON DELETE CASCADE
--   granted_by INT UNSIGNED NULL (who assigned; NULL = seeded/manual)
```

**Idempotency:** `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` — safe to run twice.

### 2.2 Seed Roles (INSERT IGNORE)

| role_name | is_superadmin | Description |
|---|---|---|
| `superadmin` | 1 | Bypass all permission checks |
| `moderator` | 0 | Shop approval + moderation + RFQ read |
| `analyst` | 0 | Read-only analytics + billing + shops |
| `operator` | 0 | Shop management + RFQ + part knowledge |

### 2.3 Seed Permissions (20 rows, INSERT IGNORE)

```
shops:read, shops:write, shops:delete
platform:read
rfq:admin:read, rfq:admin:write
part_knowledge:read, part_knowledge:write
moderation:read, moderation:write
billing:read, billing:write
analytics:read
risk:read, risk:write
crm:read, crm:write
rbac:read, rbac:manage
audit_log:read
```

### 2.4 Role-Permission Seed Assignments

| Role | Permissions |
|---|---|
| `superadmin` | NO rows in admin_role_permissions — bypass is `is_superadmin=1` flag |
| `moderator` | shops:read, shops:write, moderation:read, moderation:write, rfq:admin:read |
| `analyst` | shops:read, analytics:read, rfq:admin:read, billing:read |
| `operator` | shops:read, shops:write, rfq:admin:read, rfq:admin:write, part_knowledge:read |

### 2.5 Rollback File: `053_admin_rbac.rollback.sql`

```sql
-- Drop in FK-safe order (child tables before parent)
DROP TABLE IF EXISTS admin_user_roles;
DROP TABLE IF EXISTS admin_role_permissions;
DROP TABLE IF EXISTS admin_permissions;
DROP TABLE IF EXISTS admin_roles;
-- Remove tracking row separately:
DELETE FROM schema_migrations WHERE filename = '053_admin_rbac.sql';
```

### 2.6 NPM Scripts to Add to `package.json`

```json
"migrate:admin:rbac": "node scripts/run-admin-migration.js --file 053_admin_rbac.sql",
"migrate:admin:rbac:dry": "node scripts/run-admin-migration.js --file 053_admin_rbac.sql --dry-run"
```

### 2.7 Post-Migration Validation Queries

```sql
-- 1. Confirm all 4 tables exist
SHOW TABLES LIKE 'admin_%';
-- Expected: admin_feature_flags, admin_permissions, admin_role_permissions,
--           admin_roles, admin_user_roles

-- 2. Confirm seed row counts
SELECT COUNT(*) FROM admin_roles;              -- expect 4
SELECT COUNT(*) FROM admin_permissions;        -- expect 20
SELECT COUNT(*) FROM admin_role_permissions;   -- expect 14 (5 mod + 4 analyst + 5 operator)
SELECT COUNT(*) FROM admin_user_roles;         -- expect 0 (no initial assignments)

-- 3. Confirm runner tracking
SELECT filename, applied_at, checksum
FROM schema_migrations
WHERE filename = '053_admin_rbac.sql';

-- 4. Confirm FKs on new tables only (not on admin table)
SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('admin_role_permissions', 'admin_user_roles');
-- Expected: fk_arp_role, fk_arp_permission, fk_aur_role
-- Expected: NO FK from admin_user_roles to admin table

-- 5. Confirm superadmin role has is_superadmin=1 and zero permission rows
SELECT r.role_name, r.is_superadmin, COUNT(arp.permission_id) AS perm_count
FROM admin_roles r
LEFT JOIN admin_role_permissions arp ON arp.role_id = r.id
GROUP BY r.id;
-- Expected: superadmin → is_superadmin=1, perm_count=0
```

---

## 3. RBAC Runtime Flow

### 3.1 Full Request Flow (RBAC Enabled)

```
Client request: GET /api/admin/rbac/roles
  │
  ├── requireAuth
  │     JWT present? → verify with jwtSecret
  │     req.user = { id: 7, role: "admin", email: "..." }
  │
  ├── requireAdmin
  │     req.user.role === "admin"? → pass
  │     (UNCHANGED from current production behavior)
  │
  ├── requirePermission("rbac:read")
  │     Step 1: isFeatureEnabled("ADMIN_RBAC_ENABLED")
  │       → Redis hit: "1" → rbacEnabled = true
  │       → Redis miss: DB query → "1" → cache → rbacEnabled = true
  │       → Redis + DB fail: adminPlatformConfig.rbacEnabled → ENV value
  │     Step 2: req.user.role === "admin"? → pass (defensive check)
  │     Step 3: req.adminPermissionChecked = "rbac:read"
  │     Step 4: hasPermission(7, "rbac:read")
  │       → getAdminRbac(7)
  │         → Redis: GET "admin:rbac:7:perms"
  │           → HIT: parse JSON → { permissions: Set["rbac:read", ...], isSuperadmin: false }
  │           → MISS: DB query → cache → return result
  │       → isSuperadmin? false → check permissions.has("rbac:read")
  │       → true → next()
  │
  └── getRoles handler
        SELECT id, role_name, description, is_superadmin FROM admin_roles
        → res.json(rows)
```

### 3.2 Request Flow (RBAC Disabled — default state)

```
Client request: GET /api/admin/rbac/roles
  │
  ├── Express resolves /api/admin/rbac → rbacRouter
  │
  ├── rbacRouter startup gate:
  │     adminPlatformConfig.rbacEnabled === false (ENV)
  │     → router.use((req, res) => res.status(404)...) was registered at startup
  │     → returns 404 { error: "not found" }
  │     → request NEVER reaches requirePermission or any handler
  │
  └── (no DB queries, no Redis writes, no RBAC resolution)
```

### 3.3 Superadmin Bypass Flow

```
requirePermission("shops:delete")
  │
  ├── isFeatureEnabled("ADMIN_RBAC_ENABLED") → true
  ├── req.adminPermissionChecked = "shops:delete"
  ├── hasPermission(adminId, "shops:delete")
  │     → getAdminRbac(adminId)
  │       → Redis hit: { permissions: [], isSuperadmin: true }
  │     → isSuperadmin === true → return true (NO permission check needed)
  └── next() immediately
```

### 3.4 Fail-Safe Flow (DB + Redis Both Unavailable)

```
requirePermission("shops:read")
  │
  ├── isFeatureEnabled("ADMIN_RBAC_ENABLED")
  │     → Redis unavailable (featureFlag.service catches error)
  │     → DB unavailable (featureFlag.service catches error)
  │     → returns adminPlatformConfig.rbacEnabled (ENV value)
  │     → If ENV=true: continue to permission check
  │
  ├── hasPermission(adminId, "shops:read")
  │     → getAdminRbac(adminId)
  │       → Redis GET throws → log warning → fall back to DB
  │       → DB query throws → log warning
  │       → return { permissions: new Set(), isSuperadmin: false }
  │     → isSuperadmin: false → permissions.has("shops:read"): false
  │     → hasPermission returns false
  │
  └── requirePermission returns 500 (infrastructure error, not 403)
      (Both Redis AND DB unavailable is an infra error, not an authz decision)
```

---

## 4. Redis Cache Strategy

### 4.1 Key Format

```
admin:rbac:{adminId}:perms
```

Actual Redis key (with redisCache.service.js prefix applied):
```
{CACHE_KEY_PREFIX}dv{CACHE_DATA_VERSION}:admin:rbac:{adminId}:perms
```

Example (defaults): `otofine:v1:dv1:admin:rbac:7:perms`

### 4.2 Value Format

```json
{ "permissions": ["rbac:read", "shops:read"], "isSuperadmin": false }
```

Stored as JSON string via `setRaw`. Retrieved via `getRaw` + `JSON.parse`.

### 4.3 TTL

`RBAC_CACHE_TTL_MS = 300_000` ms (5 minutes).  
`setRaw` converts ms to seconds internally: `Math.max(1, Math.ceil(300_000 / 1000))` = 300 s.

### 4.4 Invalidation Matrix

| Trigger | Call | Prefix pattern |
|---|---|---|
| Role assigned to admin | `invalidateAdminRbacCache(adminId)` | `admin:rbac:{adminId}:` |
| Role revoked from admin | `invalidateAdminRbacCache(adminId)` | `admin:rbac:{adminId}:` |
| Permission added to role | `invalidateAdminRbacCache(null)` | `admin:rbac:` |
| Permission removed from role | `invalidateAdminRbacCache(null)` | `admin:rbac:` |
| `is_superadmin` toggled on role | `invalidateAdminRbacCache(null)` | `admin:rbac:` |

**Per-admin invalidation safety:** Prefix `admin:rbac:7:` only matches keys starting with `admin:rbac:7:`. Does NOT match `admin:rbac:70:perms` because `7` is followed by `:` in the prefix, not `0`.

### 4.5 CACHE_DATA_VERSION Interaction

If `CACHE_DATA_VERSION` bumps on deploy, all admin:rbac:* keys become inaccessible (different key prefix). On the first request after deploy, all permissions are re-resolved from DB and re-cached. This is the expected behavior — it is not a special case.

### 4.6 In-Memory LRU Fallback

`redisCache.service.js` maintains an in-memory LRU store as fallback. RBAC permission data stored in the LRU has the same 300 s TTL. At 100 admins × ~200 bytes per entry = 20 KB max LRU growth. Negligible.

---

## 5. Permission Resolution Flow

### 5.1 `getAdminRbac(adminId)` Internal Flow

```
getAdminRbac(7)
  │
  ├── 1. getRaw("admin:rbac:7:perms")
  │         │
  │         ├── HIT → JSON.parse → { permissions: [...], isSuperadmin: bool }
  │         │         → convert permissions array to Set<string>
  │         │         → return { permissions: Set, isSuperadmin }
  │         │
  │         └── MISS → continue to step 2
  │
  ├── 2. DB query:
  │         SELECT p.permission_key, MAX(r.is_superadmin) AS is_superadmin
  │         FROM admin_user_roles aur
  │         JOIN admin_roles r ON r.id = aur.role_id
  │         LEFT JOIN admin_role_permissions arp ON arp.role_id = r.id
  │         LEFT JOIN admin_permissions p ON p.id = arp.permission_id
  │         WHERE aur.admin_id = 7
  │         GROUP BY p.permission_key
  │
  ├── 3. Iterate ALL rows (including NULL permission_key rows — C1 constraint):
  │         let isSuperadmin = false;
  │         const permissions = new Set();
  │         for (row of rows) {
  │           if (row.is_superadmin) isSuperadmin = true;
  │           if (row.permission_key) permissions.add(row.permission_key);
  │         }
  │
  ├── 4. setRaw("admin:rbac:7:perms",
  │             JSON.stringify({ permissions: [...permissions], isSuperadmin }),
  │             RBAC_CACHE_TTL_MS).catch(() => {})   // fire-and-forget
  │
  └── 5. Return { permissions, isSuperadmin }
        (If DB error: log + return { permissions: new Set(), isSuperadmin: false })
        (If admin has no roles: zero rows → same empty result)
```

### 5.2 `hasPermission(adminId, permissionKey)` Flow

```
hasPermission(7, "shops:read")
  │
  ├── getAdminRbac(7) → { permissions: Set["shops:read", ...], isSuperadmin: false }
  ├── isSuperadmin === false → continue
  └── permissions.has("shops:read") → true/false
```

### 5.3 Permission Key Validation

No runtime validation of `permissionKey` format — implementation assumes the key passed to `requirePermission("shops:read")` is a valid registered permission. An unregistered key never appears in any admin's permissions Set, so `hasPermission` returns `false` (deny).

---

## 6. Middleware Chain Design

### 6.1 Standard Chain for All New Admin Routes

```javascript
router.get("/roles",
  requireAuth,           // from domains/auth — UNCHANGED
  requireAdmin,          // from domains/auth — UNCHANGED
  requirePermission("rbac:read"),  // NEW
  getRoles               // NEW handler
);
```

**Critical ordering:** `requireAuth` → `requireAdmin` → `requirePermission`. Any deviation is a security bug. `requirePermission` is self-defensive (checks `req.user.role !== "admin"`) but the double-guard is mandatory.

### 6.2 `requirePermission` Internal Implementation Contract

```javascript
export function requirePermission(permissionKey) {
  return async function (req, res, next) {
    // Step 1: Check RBAC feature flag (B3: ENV fallback on error)
    let rbacEnabled;
    try {
      rbacEnabled = await isFeatureEnabled("ADMIN_RBAC_ENABLED");
    } catch (err) {
      console.error("[rbac:middleware] isFeatureEnabled error:", err.message);
      rbacEnabled = adminPlatformConfig.rbacEnabled; // ENV, not unconditional next()
    }
    if (!rbacEnabled) return next();

    // Step 2: Defensive role check
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!req.user.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Step 3: Attach for audit (C3: BEFORE next())
    req.adminPermissionChecked = permissionKey;

    // Step 4: Resolve permission
    try {
      const allowed = await hasPermission(req.user.id, permissionKey);
      if (!allowed) {
        return res.status(403).json({ error: "Forbidden", required: permissionKey });
      }
      return next();
    } catch (err) {
      console.error("[rbac:middleware] hasPermission error:", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
```

### 6.3 Imports Required in `rbac.middleware.js`

```javascript
import { isFeatureEnabled } from "../../core/featureFlags/featureFlag.service.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";
import { hasPermission } from "./rbac.service.js";
```

All paths are relative to `backend/modules/admin/core/rbac/rbac.middleware.js`.

---

## 7. Route Registration Strategy

### 7.1 `rbac.admin.routes.js` Registration Order

Route registration order is mandatory (same pattern as `platform.admin.routes.js`):

```javascript
import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import { requirePermission } from "../../core/rbac/rbac.middleware.js";
import { ... } from "../controllers/rbac.admin.controller.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";

const router = express.Router();

// Step 1 — Read-only routes (ALWAYS registered first, unconditionally)
router.get("/roles",                      requireAuth, requireAdmin, requirePermission("rbac:read"),   getRoles);
router.get("/permissions",                requireAuth, requireAdmin, requirePermission("rbac:read"),   getPermissions);
router.get("/admins/:adminId/roles",      requireAuth, requireAdmin, requirePermission("rbac:read"),   getAdminRoles);

// Step 2 — Write routes (management operations, registered unconditionally)
router.post("/admins/:adminId/roles",           requireAuth, requireAdmin, requirePermission("rbac:manage"), assignRole);
router.delete("/admins/:adminId/roles/:roleId", requireAuth, requireAdmin, requirePermission("rbac:manage"), revokeRole);

// Step 3 — Platform gate catch-all (registered AFTER all named routes)
// When rbacEnabled=false, all above routes are reachable by requirePermission
// but the startup gate returns 404 before them via rbacEnabled check inside requirePermission.
// Actually: the startup gate is a cleaner approach — register it after named routes.
if (!adminPlatformConfig.rbacEnabled) {
  router.use((req, res) => res.status(404).json({ error: "not found" }));
}

export default router;
```

**Why named routes are registered before the catch-all gate:** `requirePermission` itself checks `isFeatureEnabled("ADMIN_RBAC_ENABLED")` at runtime. The startup catch-all `router.use(handler)` is the belt-and-suspenders protection when the ENV flag is false at process start. Both layers must be present.

### 7.2 `server.js` Additions

```javascript
// Import (add after line 54 — platformRouter import)
import { platformRouter, rbacRouter } from "./modules/admin/index.js";

// Mount (add after line 213 — platformRouter mount)
app.use("/api/admin/platform", platformRouter);
app.use("/api/admin/rbac", rbacRouter);
```

**Route collision verification:**

| Existing prefix | rbacRouter prefix | Collision? |
|---|---|---|
| `/api/admin` (admin.routes.js) | `/api/admin/rbac` | No — rbac sub-path |
| `/api/admin/part-knowledge` | `/api/admin/rbac` | No — different sub-path |
| `/api/admin/rfq` | `/api/admin/rbac` | No — different sub-path |
| `/api/admin/platform` | `/api/admin/rbac` | No — different sub-path |

### 7.3 `admin/index.js` Barrel Additions

```javascript
// Add to existing exports:
export { default as rbacRouter } from "./rbac/routes/rbac.admin.routes.js";
export {
  getAdminRbac,
  hasPermission,
  invalidateAdminRbacCache,
  RBAC_CACHE_TTL_MS,
} from "./core/rbac/rbac.service.js";
export { requirePermission } from "./core/rbac/rbac.middleware.js";
```

**B2 constraint preserved:** `rbacRouter` uses `export default router` — required by the barrel's `{ default as rbacRouter }` pattern (same as `platformRouter`).

---

## 8. Seed Strategy

### 8.1 All Seeds Use INSERT IGNORE

Every seed row in `053_admin_rbac.sql` uses `INSERT IGNORE`. This means:
- Running the migration twice is safe (second run silently skips existing rows)
- Partial failures leave the table in a valid state for re-run
- Production already has `admin_feature_flags` seeds applied with the same strategy

### 8.2 role_permission Assignments — Exact Counts

```sql
-- moderator (5 permissions):
-- shops:read, shops:write, moderation:read, moderation:write, rfq:admin:read

-- analyst (4 permissions):
-- shops:read, analytics:read, rfq:admin:read, billing:read

-- operator (5 permissions):
-- shops:read, shops:write, rfq:admin:read, rfq:admin:write, part_knowledge:read

-- Total: 14 rows in admin_role_permissions
-- (Note: some permissions appear in multiple roles — the seed uses subqueries to resolve IDs)
```

### 8.3 Seed INSERT Pattern (ID-safe via subquery)

```sql
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'moderator' AND p.permission_key = 'shops:read';
```

This pattern avoids hardcoding IDs (which depend on AUTO_INCREMENT state), making the migration safe regardless of table state.

### 8.4 No admin_user_roles Seeds

`admin_user_roles` starts empty. No production admin is assigned a role during migration. Role assignment is a separate activation step (§9) performed after deployment and BEFORE enabling RBAC.

---

## 9. Superadmin Bootstrap Flow

### 9.1 Pre-Activation Requirement

Before enabling `ADMIN_RBAC_ENABLED`, at least one admin must be assigned the superadmin role. This step is performed manually on production after Slice 3 is deployed and verified.

### 9.2 Step-by-Step Bootstrap

```sql
-- Step 1: Identify the production admin's id
SELECT id, email FROM admin LIMIT 10;
-- Note the id of the admin who should be superadmin (let's call it <ADMIN_ID>)

-- Step 2: Get the superadmin role id
SELECT id FROM admin_roles WHERE role_name = 'superadmin' LIMIT 1;
-- Note: <SUPERADMIN_ROLE_ID>

-- Step 3: Assign the role
INSERT INTO admin_user_roles (admin_id, role_id, granted_by)
VALUES (<ADMIN_ID>, <SUPERADMIN_ROLE_ID>, NULL);

-- Step 4: Verify
SELECT aur.admin_id, r.role_name, r.is_superadmin
FROM admin_user_roles aur
JOIN admin_roles r ON r.id = aur.role_id
WHERE aur.admin_id = <ADMIN_ID>;
-- Expected: 1 row with role_name='superadmin', is_superadmin=1

-- Step 5: Verify no stale RBAC cache for this admin
-- (There will be no cache keys before first login after activation — safe to skip)
```

### 9.3 Activation Order

```
1. Assign superadmin role (§9.2)
2. Verify assignment (§9.2 Step 4)
3. THEN enable RBAC:
   Option A (DB): UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_RBAC_ENABLED';
   Option B (ENV): Set ADMIN_RBAC_ENABLED=true in .env → pm2 restart api
4. Verify activation: GET /api/admin/platform/features → rbacEnabled: true
5. Verify RBAC route accessible: GET /api/admin/rbac/roles (with admin JWT) → 200
6. Verify non-superadmin access denied: GET /api/admin/rbac/roles (no JWT) → 401
```

### 9.4 RBAC Activation Does NOT Affect Existing Routes

After enabling `ADMIN_RBAC_ENABLED`:
- `GET /api/admin/shops` — still protected by `requireAdmin` only — **unchanged**
- `GET /api/admin/rfq/*` — still protected by `requireAdmin` only — **unchanged**
- `GET /api/admin/part-knowledge/*` — still protected by `requireAdmin` only — **unchanged**
- All existing admin routes continue to work for any admin with a valid admin JWT

---

## 10. Deployment Order

```
Phase A: Pre-Deploy Verification
  1. Verify Slice 1 + Slice 2 are deployed and healthy:
       SELECT filename FROM schema_migrations ORDER BY applied_at;
       -- Must include: 051_schema_migrations.sql, 055_admin_feature_flags.sql
  2. Verify ADMIN_RBAC_ENABLED=false currently:
       curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
         https://api.otofine.com/api/admin/platform/features | jq .rbacEnabled
       -- Expected: false
  3. Verify no existing RBAC Redis keys:
       redis-cli KEYS "otofine:v1:dv1:admin:rbac:*"
       -- Expected: (empty)

Phase B: Migration
  4. Dry-run:
       npm run migrate:admin:rbac:dry
       -- Expected: WOULD APPLY: 053_admin_rbac.sql (sha256: ...)
  5. Apply migration:
       npm run migrate:admin:rbac
       -- Expected: OK: 053_admin_rbac.sql
  6. Validate with queries from §2.7

Phase C: Code Deployment (no restart yet)
  7. Deploy new files to server
  8. Syntax check all new files (see §11)
  9. Verify barrel imports: node -e "import('./modules/admin/index.js').then(m => console.log(Object.keys(m)))"
       -- Expected: includes rbacRouter, requirePermission, getAdminRbac, etc.

Phase D: PM2 Restart
  10. pm2 restart api --update-env
  11. Verify process started: pm2 list
       -- Expected: api online, 0 restarts
  12. Verify API is up: curl -s https://api.otofine.com/api/admin/platform/features
       -- Expected: 200 { rbacEnabled: false }

Phase E: Smoke Tests (§13)
  13. RBAC routes hidden: GET /api/admin/rbac/roles → 404
  14. Existing routes unaffected: GET /api/admin/shops → 200 (with valid admin JWT)
  15. Storefront regression: GET https://[shop].otofine.com → 200
  16. Feature flags unchanged: GET /api/admin/platform/features → 200

Phase F: Superadmin Bootstrap (SEPARATE STEP — not during deploy)
  17. Execute §9.2 bootstrap flow
  18. Execute §9.3 activation flow
  19. Execute §13 smoke tests again with RBAC enabled
```

---

## 11. PM2 Restart Safety

### 11.1 Pre-Restart Syntax Checks

```bash
# All new files
node --check backend/modules/admin/core/rbac/rbac.service.js
node --check backend/modules/admin/core/rbac/rbac.middleware.js
node --check backend/modules/admin/rbac/controllers/rbac.admin.controller.js
node --check backend/modules/admin/rbac/routes/rbac.admin.routes.js

# Modified files
node --check backend/modules/admin/index.js
node --check backend/server.js
```

### 11.2 Barrel Import Verification

```bash
# ESM dynamic import check — confirms all barrel exports resolve without error
node -e "
import('./backend/modules/admin/index.js').then(m => {
  const keys = Object.keys(m);
  console.log('Exports:', keys.join(', '));
  const required = ['platformRouter', 'rbacRouter', 'isFeatureEnabled',
                    'getAllFlagStates', 'invalidateFlagCache', 'getAdminRbac',
                    'hasPermission', 'invalidateAdminRbacCache', 'requirePermission',
                    'adminPlatformConfig', 'FLAG_KEY_MAP', 'ALL_FLAG_KEYS',
                    'FLAG_CACHE_TTL_MS', 'RBAC_CACHE_TTL_MS'];
  const missing = required.filter(k => !keys.includes(k));
  if (missing.length) console.error('MISSING:', missing);
  else console.log('OK: all required exports present');
}).catch(err => console.error('IMPORT FAILED:', err.message));
"
```

### 11.3 PM2 Restart Procedure

```bash
# Verify no PM2 restart loop before committing
pm2 restart api --update-env
sleep 3
pm2 list
# Expected: api status=online, restarts=0 (or same as before)

# If restart loop detected:
pm2 stop api
# Revert code changes
# pm2 start api
```

### 11.4 PM2 Failure Recovery

If PM2 fails to start after the restart:
1. Check logs: `pm2 logs api --lines 50`
2. Look for: `SyntaxError`, `Cannot find module`, `Error: Cannot resolve`
3. Revert immediately (see §15.2)
4. The previous `api` process is NOT automatically restored — revert + manual start

---

## 12. Hidden Deployment Sequence

### 12.1 Deployment vs Activation Are Separate Operations

This is the core safety guarantee of Slice 3:

| Step | When | What |
|---|---|---|
| Deploy migration | Deploy day | Tables created, seeds inserted, flags remain off |
| Deploy code | Deploy day | New routes registered, flags remain off, routes return 404 |
| PM2 restart | Deploy day | New code active, RBAC still disabled |
| Superadmin bootstrap | Separate, after verification | Role assigned in DB |
| RBAC activation | Separate, after bootstrap | Feature flag toggled on |

### 12.2 Behavior at Each State

**State 1 — Deployed, RBAC disabled (default):**
- `GET /api/admin/rbac/roles` → 404 (startup gate)
- `GET /api/admin/shops` → 200 (unchanged)
- `requirePermission` is compiled into the binary but never executed for existing routes
- No RBAC DB queries, no RBAC Redis writes

**State 2 — Deployed, superadmin assigned, RBAC still disabled:**
- Same as State 1
- `admin_user_roles` has 1 row but RBAC code paths are still gated off

**State 3 — Deployed, RBAC enabled, superadmin assigned:**
- `GET /api/admin/rbac/roles` → 200 (with superadmin JWT)
- `GET /api/admin/rbac/roles` → 403 (with non-superadmin admin JWT, no rbac:read)
- `GET /api/admin/shops` → 200 (still `requireAdmin` only — unchanged)
- All new RBAC management routes active

---

## 13. Production Smoke Tests

### 13.1 Smoke Tests After Deploy (RBAC Disabled — Phase E)

```bash
export ADMIN_TOKEN="<valid admin JWT>"

# 1. Existing admin routes must return exactly as before
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/shops | jq 'if type=="array" then "PASS (array)" else "FAIL" end'

# 2. Slice 2 feature flags endpoint must still work
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/platform/features | jq '{rbacEnabled, platformEnabled}'
# Expected: { rbacEnabled: false, platformEnabled: false }

# 3. New RBAC routes must be hidden (404)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/rbac/roles
# Expected: 404

# 4. Storefront pages load normally (sample)
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/
# Expected: 200

# 5. Wildcard subdomain responds
curl -s -o /dev/null -w "%{http_code}" \
  https://demo.otofine.com/
# Expected: 200 (or 302/301 if redirect applies)

# 6. RFQ endpoint responds
curl -s -o /dev/null -w "%{http_code}" \
  https://api.otofine.com/api/rfq/search
# Expected: 200 or 400 (not 500)
```

### 13.2 Smoke Tests After RBAC Activation (Phase F)

```bash
# 7. RBAC routes now accessible with superadmin JWT
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/rbac/roles | jq 'if type=="array" then "PASS" else "FAIL" end'
# Expected: PASS (array of 4 roles)

# 8. rbacEnabled flag now true
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/platform/features | jq .rbacEnabled
# Expected: true

# 9. Permission denied for unknown permission (no token at all)
curl -s -o /dev/null -w "%{http_code}" \
  https://api.otofine.com/api/admin/rbac/roles
# Expected: 401 (no token → requireAuth fires)

# 10. Existing routes still work after RBAC activation
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/shops | jq 'if type=="array" then "PASS" else "FAIL" end'
# Expected: PASS
```

---

## 14. Runtime Verification Plan

### 14.1 Redis Key Verification (Post-Activation)

```bash
# After first authenticated RBAC request, verify cache key exists
redis-cli KEYS "otofine:v1:dv1:admin:rbac:*"
# Expected: otofine:v1:dv1:admin:rbac:<adminId>:perms

# Inspect cached value
redis-cli GET "otofine:v1:dv1:admin:rbac:<adminId>:perms"
# Expected: {"permissions":[],"isSuperadmin":true}  (for superadmin)

# Verify TTL is ~300s
redis-cli TTL "otofine:v1:dv1:admin:rbac:<adminId>:perms"
# Expected: 295-300 (positive integer)
```

### 14.2 RBAC Permission Resolution Verification

```sql
-- Verify superadmin admin has no permission rows but is_superadmin=1
SELECT p.permission_key, MAX(r.is_superadmin) AS is_superadmin
FROM admin_user_roles aur
JOIN admin_roles r ON r.id = aur.role_id
LEFT JOIN admin_role_permissions arp ON arp.role_id = r.id
LEFT JOIN admin_permissions p ON p.id = arp.permission_id
WHERE aur.admin_id = <ADMIN_ID>
GROUP BY p.permission_key;
-- Expected: 1 row — permission_key=NULL, is_superadmin=1
```

### 14.3 Controller Guard Verification (Post-Activation)

```bash
# Test C2 escalation guard: attempt to assign superadmin role as non-superadmin
# (Requires a test admin with rbac:manage but not superadmin)
# Expected: 403 { error: "Only superadmins may assign the superadmin role" }

# Test C5 lockout guard: attempt to revoke the last superadmin assignment
# (Simulate: try DELETE /api/admin/rbac/admins/<id>/roles/<superadmin_role_id>
#  when only 1 superadmin assignment exists)
# Expected: 403 { error: "Cannot revoke last superadmin assignment" }
```

### 14.4 req.adminPermissionChecked Verification

```bash
# Verify C3: req.adminPermissionChecked is populated before handler runs
# (Check this in rbac.admin.controller.js by logging req.adminPermissionChecked in handler)
# Expected log: [rbac:controller] permission checked: rbac:read
```

---

## 15. Rollback Strategy

### 15.1 Rollback Trigger Conditions

Rollback is mandatory if any of the following occur:

- `server.js` fails to start after PM2 restart
- Any existing admin route (`/api/admin/shops`, `/api/admin/rfq`, `/api/admin/part-knowledge`) returns a non-200 status
- Any storefront page returns 5xx
- `GET /api/admin/platform/features` returns non-200
- Redis RBAC keys appear before RBAC is activated (unexpected write)
- DB error visible in PM2 logs referencing RBAC tables

### 15.2 Code Rollback Procedure

```bash
# Step 1: Identify the Slice 3 commit SHA
git log --oneline -5

# Step 2: Revert the Slice 3 commit (additive changes only — safe revert)
git revert <slice3-commit-sha> --no-edit

# Step 3: Verify reverted server.js does not import rbacRouter
grep "rbacRouter" backend/server.js
# Expected: no output

# Step 4: Syntax check reverted files
node --check backend/modules/admin/index.js
node --check backend/server.js

# Step 5: PM2 restart with reverted code
pm2 restart api --update-env

# Step 6: Verify
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/shops
# Expected: 200
```

### 15.3 Migration Rollback Procedure

Migration rollback is ONLY needed if the new tables cause unexpected issues. Since no existing tables are modified, migration rollback is not expected to be necessary for code-only regressions.

```bash
# Execute rollback SQL
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME \
  < backend/migrations/053_admin_rbac.rollback.sql

# Remove tracking row
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e \
  "DELETE FROM schema_migrations WHERE filename = '053_admin_rbac.sql';"

# Verify
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e "SHOW TABLES LIKE 'admin_%';"
# Expected: only admin_feature_flags
```

### 15.4 RBAC Deactivation (Without Full Rollback)

If RBAC has been activated and needs to be disabled without a full rollback:

```sql
-- Option A: DB toggle (takes effect within 60s via feature flag TTL)
UPDATE admin_feature_flags SET is_enabled = 0 WHERE flag_key = 'ADMIN_RBAC_ENABLED';

-- Option B: ENV + restart (immediate)
-- Set ADMIN_RBAC_ENABLED=false in .env → pm2 restart api
```

After deactivation, all RBAC routes return 404 (startup gate). All existing routes continue to function normally with `requireAdmin` only.

---

## 16. Recovery Procedures

### 16.1 Superadmin Lockout Recovery

If all superadmin role assignments are revoked (bypassing the C5 guard via direct DB manipulation):

```sql
-- Step 1: Find superadmin role id
SELECT id, role_name FROM admin_roles WHERE is_superadmin = 1;

-- Step 2: Find any available admin id
SELECT id, email FROM admin LIMIT 5;

-- Step 3: Re-assign superadmin role
INSERT INTO admin_user_roles (admin_id, role_id, granted_by)
VALUES (<admin_id>, <superadmin_role_id>, NULL)
ON DUPLICATE KEY UPDATE granted_by = NULL;

-- Step 4: Flush RBAC cache for that admin (actual key depends on CACHE_KEY_PREFIX and CACHE_DATA_VERSION)
redis-cli DEL "otofine:v1:dv1:admin:rbac:<admin_id>:perms"

-- Step 5: Verify RBAC access restored
-- curl -H "Authorization: Bearer $ADMIN_TOKEN" .../api/admin/rbac/roles → 200
```

### 16.2 Redis RBAC Cache Full Flush

If RBAC cache data is suspected to be stale or corrupt:

```bash
# Flush all RBAC cache keys
redis-cli SCAN 0 MATCH "otofine:v1:dv1:admin:rbac:*" COUNT 200
# Then DEL all matching keys

# Or use the Node.js service directly:
node -e "
import { invalidateByLogicalPrefix } from './backend/services/redisCache.service.js';
invalidateByLogicalPrefix('admin:rbac:').then(() => console.log('RBAC cache flushed'));
"
```

### 16.3 Migration Re-Run After Partial Failure

```bash
# If migration fails mid-way (unlikely with IF NOT EXISTS + INSERT IGNORE):
npm run migrate:admin:rbac:dry  # Check what state the runner sees
npm run migrate:admin:rbac       # Re-run — safe due to idempotent DDL and INSERT IGNORE

# If runner reports DRIFT WARNING (checksum mismatch):
# Do NOT re-run. Investigate: the migration file was modified after being applied.
```

---

## 17. Dangerous File List

The following files exist in the production codebase and relate to admin authentication. Any modification to these files in connection with Slice 3 would constitute a production regression. They MUST NOT be edited.

| File | Why dangerous |
|---|---|
| `backend/domains/auth/middlewares/auth.middleware.js` | Defines `requireAuth`, `requireAdmin`, `requireShop` — all existing admin routes depend on them |
| `backend/domains/auth/services/token.service.js` | Defines `signAdminAccessToken` — changing the payload would invalidate all live admin sessions |
| `backend/domains/auth/services/adminAuth.service.js` | Admin login flow — any change could break admin authentication entirely |
| `backend/domains/auth/config/auth.config.js` | JWT secret + token expiry configuration |
| `backend/routes/admin.routes.js` | All existing admin shop management routes |
| `backend/controllers/adminController.js` | `getAllShops`, `updateShopStatus`, `deleteShop` — live admin functionality |
| `backend/modules/admin/core/featureFlags/featureFlag.service.js` | Slice 2 — provides `isFeatureEnabled` consumed by the new `requirePermission` |
| `backend/modules/admin/platform/routes/platform.admin.routes.js` | Slice 2 — `GET /api/admin/platform/features` |
| `backend/modules/admin/config/adminPlatform.config.js` | Slice 2 — `ADMIN_RBAC_ENABLED` ENV read |
| `backend/scripts/run-admin-migration.js` | `053_admin_rbac.sql` already in whitelist — no change needed |
| `backend/.env` | `ADMIN_RBAC_ENABLED=false` already set in Slice 2 — no change needed |
| `backend/services/redisCache.service.js` | Core Redis client used by both feature flags and RBAC |

---

## 18. Forbidden Modification List

The following operations are FORBIDDEN during Slice 3 implementation:

| Forbidden action | Consequence |
|---|---|
| Modify `requireAdmin` middleware | Breaks all existing admin route protection |
| Modify `signAdminAccessToken` JWT payload | Invalidates all active admin sessions |
| Add `requirePermission` to any EXISTING route | Changes protected behavior of live admin functionality |
| Add `ALTER TABLE` to `admin`, `shop_accounts`, any existing table | Violates additive-only policy |
| Use `router.use("*", handler)` pattern | Express 5 startup crash (fixed: use `router.use(handler)`) |
| Use `admin:rbac:perms:{adminId}` key format (old format) | Per-admin cache invalidation collision |
| Call `invalidateByLogicalPrefix('admin:rbac:')` WITHOUT null check | Correct for bulk — but avoid calling with `null` literal instead of `undefined` if conditional on adminId |
| Omit `export default router` from `rbac.admin.routes.js` | Barrel `{ default as rbacRouter }` import fails |
| Set `req.adminPermissionChecked` after `next()` | Audit logging misses the checked permission |
| Use literal `60` for `RBAC_CACHE_TTL_MS` | Sets TTL to 60ms (not 60s) — permissions expire instantly |
| Activate `ADMIN_RBAC_ENABLED` before superadmin bootstrap | All RBAC-protected routes 403 for all admins |
| Touch any storefront, wildcard, SEO, or RFQ file | Zero-regression policy violation |

---

## 19. Regression Test Checklist

### 19.1 Storefront Regression (Required After PM2 Restart)

- [ ] `GET https://otofine.com/` returns 200
- [ ] `GET https://[shop_slug].otofine.com/` returns 200 (wildcard subdomain)
- [ ] `GET https://otofine.com/xe-may/[slug]` returns 200 (product page)
- [ ] `GET https://otofine.com/sitemap.xml` returns 200
- [ ] `GET https://otofine.com/robots.txt` returns 200

### 19.2 Admin Existing Route Regression

- [ ] `GET /api/admin/shops` with admin JWT returns 200 (array)
- [ ] `PATCH /api/admin/shops/:id/status` with admin JWT returns 200
- [ ] `GET /api/admin/platform/features` with admin JWT returns 200 `{ rbacEnabled: false }`
- [ ] `POST /api/admin/admin-login` with valid credentials returns `{ token, admin }`
- [ ] `GET /api/admin/part-knowledge/*` with admin JWT returns expected response

### 19.3 Seller Dashboard Regression

- [ ] `POST /api/shop-login` returns token
- [ ] `GET /api/shop/products` with shop JWT returns product list
- [ ] Storefront product listing pages load correctly

### 19.4 RFQ Flow Regression

- [ ] `GET /api/rfq/*` public endpoints return expected responses
- [ ] `GET /api/admin/rfq/*` with admin JWT returns expected responses

### 19.5 Auth Flow Regression

- [ ] Admin login flow works: `POST /api/admin/admin-login` → JWT
- [ ] Shop login flow works: `POST /api/shop-login` → JWT
- [ ] Invalid token returns 401 from `requireAuth`
- [ ] Valid shop token rejected by `requireAdmin` with 403 `{ message }` shape

---

## 20. Implementation Review Checklist

Complete this checklist before initiating PM2 restart:

### Migration
- [ ] `053_admin_rbac.sql` exists at `backend/migrations/053_admin_rbac.sql`
- [ ] `053_admin_rbac.rollback.sql` exists at `backend/migrations/053_admin_rbac.rollback.sql`
- [ ] Migration dry-run shows `WOULD APPLY: 053_admin_rbac.sql`
- [ ] Migration executed successfully
- [ ] All 5 validation queries from §2.7 pass
- [ ] `admin_user_roles` count = 0 (no pre-assigned roles)

### File Correctness
- [ ] `rbac.service.js` — `RBAC_CACHE_TTL_MS = 300_000` (not literal 60)
- [ ] `rbac.service.js` — cache key is `admin:rbac:${adminId}:perms` (colon after adminId)
- [ ] `rbac.service.js` — per-admin invalidation prefix is `'admin:rbac:' + adminId + ':'`
- [ ] `rbac.service.js` — iteration checks `is_superadmin` on ALL rows (C1)
- [ ] `rbac.middleware.js` — `isFeatureEnabled` wrapped in try/catch with ENV fallback (B3)
- [ ] `rbac.middleware.js` — `req.adminPermissionChecked` set BEFORE `next()` (C3)
- [ ] `rbac.admin.controller.js` — escalation guard on `assignRole` checks `isSuperadmin` of requester (C2)
- [ ] `rbac.admin.controller.js` — lockout guard on `revokeRole` counts remaining superadmins (C5)
- [ ] `rbac.admin.routes.js` — uses `router.use(handler)` NOT `router.use("*", handler)`
- [ ] `rbac.admin.routes.js` — has `export default router`
- [ ] `rbac.admin.routes.js` — startup gate (`router.use(handler)`) registered AFTER all named routes

### Modified File Correctness
- [ ] `index.js` — `export { default as rbacRouter }` pattern
- [ ] `index.js` — all Slice 2 exports still present (no accidental removal)
- [ ] `server.js` — `import { platformRouter, rbacRouter }` (combined or separate import)
- [ ] `server.js` — `app.use("/api/admin/rbac", rbacRouter)` added after existing platform mount
- [ ] `server.js` — no existing route mount removed or reordered
- [ ] `package.json` — `migrate:admin:rbac` and `migrate:admin:rbac:dry` scripts present

### Syntax + Import Verification
- [ ] `node --check` passes for all 6 files (4 new + 2 modified)
- [ ] Barrel import dynamic check passes (§11.2 script)
- [ ] No circular import chain: rbac.middleware → featureFlag.service → redisCache.service → (no rbac)

### Runtime Safety
- [ ] `ADMIN_RBAC_ENABLED=false` confirmed in ENV and in DB
- [ ] After PM2 restart, `GET /api/admin/rbac/roles` returns 404
- [ ] After PM2 restart, `GET /api/admin/shops` returns 200
- [ ] After PM2 restart, `GET /api/admin/platform/features` returns `{ rbacEnabled: false }`
- [ ] No `admin:rbac:*` Redis keys exist before RBAC activation

### Backward Compatibility Confirmation
- [ ] `requireAdmin` function in `auth.middleware.js` has NOT been modified
- [ ] `signAdminAccessToken` in `token.service.js` has NOT been modified
- [ ] `admin.routes.js` has NOT been modified
- [ ] All 6 existing `requireAdmin`-protected routes still use only `requireAdmin`
- [ ] `featureFlag.service.js` has NOT been modified

---

*Document version: 1.0 — Planning only. No implementation files generated.*  
*Next step: Generate implementation files using this plan as source of truth.*
