# Otofine Admin Platform — Phase 1A Slice 3: RBAC Foundation
## Architecture Design Document

**Status:** DESIGN ONLY — no implementation  
**Date:** 2026-05-26  
**Depends on:** Slice 1 (schema_migrations), Slice 2 (feature flags, adminPlatform.config.js)  
**Source of truth:** system audit docs, auth.middleware.js, token.service.js, adminAuth.service.js, admin.routes.js, adminPlatform.config.js

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Design Goals and Constraints](#2-design-goals-and-constraints)
3. [JWT Token Strategy](#3-jwt-token-strategy)
4. [Permission Model](#4-permission-model)
5. [Database Schema Design](#5-database-schema-design)
6. [RBAC Service Architecture](#6-rbac-service-architecture)
7. [Middleware Design](#7-middleware-design)
8. [Redis Cache Strategy](#8-redis-cache-strategy)
9. [Route Protection Strategy](#9-route-protection-strategy)
10. [Module File Structure](#10-module-file-structure)
11. [Migration Plan](#11-migration-plan)
12. [Rollout Plan](#12-rollout-plan)
13. [Rollback Plan](#13-rollback-plan)
14. [Risk Analysis](#14-risk-analysis)
15. [Dangerous Coupling Analysis](#15-dangerous-coupling-analysis)
16. [Implementation Phases](#16-implementation-phases)

---

## 1. Current State Analysis

### 1.1 Existing Admin Table

```sql
-- Inferred from adminAuth.service.js queries:
SELECT * FROM admin WHERE email = ? LIMIT 1
UPDATE admin SET passwordHash = ? WHERE id = ?
```

Confirmed columns: `id`, `email`, `passwordHash`.  
No `role`, `is_superadmin`, or `is_active` columns exist.  
**This table MUST NOT be modified (additive-only rule).**

### 1.2 Existing JWT Payload (admin tokens)

From `token.service.js → signAdminAccessToken`:

```javascript
jwt.sign({ id: admin.id, role: "admin", email: admin.email }, jwtSecret, { expiresIn })
```

- `role` is the static string `"admin"` — no granularity
- No `is_superadmin` field
- No permissions array in token
- Token is issued once at login and not refreshed (no refresh token for admins currently)

**This token structure MUST NOT change.** Changing it would invalidate all active admin sessions.

### 1.3 Existing `requireAdmin` Middleware

```javascript
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Không có quyền admin" });
  }
  next();
}
```

Binary check: is token role "admin"? No permission granularity.  
**This function MUST NOT be modified.** All existing routes depend on it.

### 1.4 Routes Currently Protected by `requireAdmin`

| Prefix | Source |
|---|---|
| `GET /api/admin/shops` | `admin.routes.js` |
| `PATCH /api/admin/shops/:id/status` | `admin.routes.js` |
| `DELETE /api/admin/shops/:id` | `admin.routes.js` |
| `* /api/admin/part-knowledge` | `server.js` (inline) |
| `* /api/admin/rfq` | `server.js` + rfq.admin.routes.js |
| `GET /api/admin/platform/features` | `platform.admin.routes.js` (Slice 2) |

All of these retain their current `requireAdmin` guard unchanged after Slice 3 deploys.

### 1.5 `req.user` Shape Available to RBAC

```javascript
req.user = { id: Number, role: "admin", email: String }
```

`req.user.id` is the admin's DB `id` from the `admin` table. This is the RBAC lookup key.

### 1.6 Existing Redis Cache Namespace (Slice 2)

- Feature flags: `admin:ff:{FLAG_KEY}` (TTL 60 s)
- RBAC will use: `admin:rbac:{adminId}:perms` (TTL 300 s — distinct namespace, no collision)

The colon after `{adminId}` is required (B2 patch): `invalidateByLogicalPrefix` uses a trailing-wildcard SCAN pattern. Without the colon, invalidating admin ID `1` would also match IDs `10`, `100`, `1000`, etc. The colon acts as an unambiguous numeric delimiter.

---

## 2. Design Goals and Constraints

### 2.1 Design Goals

1. Add per-permission route protection alongside (not replacing) `requireAdmin`
2. Superadmin role that bypasses individual permission checks
3. Redis-backed permission cache for zero-latency resolution on hot paths
4. DB fallback when Redis is unavailable
5. RBAC disabled = exact current behavior (feature-flag gated at runtime)
6. Audit-log-ready: permission check result and admin_id available in request context
7. Additive DB schema only — no ALTER TABLE on any existing table

### 2.2 Hard Constraints

| Constraint | Reason |
|---|---|
| DO NOT modify `admin` table | Active production table, no downtime ALTER |
| DO NOT modify `requireAdmin` | Existing routes depend on it exactly |
| DO NOT change JWT token payload | Would invalidate active sessions |
| DO NOT add FK from `admin_user_roles.admin_id` to `admin.id` | Only 3 columns of `admin` confirmed from query context — full DDL unaudited. Conservative isolation prevents FK breakage if the table structure differs from expectations (C4). |
| DO NOT touch storefront, RFQ, SEO, wildcard logic | Zero regression policy |
| DO NOT activate RBAC by default | `ADMIN_RBAC_ENABLED=false` in .env |
| MUST NOT change `requireAdmin` response shape | Existing frontends parse `403 { message: "Không có quyền admin" }` |
| `requirePermission` 403 shape differs from `requireAdmin` 403 | `requirePermission` returns `{ error: "Forbidden", required: permissionKey }`. This only affects NEW routes. Future frontend code for RBAC routes must handle both shapes (C6). |

### 2.3 Backward Compatibility Requirement

When `ADMIN_RBAC_ENABLED=false` (the default initial state):
- ALL existing admin routes behave exactly as today
- New RBAC routes return 404 (hidden via platform gate)
- `requirePermission` middleware is callable but falls back to `requireAdmin` behavior
- No DB queries to RBAC tables occur
- No Redis RBAC cache keys are written

---

## 3. JWT Token Strategy

### 3.1 Decision: Permissions NOT Embedded in JWT

Permissions must NOT be embedded in the JWT payload for these reasons:

1. **Token lifetime** is 7 days (`AUTH_ACCESS_EXPIRES=7d`). Permissions may change mid-session. A stale token with old embedded permissions would silently grant or deny incorrect access for up to 7 days.
2. **Token structure is immutable** for active sessions (constraint §2.2).
3. **Superadmin bypass** and **role changes** must take effect immediately (within cache TTL).

### 3.2 Resolution Strategy

At each permission-protected request:
1. Extract `req.user.id` from already-validated JWT (after `requireAuth`)
2. Look up permissions via `rbac.service.js` (Redis → DB)
3. Cache result under `admin:rbac:{adminId}:perms` for subsequent requests

This adds a single Redis GET to protected routes (sub-millisecond when warm, ~5–20 ms when cold DB query).

### 3.3 No Token Changes Required

The `signAdminAccessToken` function in `token.service.js` requires NO modification. The `role: "admin"` field continues to be the primary authentication signal; RBAC operates as an additional authorization layer on top.

---

## 4. Permission Model

### 4.1 Permission Key Format

```
{resource}:{action}
```

All lowercase. Colon separator. No wildcards in stored keys.

### 4.2 Permission Registry (Initial Seed)

| Permission Key | Description |
|---|---|
| `shops:read` | View shop list and shop details |
| `shops:write` | Update shop status (approve/block) |
| `shops:delete` | Soft-delete shops |
| `platform:read` | Read admin platform feature flag states |
| `rfq:admin:read` | View RFQ admin queue and conversations |
| `rfq:admin:write` | Take action on RFQ items |
| `part_knowledge:read` | View part knowledge base |
| `part_knowledge:write` | Edit part knowledge base |
| `moderation:read` | View moderation queues |
| `moderation:write` | Take moderation actions |
| `billing:read` | View billing and subscription data |
| `billing:write` | Edit billing plans and subscriptions |
| `analytics:read` | View analytics dashboards |
| `risk:read` | View risk signals and fraud queue |
| `risk:write` | Take action on risk items |
| `crm:read` | View seller CRM notes and tags |
| `crm:write` | Edit seller CRM notes and tags |
| `rbac:read` | View RBAC roles and assignments |
| `rbac:manage` | Create/modify/assign RBAC roles |
| `audit_log:read` | View admin audit log |

Total: 20 initial permissions. Extensible without migration (add rows to `admin_permissions`).

### 4.3 Initial Role Definitions

| Role Name | `is_superadmin` | Description |
|---|---|---|
| `superadmin` | 1 | Bypass all permission checks |
| `moderator` | 0 | shops:read/write + moderation:read/write + rfq:admin:read |
| `analyst` | 0 | shops:read + analytics:read + rfq:admin:read + billing:read |
| `operator` | 0 | shops:read/write + rfq:admin:read/write + part_knowledge:read |

### 4.4 Superadmin Bypass Semantics

If ANY role assigned to the admin has `is_superadmin = 1`:
- `requirePermission(key)` calls `next()` immediately
- No permission key lookup needed
- Result: `{ isSuperadmin: true, permissions: [] }` cached in Redis (empty permissions array is fine — superadmin bypass comes first)

**Escalation guard (C2):** An admin holding `rbac:manage` can invoke `POST /api/admin/rbac/admins/:adminId/roles`. Without an explicit guard, they could assign themselves the `superadmin` role, bypassing all future permission checks. The controller MUST enforce: **only an admin with `isSuperadmin = true` may assign a role where `is_superadmin = 1`**. Non-superadmin admins with `rbac:manage` may only assign non-superadmin roles. See §9.2 for the controller-level guard specification.

### 4.5 RBAC Disabled Behavior

When `ADMIN_RBAC_ENABLED=false`:
- `requirePermission(key)` reduces to `requireAdmin` semantics: checks `req.user.role === "admin"` only
- No DB/Redis queries to RBAC tables
- Existing routes unchanged
- New RBAC management routes return 404 (hidden by platform gate)

---

## 5. Database Schema Design

### 5.1 Table: `admin_roles`

```sql
CREATE TABLE IF NOT EXISTS admin_roles (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  role_name     VARCHAR(80)   NOT NULL,
  description   VARCHAR(255)  NULL,
  is_superadmin TINYINT(1)    NOT NULL DEFAULT 0
                              COMMENT '1 = bypass all permission checks',
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                              ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ar_role_name (role_name)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
```

### 5.2 Table: `admin_permissions`

```sql
CREATE TABLE IF NOT EXISTS admin_permissions (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  permission_key VARCHAR(120)  NOT NULL
                               COMMENT 'Format: resource:action, e.g. shops:read',
  description    VARCHAR(255)  NULL,
  created_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ap_permission_key (permission_key)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
```

`updated_at` is intentionally omitted — permissions are append-only. Updates rename: create a new permission, migrate assignments.

### 5.3 Table: `admin_role_permissions`

```sql
CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id       INT UNSIGNED  NOT NULL,
  permission_id INT UNSIGNED  NOT NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_arp_role
    FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_arp_permission
    FOREIGN KEY (permission_id) REFERENCES admin_permissions(id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
```

### 5.4 Table: `admin_user_roles`

```sql
CREATE TABLE IF NOT EXISTS admin_user_roles (
  admin_id   INT UNSIGNED  NOT NULL
                           COMMENT 'Logical FK to admin.id — no physical constraint (admin table is immutable)',
  role_id    INT UNSIGNED  NOT NULL,
  granted_by INT UNSIGNED  NULL
                           COMMENT 'admin.id who assigned this role; NULL = seeded',
  created_at DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (admin_id, role_id),
  KEY idx_aur_admin_id (admin_id),
  CONSTRAINT fk_aur_role
    FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
```

**Critical design note (C4 patch):** `admin_user_roles.admin_id` references `admin.id` semantically but has NO physical FK constraint. The original rationale ("FK requires referencing table to be altered") was incorrect — MySQL InnoDB FK constraints are defined on the child table only and do NOT require altering the parent table. The real reasons for omitting the FK are:

1. **Incomplete `admin` table audit:** Only 3 columns (`id`, `email`, `passwordHash`) are confirmed from query context. We have not seen the full DDL. If the table uses a different engine, charset, or the `id` column has unexpected properties, a FK could fail silently. Conservative isolation is the safe default.
2. **Additive-only coupling policy:** Minimising dependencies on unaudited existing tables reduces the blast radius of any future schema change to `admin`.

The `idx_aur_admin_id` index provides lookup efficiency without the coupling risk. If the `admin` table is fully audited in a future Slice, a FK can be added safely via a new migration at that time.

### 5.5 Seed Data Plan

Seed with `INSERT IGNORE` (idempotent):

1. Insert 4 roles into `admin_roles`
2. Insert 20 permissions into `admin_permissions`
3. Insert role_permission assignments for `moderator`, `analyst`, `operator`
4. `superadmin` role: no need to insert rows into `admin_role_permissions` (bypass is flag-based)
5. NO `admin_user_roles` rows seeded — actual admins are assigned roles via admin UI (Slice 5+) or manual DB insert during initial activation

### 5.6 Migration Numbering

Available gap in migration sequence: **052–054** (between 045 and 051). These are intentionally reserved for admin foundation tables per the architecture plan.

**B1 patch:** The migration runner `run-admin-migration.js` maintains an explicit `ADMIN_MIGRATION_FILES` whitelist. The current whitelist contains `"052_admin_accounts.sql"` at slot 052 and `"053_admin_rbac.sql"` at slot 053. Slot 052 is reserved for a future `admin_accounts` table. The RBAC migration must use slot 053.

Proposed:
- `053_admin_rbac.sql` — all 4 tables + 20-permission seed + 4-role seed + role_permission assignments

Single migration for all 4 RBAC tables because:
- All tables have FK dependencies on each other (roles ← role_permissions, permissions ← role_permissions, roles ← user_roles)
- Rolling back one is meaningless without rolling back all
- Atomic deploy is safer than multi-file with FK dependency ordering errors

Rollback: `053_admin_rbac.rollback.sql` — drops tables in FK-safe reverse order.

**Required runner update (B1):** Implementation must also update the `ADMIN_MIGRATION_FILES` array in `run-admin-migration.js` to confirm `"053_admin_rbac.sql"` is present in the list (it already is in the current whitelist). No whitelist change is needed — `053_admin_rbac.sql` is already the listed filename. This is confirmed safe.

---

## 6. RBAC Service Architecture

### 6.1 Location

```
backend/modules/admin/core/rbac/rbac.service.js
```

Follows the same `core/` pattern as `featureFlags/featureFlag.service.js`.

### 6.2 Service Functions

#### `getAdminRbac(adminId)` → `{ permissions: Set<string>, isSuperadmin: boolean }`

Resolution order:
1. Redis: `GET admin:rbac:{adminId}:perms` → parse JSON → convert permissions array to Set → return
2. DB: JOIN query across `admin_user_roles`, `admin_roles`, `admin_role_permissions`, `admin_permissions`
3. Write DB result to Redis at key `admin:rbac:{adminId}:perms` (TTL: 300,000 ms)
4. If DB error: log warning, return `{ permissions: new Set(), isSuperadmin: false }` (fail-safe: deny access)
5. If admin has no roles: return `{ permissions: new Set(), isSuperadmin: false }`

DB query (single JOIN):
```sql
SELECT
  p.permission_key,
  MAX(r.is_superadmin) AS is_superadmin
FROM admin_user_roles aur
JOIN admin_roles r ON r.id = aur.role_id
LEFT JOIN admin_role_permissions arp ON arp.role_id = r.id
LEFT JOIN admin_permissions p ON p.id = arp.permission_id
WHERE aur.admin_id = ?
GROUP BY p.permission_key
```

Note: `LEFT JOIN` so that superadmin admins (no permission rows needed) still return a row for `is_superadmin = 1`. If the admin has no roles at all, the query returns zero rows, and the service returns empty Set + `isSuperadmin: false`.

**C1 — Mandatory iteration contract:** The service MUST iterate ALL rows returned by the query, including rows where `permission_key IS NULL` (which occurs for the superadmin role's LEFT JOIN result). The `is_superadmin` flag must be checked across every row. The required implementation pattern is:

```javascript
let isSuperadmin = false;
const permissions = new Set();
for (const row of rows) {
  if (row.is_superadmin) isSuperadmin = true;      // check ALL rows, including NULL permission_key rows
  if (row.permission_key) permissions.add(row.permission_key); // skip NULL permission_key rows
}
```

Rationale: For an admin with both a superadmin role (no permission rows) AND a regular role (with permission rows), the `is_superadmin = 1` value only appears in the NULL `permission_key` group of the `GROUP BY` result. If the implementation only checks `is_superadmin` on non-null rows, it will incorrectly treat that admin as non-superadmin.

#### `hasPermission(adminId, permissionKey)` → `boolean`

1. Call `getAdminRbac(adminId)`
2. If `isSuperadmin` → return `true`
3. Return `permissions.has(permissionKey)`

#### `invalidateAdminRbacCache(adminId)` → `Promise<void>`

- If `adminId` is provided: `invalidateByLogicalPrefix('admin:rbac:' + adminId + ':')`
  - Example for adminId=1: prefix `admin:rbac:1:` → matches only `admin:rbac:1:perms` (and any future `admin:rbac:1:*` sub-keys). Does NOT match `admin:rbac:10:perms` because `admin:rbac:10:...` starts with `1` then `0`, but the pattern requires `:` after `1`.
- If `adminId` is null/undefined: `invalidateByLogicalPrefix('admin:rbac:')` (invalidate all admin RBAC caches)
- Uses same `invalidateByLogicalPrefix` from `redisCache.service.js` as Slice 2

**B2 constraint:** The colon-terminated per-admin prefix is mandatory. Using `admin:rbac:perms:{adminId}` without a trailing colon would produce a SCAN pattern that matches multiple admin IDs sharing the same digit prefix (e.g., `admin:rbac:perms:1*` matches admin IDs 1, 10, 100, etc.).

### 6.3 Fail-Safe Philosophy

**RBAC service errors must deny access, not grant it.**

If DB is unavailable and Redis has no cached permissions:
- Return `{ permissions: new Set(), isSuperadmin: false }`
- `hasPermission` returns `false`
- `requirePermission` returns 403
- This is preferable to allowing unauthorized access during a DB outage

Exception: when `ADMIN_RBAC_ENABLED=false`, the `requirePermission` middleware bypasses RBAC entirely and only checks `req.user.role === "admin"` — no service calls made.

### 6.4 Redis Value Format

```json
{
  "permissions": ["shops:read", "shops:write", "rfq:admin:read"],
  "isSuperadmin": false
}
```

Stored as a JSON string. `permissions` is an array in storage, converted to `Set<string>` on parse. `isSuperadmin` is a boolean.

---

## 7. Middleware Design

### 7.1 Location

```
backend/modules/admin/core/rbac/rbac.middleware.js
```

### 7.2 `requirePermission(permissionKey)` Factory

Returns an Express middleware function. Usage:

```javascript
router.get("/shops", requireAuth, requireAdmin, requirePermission("shops:read"), handler);
```

**Execution flow:**

```
requirePermission("shops:read") returns async function(req, res, next) {
  1. Check ADMIN_RBAC_ENABLED (B3 patch — error-safe):
     try {
       rbacEnabled = await isFeatureEnabled("ADMIN_RBAC_ENABLED");
     } catch (err) {
       console.error("[rbac:middleware] isFeatureEnabled error:", err.message);
       rbacEnabled = adminPlatformConfig.rbacEnabled; // ENV fallback — NOT unconditional next()
     }
     - If false: call next() immediately (falls through to requireAdmin which already ran)
     - If true: continue to step 2

     Rationale (B3): Silently calling next() on error would bypass RBAC protection when
     ADMIN_RBAC_ENABLED=true in ENV. The ENV value is the correct safe fallback; it is
     not affected by Redis/DB failures.

  2. Defensive role check (requireAdmin must have already run):
     - If req.user.role !== "admin": return 403 { error: "Forbidden" }
       (self-defensive in case middleware ordering is wrong)
     - If req.user.id is missing: return 401

  3. Set req.adminPermissionChecked = permissionKey
     (C3 patch: MUST be set BEFORE calling next() so downstream audit middleware sees it)

  4. Call hasPermission(req.user.id, permissionKey)
     - On error (service throws): log + return 500
     - On false: return 403 { error: "Forbidden", required: permissionKey }
     - On true: return next()
}
```

**C6 — 403 response shape divergence:** `requirePermission` returns `403 { error: "Forbidden", required: permissionKey }`. This shape differs from `requireAdmin`'s `403 { message: "Không có quyền admin" }`. Both shapes can appear on the same route chain (requireAdmin fires first on invalid role, requirePermission fires first on insufficient permission). Future frontend code targeting RBAC-protected routes must handle both shapes.

### 7.3 `requirePermission` vs `requireAdmin` Relationship

These are COMPLEMENTARY, not mutually exclusive:

```javascript
// New routes (Slice 3+) — double-layer protection
router.get("/something", requireAuth, requireAdmin, requirePermission("shops:read"), handler);

// Existing routes — unchanged, no requirePermission
router.get("/shops", requireAuth, requireAdmin, getAllShops);
```

When both are present, `requireAdmin` gates on JWT role (binary check), then `requirePermission` adds granular gating. When RBAC is disabled, `requirePermission` is a no-op (calls `next()` immediately after feature-flag check).

### 7.4 Why `requireAdmin` Still Required Before `requirePermission`

`requirePermission` trusts that `req.user.id` belongs to an admin-role token (confirmed by `requireAdmin`). Without `requireAdmin` running first, a shop-role token with a fabricated admin ID could attempt RBAC lookups. Defense-in-depth: both guards must be present on all new admin routes.

### 7.5 Middleware Chain for New RBAC-Protected Routes

```
[public request]
    → requireAuth          (JWT validation, populates req.user)
    → requireAdmin         (role:"admin" check, unchanged)
    → requirePermission(k) (RBAC check, new)
    → [feature-flag gate if applicable]
    → handler
```

---

## 8. Redis Cache Strategy

### 8.1 Cache Key

```
admin:rbac:{adminId}:perms
```

Examples:
- `admin:rbac:1:perms`
- `admin:rbac:42:perms`

**B2 constraint:** The colon after `{adminId}` is mandatory. `invalidateByLogicalPrefix` generates a trailing-wildcard SCAN pattern. Using the format `admin:rbac:perms:{adminId}` without a trailing colon means prefix `admin:rbac:perms:1*` matches admin IDs 1, 10, 100, 1000, causing incorrect bulk invalidation. The format `admin:rbac:{adminId}:perms` with prefix `admin:rbac:1:` only matches `admin:rbac:1:*` — the colon after `1` prevents overlap with IDs `10`, `100`, etc.

### 8.2 TTL

**300,000 ms (5 minutes)**

Rationale:
- Longer than feature flag TTL (60 s) because permissions change far less frequently
- Short enough that role changes (via admin UI Slice 5+) propagate within 5 minutes without manual cache flush
- Can be reduced to 60 s if same-session permission changes are required

Named constant in `rbac.service.js`:
```javascript
export const RBAC_CACHE_TTL_MS = 300_000;
```

### 8.3 Cache Invalidation Triggers

| Event | Invalidation prefix |
|---|---|
| Admin assigned a new role | `admin:rbac:{adminId}:` |
| Admin role revoked | `admin:rbac:{adminId}:` |
| Role permissions changed | `admin:rbac:` (all admins — role affects all holders) |
| `is_superadmin` on role changed | `admin:rbac:` (all admins) |
| Admin account deleted/locked | `admin:rbac:{adminId}:` |

Invalidation call: `invalidateAdminRbacCache(adminId)` for per-admin events; `invalidateAdminRbacCache(null)` for role-level events.

### 8.4 Redis Failure Behavior

If Redis GET throws:
- Log warning: `[rbac] Redis unavailable — falling back to DB`
- Execute DB query directly
- Do NOT attempt to cache result if Redis set also fails (fire-and-forget cache write)

If both Redis AND DB fail:
- Log error: `[rbac] Both Redis and DB unavailable for permission check`
- Return `{ permissions: new Set(), isSuperadmin: false }` (deny — fail-safe)
- Middleware returns 500 (not 403, because this is an infrastructure error, not an authorization decision)

### 8.5 Cache Namespace Isolation

```
admin:ff:ADMIN_*       ← Slice 2 feature flags
admin:rbac:{id}:perms  ← Slice 3 RBAC permissions
```

No namespace collision. `invalidateByLogicalPrefix('admin:ff:ADMIN_')` does not touch RBAC keys. `invalidateByLogicalPrefix('admin:rbac:')` does not touch feature flag keys. The `admin:ff:` and `admin:rbac:` prefixes are distinct at the third segment.

### 8.6 Memory Growth Risk

Maximum number of admin accounts is bounded (not a public user table). At 100 active admins, 100 Redis keys × ~200 bytes = 20 KB. Negligible. TTL of 300 s provides automatic eviction. No LRU growth concern.

---

## 9. Route Protection Strategy

### 9.1 Existing Route Protection — No Change

All existing routes retain `requireAdmin` only. No `requirePermission` is added to existing routes. This is non-negotiable for backward compatibility.

| Route | Current Guard | After Slice 3 |
|---|---|---|
| `GET /api/admin/shops` | requireAdmin | **unchanged** |
| `PATCH /api/admin/shops/:id/status` | requireAdmin | **unchanged** |
| `DELETE /api/admin/shops/:id` | requireAdmin | **unchanged** |
| `* /api/admin/part-knowledge` | requireAdmin | **unchanged** |
| `* /api/admin/rfq` | requireAdmin | **unchanged** |
| `GET /api/admin/platform/features` | requireAdmin | **unchanged** |

### 9.2 New RBAC Management Routes (Slice 3)

These routes are NEW and only accessible when both `ADMIN_PLATFORM_ENABLED=true` AND `ADMIN_RBAC_ENABLED=true`:

| Route | Permission Required | Additional Controller Guard |
|---|---|---|
| `GET /api/admin/rbac/roles` | `rbac:read` | — |
| `GET /api/admin/rbac/permissions` | `rbac:read` | — |
| `GET /api/admin/rbac/admins/:adminId/roles` | `rbac:read` | — |
| `POST /api/admin/rbac/admins/:adminId/roles` | `rbac:manage` | C2: superadmin escalation guard |
| `DELETE /api/admin/rbac/admins/:adminId/roles/:roleId` | `rbac:manage` | C5: last-superadmin lockout guard |

All are subject to the double-layer guard: `requireAuth → requireAdmin → requirePermission(k)`.

**C2 — Escalation guard for `POST /admins/:adminId/roles`:**  
Before inserting into `admin_user_roles`, the controller must check whether the target role has `is_superadmin = 1`. If it does, verify that the requesting admin (`req.user.id`) is themselves a superadmin (`isSuperadmin = true` from `getAdminRbac`). If not, return `403 { error: "Only superadmins may assign the superadmin role" }`. This prevents any admin with `rbac:manage` from escalating their own privileges.

**C5 — Last-superadmin lockout guard for `DELETE /admins/:adminId/roles/:roleId`:**  
Before deleting from `admin_user_roles`, if the role being revoked has `is_superadmin = 1`, the controller must check the remaining superadmin assignment count:

```sql
SELECT COUNT(*) FROM admin_user_roles aur
JOIN admin_roles r ON r.id = aur.role_id
WHERE r.is_superadmin = 1
  AND NOT (aur.admin_id = :adminId AND aur.role_id = :roleId)
```

If this count is 0 (the revocation would eliminate the last superadmin), reject with `403 { error: "Cannot revoke last superadmin assignment" }`. This prevents an unrecoverable lockout where no one can access RBAC-managed routes via the API.

**C5 — Lockout recovery (if lockout occurs despite the guard):**  
Direct DB recovery procedure:
```sql
-- Find the superadmin role id
SELECT id FROM admin_roles WHERE is_superadmin = 1 LIMIT 1;

-- Re-assign an admin (use known admin.id from production)
INSERT INTO admin_user_roles (admin_id, role_id, granted_by)
VALUES (<known_admin_id>, <superadmin_role_id>, NULL)
ON DUPLICATE KEY UPDATE granted_by = NULL;

-- Immediately flush RBAC cache for that admin
-- (via Redis CLI or by waiting for TTL expiry)
redis-cli DEL "otofine:v1:dv1:admin:rbac:<admin_id>:perms"
```

### 9.3 Route Mounting in `server.js`

```javascript
// Slice 3 addition to server.js
import { rbacRouter } from "./modules/admin/index.js";
app.use("/api/admin/rbac", rbacRouter);
```

The `rbacRouter` internally gates all routes on `ADMIN_RBAC_ENABLED` (same pattern as `platform.admin.routes.js` gates on `platformEnabled`). Routes return 404 when flag is false.

**Route ordering safety:** `/api/admin/rbac` does not conflict with any existing admin route prefix (`/api/admin`, `/api/admin/part-knowledge`, `/api/admin/rfq`, `/api/admin/platform`). Verified from `server.js` audit.

### 9.4 Startup Gate

In `rbac.admin.routes.js`, the gate check follows the same pattern as `platform.admin.routes.js`:
- Named routes (`GET /roles`, etc.) registered first — unconditionally
- `router.use((req, res) => res.status(404)...)` registered after when `!rbacEnabled`

When `ADMIN_RBAC_ENABLED=false`:
- All RBAC routes silently 404
- No DB queries hit RBAC tables
- No Redis RBAC cache keys written

---

## 10. Module File Structure

### 10.1 New Files

```
backend/
  migrations/
    053_admin_rbac.sql              ← 4 tables + 4 roles + 20 perms + role_perms seed
    053_admin_rbac.rollback.sql     ← DROP in FK-safe order
  modules/admin/
    core/
      rbac/
        rbac.service.js                    ← getAdminRbac, hasPermission, invalidateAdminRbacCache
        rbac.middleware.js                 ← requirePermission(key) factory
    rbac/
      controllers/
        rbac.admin.controller.js           ← getRoles, getPermissions, getAdminRoles, assignRole, revokeRole
      routes/
        rbac.admin.routes.js               ← router with feature gate + export default router
```

### 10.2 Modified Files

```
backend/
  modules/admin/
    index.js                               ← add rbacRouter + rbac service exports
  server.js                                ← add rbacRouter import + app.use mount
  package.json                             ← add migrate:admin:rbac scripts
  .env                                     ← no changes needed (ADMIN_RBAC_ENABLED already appended in Slice 2)
```

### 10.3 Unchanged Files

```
backend/domains/auth/middlewares/auth.middleware.js   ← NO CHANGES
backend/domains/auth/services/token.service.js        ← NO CHANGES
backend/routes/admin.routes.js                        ← NO CHANGES
backend/controllers/adminController.js                ← NO CHANGES
backend/modules/admin/config/adminPlatform.config.js  ← NO CHANGES
backend/modules/admin/core/featureFlags/              ← NO CHANGES
backend/modules/admin/platform/                       ← NO CHANGES
```

### 10.4 Directory Tree After Slice 3

```
backend/modules/admin/
├── config/
│   └── adminPlatform.config.js         (Slice 2)
├── core/
│   ├── featureFlags/
│   │   └── featureFlag.service.js      (Slice 2)
│   └── rbac/
│       ├── rbac.service.js             (Slice 3 NEW)
│       └── rbac.middleware.js          (Slice 3 NEW)
├── platform/
│   ├── controllers/
│   │   └── platform.admin.controller.js (Slice 2)
│   └── routes/
│       └── platform.admin.routes.js    (Slice 2)
├── rbac/
│   ├── controllers/
│   │   └── rbac.admin.controller.js    (Slice 3 NEW)
│   └── routes/
│       └── rbac.admin.routes.js        (Slice 3 NEW)
└── index.js                            (Slice 2, modified in Slice 3)
```

---

## 11. Migration Plan

### 11.1 Migration File

**`backend/migrations/053_admin_rbac.sql`**

This filename matches the existing `run-admin-migration.js` whitelist entry `"053_admin_rbac.sql"` (B1 patch). Slot 052 (`052_admin_accounts.sql`) remains reserved for a future admin accounts table per the original architecture plan.

Execution sequence within the file:

1. `CREATE TABLE IF NOT EXISTS admin_roles`
2. `CREATE TABLE IF NOT EXISTS admin_permissions`
3. `CREATE TABLE IF NOT EXISTS admin_role_permissions` (FKs to admin_roles and admin_permissions)
4. `CREATE TABLE IF NOT EXISTS admin_user_roles` (FK to admin_roles only)
5. `INSERT IGNORE INTO admin_roles` (4 seed roles)
6. `INSERT IGNORE INTO admin_permissions` (20 seed permissions)
7. `INSERT IGNORE INTO admin_role_permissions` (seed assignments for moderator, analyst, operator)

All DDL statements use `IF NOT EXISTS` (idempotent).  
All seed DML statements use `INSERT IGNORE` (idempotent).

### 11.2 Rollback File

**`backend/migrations/053_admin_rbac.rollback.sql`**

Drop in FK-safe order (child tables before parent):
1. `DROP TABLE IF EXISTS admin_user_roles`
2. `DROP TABLE IF EXISTS admin_role_permissions`
3. `DROP TABLE IF EXISTS admin_permissions`
4. `DROP TABLE IF EXISTS admin_roles`

Then: `DELETE FROM schema_migrations WHERE filename = '053_admin_rbac.sql';`

### 11.3 Migration Execution

```bash
npm run migrate:admin:rbac:dry    # Verify dry-run first
npm run migrate:admin:rbac        # Execute
```

New npm scripts to add to `package.json`:
```json
"migrate:admin:rbac": "node scripts/run-admin-migration.js --file 053_admin_rbac.sql",
"migrate:admin:rbac:dry": "node scripts/run-admin-migration.js --file 053_admin_rbac.sql --dry-run"
```

### 11.4 Validation Queries After Migration

```sql
-- Confirm all 4 tables exist
SHOW TABLES LIKE 'admin_%';

-- Confirm seed rows
SELECT COUNT(*) FROM admin_roles;        -- expect 4
SELECT COUNT(*) FROM admin_permissions;  -- expect 20
SELECT COUNT(*) FROM admin_role_permissions; -- expect >= 10 (varies per role assignment)
SELECT COUNT(*) FROM admin_user_roles;   -- expect 0 (no initial assignments)

-- Confirm schema_migrations tracking row
SELECT * FROM schema_migrations WHERE filename = '053_admin_rbac.sql';

-- Confirm FK constraints exist
SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('admin_role_permissions', 'admin_user_roles');
```

### 11.5 Migration Safety Properties

- **Additive only:** no `ALTER TABLE`, no `DROP`, no `MODIFY COLUMN` on any existing table
- **Idempotent:** `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` — safe to run twice
- **No implicit coupling:** FK constraints only between new tables
- **Transactional:** wrapped in `BEGIN/COMMIT` by the migration runner (with DDL implicit-commit caveat — each `CREATE TABLE` commits automatically; the runner logs per-statement)
- **Migration number gap:** 053 is below 055 (feature flags). The migration runner whitelist order is explicit (not filesystem alpha order). Running 053 after 055 is already deployed is safe — the runner only skips already-recorded filenames, regardless of numeric order in the whitelist.

---

## 12. Rollout Plan

### 12.1 Pre-Deploy Checks

```bash
# Verify Slice 1 and Slice 2 are deployed
node scripts/run-admin-migration.js --check
# Expected: schema_migrations exists, 055_admin_feature_flags.sql is recorded

# Verify ADMIN_RBAC_ENABLED is false in running process
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/platform/features | jq .rbacEnabled
# Expected: false

# Verify no existing admin:rbac:* keys in Redis
redis-cli KEYS "admin:rbac:*"
# Expected: (empty)

# Syntax check
node --check backend/modules/admin/core/rbac/rbac.service.js
node --check backend/modules/admin/core/rbac/rbac.middleware.js
node --check backend/modules/admin/rbac/routes/rbac.admin.routes.js
node --check backend/modules/admin/index.js
node --check backend/server.js
```

### 12.2 Deployment Order

```
Step 1: Run migration dry-run
  npm run migrate:admin:rbac:dry

Step 2: Run migration
  npm run migrate:admin:rbac
  → Validate with queries in §11.4

Step 3: Deploy backend code (no PM2 restart yet)
  git pull origin main
  node --check backend/server.js

Step 4: PM2 restart
  pm2 restart api --update-env

Step 5: Smoke test (RBAC still disabled)
  GET /api/admin/rbac/roles → expect 404 (RBAC feature flag is false)
  GET /api/admin/platform/features → expect 200 { rbacEnabled: false }
  GET /api/admin/shops → expect 200 (existing route unaffected)

Step 6: Storefront smoke test
  Verify storefront pages load normally
  Verify wildcard subdomains respond
  Verify RFQ flows unaffected
```

### 12.3 RBAC Activation (Separate, Later)

After Slice 3 is deployed and validated, RBAC can be activated independently:

```bash
# Option A: DB toggle (takes effect within 60s via Redis TTL)
UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_RBAC_ENABLED';

# Option B: ENV + restart (immediate)
# Set ADMIN_RBAC_ENABLED=true in .env, then pm2 restart api

# After activation, assign initial admin roles:
INSERT INTO admin_user_roles (admin_id, role_id, granted_by)
VALUES (<your_admin_id>, (SELECT id FROM admin_roles WHERE role_name = 'superadmin'), NULL);
```

**Activation pre-requisite:** At least one admin must be assigned a role before activation, or all existing RBAC-protected routes will 403 (superadmin role assignment is the safe first step).

---

## 13. Rollback Plan

### 13.1 Trigger Conditions

Rollback is mandatory if any of the following occur after deployment:

- `server.js` fails to start (syntax/import error from new modules)
- Existing admin routes start returning errors
- Storefront requests degraded (any impact at all)
- Redis RBAC cache growth anomaly detected
- DB query error on RBAC tables affecting other queries

### 13.2 Code Rollback

```bash
# Revert server.js and index.js changes
git revert HEAD --no-edit
pm2 restart api --update-env

# Verify
GET /api/admin/shops → expect 200
GET /api/admin/platform/features → expect 200
```

### 13.3 Migration Rollback

```bash
# Execute rollback SQL
mysql -u $DB_USER -p $DB_NAME < backend/migrations/053_admin_rbac.rollback.sql

# Remove tracking row
mysql -u $DB_USER -p $DB_NAME -e \
  "DELETE FROM schema_migrations WHERE filename = '053_admin_rbac.sql';"

# Verify
mysql -u $DB_USER -p $DB_NAME -e "SHOW TABLES LIKE 'admin_%';"
# Expected: only admin_feature_flags (from Slice 2)
```

### 13.4 What Rollback Does NOT Require

- No changes to `admin` table (never modified)
- No changes to existing auth middleware
- No storefront or RFQ changes
- No frontend changes (RBAC has no frontend component in Slice 3)
- No .env changes (ADMIN_RBAC_ENABLED=false already set in Slice 2)

---

## 14. Risk Analysis

### R1 — Startup Crash from Import Error (HIGH RISK, mitigated)

**Risk:** If `rbac.service.js` or `rbac.middleware.js` has an import path error or syntax error, `server.js` fails to start entirely, taking down the entire API.

**Mitigation:**
- `node --check` on all new files before PM2 restart
- Verify barrel export syntax: `node -e "import('./modules/admin/index.js').then(m => console.log(Object.keys(m)))"`
- Stage on a dev environment or test branch before production deploy
- PM2 restart is instantaneous and restores the previous process on crash

### R2 — RBAC Blocks All Admin Access After Activation (HIGH RISK, mitigated)

**Risk:** If RBAC is activated (`ADMIN_RBAC_ENABLED=true`) before any admin has been assigned a superadmin role, ALL RBAC-protected routes will 403 for everyone.

**Mitigation:**
- §12.3 explicitly requires role assignment BEFORE activation
- Activation procedure includes a `admin_user_roles` INSERT as a prerequisite
- Existing routes (shops, rfq, etc.) are unaffected by RBAC activation — they use `requireAdmin` only

### R3 — Redis RBAC Cache Poisoning (MEDIUM RISK, mitigated)

**Risk:** A DB query returns stale/incorrect data (e.g., during a role change), gets cached, and grants access incorrectly for up to 5 minutes.

**Mitigation:**
- Role assignment/revocation API (Slice 3) calls `invalidateAdminRbacCache(adminId)` immediately after DB write
- 5-minute TTL is the absolute worst case for a missed invalidation
- `is_superadmin` changes (highest risk) also trigger full prefix invalidation

### R4 — Missing Role Assignment After RBAC Activation (HIGH RISK, operational)

**Risk:** RBAC is enabled in production before any admin has roles assigned.

**Mitigation:**
- Documented explicitly in §12.3
- Before enabling, verify: `SELECT COUNT(*) FROM admin_user_roles WHERE admin_id = <your_id>;` > 0

### R5 — MySQL `LEFT JOIN` Returns NULL permission_key for Superadmin (LOW RISK, handled)

**Risk:** The `getAdminRbac` DB query uses `LEFT JOIN` which returns a row with `permission_key = NULL` for a superadmin who has no permission rows. For an admin with BOTH a superadmin role and a regular role, the `is_superadmin = 1` value only appears in the NULL `permission_key` group of the `GROUP BY` result — not in the regular permission rows. If only non-null rows are checked for `is_superadmin`, the superadmin status is silently missed.

**Mitigation (C1 patch):**
- The service iterates ALL rows from the query result, including NULL `permission_key` rows
- `isSuperadmin` is set to `true` if ANY row across the full result set has `is_superadmin = 1`
- NULL `permission_key` rows are excluded only from the permissions Set (not from the `isSuperadmin` check)
- Explicit iteration contract documented in §6.2

### R6 — Express 5 Router Pattern (LOW RISK, same fix as Slice 2)

**Risk:** Using `router.use("*", handler)` in `rbac.admin.routes.js` would cause startup crash.

**Mitigation:** Same fix as Slice 2 — use `router.use(handler)` without a path argument.

### R7 — Double-Nested Array for mysql2 IN() (LOW RISK, pre-learned)

**Risk:** If `hasPermission` or bulk queries use `WHERE admin_id IN (?)` with a plain array, mysql2 may produce incorrect SQL.

**Mitigation:** For single-value queries, use `WHERE admin_id = ?`. For bulk queries (if any), use `[arrayOfIds]` double-nested. All `admin_id` lookups in Slice 3 are single-value (one admin per request), so `WHERE admin_id = ?` is always correct.

### R8 — `requirePermission` Called Without Prior `requireAdmin` (MEDIUM RISK, design constraint)

**Risk:** If a future route accidentally uses only `requirePermission` without `requireAdmin`, a shop-role JWT could attempt to resolve RBAC for a non-admin user, causing incorrect DB lookups.

**Mitigation:**
- JSDoc on `requirePermission` explicitly states "MUST be preceded by requireAuth + requireAdmin"
- The middleware performs a defensive role check: `if (req.user.role !== "admin") return 403` before RBAC lookup (step 2 in §7.2 execution flow)
- This makes the middleware self-defensive even if incorrectly ordered

### R9 — Privilege Escalation via `rbac:manage` (HIGH RISK, mitigated)

**Risk (C2):** An admin holding `rbac:manage` can invoke `POST /api/admin/rbac/admins/:adminId/roles` to assign themselves the `superadmin` role, bypassing all future permission checks and effectively gaining unrestricted access to the admin platform.

**Mitigation:**
- Controller-level guard in `rbac.admin.controller.js`: before inserting into `admin_user_roles`, check if the target role has `is_superadmin = 1`. If yes, verify the requesting admin is themselves a superadmin via `getAdminRbac(req.user.id).isSuperadmin`. If not, reject with 403.
- Only `superadmin → superadmin` assignment is permitted; `rbac:manage` alone is insufficient for superadmin elevation.
- Documented in §4.4 and §9.2.

### R10 — Last-Superadmin Lockout (HIGH RISK, mitigated)

**Risk (C5):** If all superadmin role assignments are revoked (either via the RBAC API or direct DB operation), no admin can access RBAC-protected routes via the API. There is no self-recovery path inside the running application — a direct DB operation is required.

**Mitigation:**
- Controller-level guard in `rbac.admin.controller.js` for role revocation: before deleting from `admin_user_roles`, if the role has `is_superadmin = 1`, count remaining superadmin assignments excluding this one. If count would drop to 0, reject with 403.
- Direct DB recovery procedure documented in §9.2.
- The guard covers the API path. Direct DB manipulation (outside the API) bypasses all guards — this is an operational risk that cannot be fully prevented but is documented.

---

## 15. Dangerous Coupling Analysis

### 15.1 Coupling to `isFeatureEnabled` (Slice 2)

`rbac.middleware.js` calls `isFeatureEnabled("ADMIN_RBAC_ENABLED")` to check whether RBAC is active. This means:
- If Slice 2's feature flag service returns `false` (flag is off), RBAC middleware calls `next()` — correct behavior
- **B3 patch:** If `isFeatureEnabled` throws an unexpected error, the middleware does NOT silently call `next()`. It falls back to `adminPlatformConfig.rbacEnabled` (the ENV value), which is the correct safe fallback. When `ADMIN_RBAC_ENABLED=false` in ENV (the default), this produces the same result as a normal `false` return. When `ADMIN_RBAC_ENABLED=true` in ENV, RBAC protection is preserved through the error.
- Failure mode: `isFeatureEnabled` has its own internal try/catch (Slice 2 design); it only throws on programming errors, not on Redis/DB unavailability. The middleware's outer try/catch is a final safety net.
- No circular dependency: rbac.middleware → featureFlag.service → redisCache.service → (no rbac)

### 15.2 Coupling to `redisCache.service.js`

RBAC cache uses the same `getRaw`/`setRaw`/`invalidateByLogicalPrefix` API as feature flags.
- Single Redis client (lazy singleton in `redisCache.service.js`)
- If Redis is unavailable, both feature flags AND RBAC fall back to DB — this is the intended design
- There is no cross-contamination between `admin:ff:*` and `admin:rbac:*` prefixes

### 15.3 Coupling to `admin` Table

`admin_user_roles.admin_id` references `admin.id` logically but not via FK.
- If an `admin` row is deleted (which the current codebase does not support), orphaned `admin_user_roles` rows remain
- This is not dangerous for correctness — the orphaned rows simply never match a login token
- It IS a data hygiene issue — documented for future admin account management (Slice 5+)

### 15.4 No Coupling to Storefront

RBAC service and middleware are only imported by:
1. `rbac.admin.routes.js` → mounted under `/api/admin/rbac`
2. Future admin domain routes (not storefront-facing)

No storefront route, middleware, or SSR path imports or depends on RBAC modules.

### 15.5 No Coupling to RFQ Domain

The RFQ admin routes (`/api/admin/rfq`) continue to use `requireAdmin` only. RBAC is not applied to them in Slice 3. Future Slice (5+) could add `requirePermission("rfq:admin:write")` to those routes — that is a forward concern, not a Slice 3 concern.

### 15.6 No Coupling to SEO or Wildcard Infrastructure

RBAC modules are entirely in the admin namespace. No SEO helpers, no wildcard subdomain logic, no storefront rendering pipeline imports them.

---

## 16. Implementation Phases

### Slice 3 Scope (This Slice)

- [ ] Migration 053 (`053_admin_rbac.sql`): 4 RBAC tables + seeds
- [ ] `rbac.service.js`: `getAdminRbac`, `hasPermission`, `invalidateAdminRbacCache`
- [ ] `rbac.middleware.js`: `requirePermission(key)` factory
- [ ] `rbac.admin.controller.js`: read-only role/permission list + admin role management
- [ ] `rbac.admin.routes.js`: 5 routes, feature-flag gated, `export default router`
- [ ] `admin/index.js`: add `rbacRouter`, `rbac.service` exports
- [ ] `server.js`: add `rbacRouter` mount
- [ ] `package.json`: add `migrate:admin:rbac` scripts

### Excluded from Slice 3

| Feature | Future Slice |
|---|---|
| Frontend RBAC admin UI | Slice 5 |
| Apply `requirePermission` to existing routes | Slice 5 (post full admin UI) |
| Admin account management (create/suspend admins) | Slice 5 |
| Audit log integration on permission changes | Slice 4 |
| Per-resource RBAC (e.g., per-shop permissions) | Post-MVP |
| RBAC API for bulk role assignment | Slice 5 |

### Open Questions Before Implementation

1. **Seed role assignments:** Should the initial `admin` row (currently in production) be automatically assigned a superadmin role via migration seed? This would require knowing the production admin's `id` — confirm this ID before migration.

2. **RBAC TTL:** 300 s is the proposed default. Confirm this is acceptable for the permission change responsiveness requirement. If same-session permission propagation is required, reduce to 60 s or add explicit cache invalidation on every role change.

3. **Single migration vs split:** This design proposes one migration file (053) for all RBAC tables. The runner whitelist already has `053_admin_rbac.sql` as a single slot. If operations prefers separate rollback granularity per table, a future split would require adding new whitelist entries. Recommendation: keep as single file — the tables are FK co-dependent.

4. **`admin_user_roles` FK omission:** No physical FK from `admin_user_roles.admin_id` to `admin.id`. Confirm this is acceptable vs. adding a soft-reference cleanup trigger in Slice 5.

---

*Document version: 1.1 — Patched per phase-1a-slice3-rbac-review.md findings (B1, B2, B3, C1, C2, C3, C4, C5, C6). Design only. No implementation files generated.*  
*Next step: Implementation plan.*
