# Otofine Admin Platform — Phase 1A Slice 3: RBAC Foundation
## Final File-Level Review

**Status:** REVIEW ONLY — no files written  
**Date:** 2026-05-27  
**Source reviewed:** `phase-1a-slice3-files.md`  
**Cross-referenced against:** `phase-1a-slice3-rbac-design.md`, `phase-1a-slice3-rbac-review.md`, `phase-1a-slice3-rbac-final-review.md`, `phase-1a-slice3-rbac-implementation-plan.md`

---

## Summary

| Category | Count |
|---|---|
| BLOCKERS | 1 |
| CORRECTIONS | 2 |
| SAFE files | 7 of 9 |
| HIGH-RISK files | 4 |

One blocker is critical to fix before file generation. It is contained to a single file (`rbac.admin.routes.js`) and requires moving ~5 lines of code.

---

## BLOCKERS

### B1 — Startup Gate Registered AFTER Named Routes (Hidden Deployment Failure)

**File:** `backend/modules/admin/rbac/routes/rbac.admin.routes.js`  
**Lines in spec:** Lines ~762–771 (the `if (!adminPlatformConfig.rbacEnabled)` block)

**The problem:**

The startup gate is currently registered in this order:

```javascript
// 1. Named routes registered first
router.get("/roles", requireAuth, requireAdmin, requirePermission("rbac:read"), getRoles);
router.get("/permissions", requireAuth, requireAdmin, requirePermission("rbac:read"), getPermissions);
router.get("/admins/:adminId/roles", requireAuth, requireAdmin, requirePermission("rbac:read"), getAdminRoles);
router.post("/admins/:adminId/roles", requireAuth, requireAdmin, requirePermission("rbac:manage"), assignRole);
router.delete("/admins/:adminId/roles/:roleId", requireAuth, requireAdmin, requirePermission("rbac:manage"), revokeRole);

// 2. Startup gate registered AFTER — WRONG POSITION
if (!adminPlatformConfig.rbacEnabled) {
  router.use((req, res) => {
    return res.status(404).json({ error: "not found" });
  });
}
```

**How Express route matching works:** Express matches routes in registration order. `router.use()` (catch-all) only fires for requests that are NOT matched by any earlier named route. Since `router.get("/roles", ...)` is registered before `router.use()`, any `GET /roles` request matches the named route and NEVER reaches the catch-all.

**Actual behavior with RBAC disabled and a valid admin JWT:**

```
GET /api/admin/rbac/roles
  → rbacRouter
  → Matches router.get("/roles", ...) — named route wins over catch-all
  → requireAuth passes (valid JWT)
  → requireAdmin passes (role = "admin")
  → requirePermission("rbac:read"):
      isFeatureEnabled("ADMIN_RBAC_ENABLED") → false (DB/ENV)
      → !rbacEnabled → calls next()  ← RBAC check bypassed
  → getRoles handler runs → 200 (roles data returned)
```

**The startup gate NEVER fires** for requests matching any of the 5 named routes. It only fires for unmatched paths like `GET /api/admin/rbac/unknown-path`.

**Consequences:**

1. **Hidden deployment guarantee violated:** With RBAC disabled and any valid admin JWT, all 5 RBAC management routes are accessible and return live data. This contradicts the implementation plan's §3.2 ("request NEVER reaches requirePermission or any handler") and §12 ("all new RBAC routes return 404").

2. **Smoke test #3 produces wrong result:** The smoke test expects `404` for `GET /api/admin/rbac/roles` with `ADMIN_TOKEN` when RBAC is disabled. The actual response is `200` (roles data).

3. **Write routes fully open when RBAC disabled:** With RBAC disabled, any authenticated admin can call `POST /api/admin/rbac/admins/:adminId/roles` and assign non-superadmin roles (moderator, analyst, operator) to any admin, with no permission enforcement. The C2 guard (superadmin role only) still fires, but the general `rbac:manage` permission check does not.

**Required fix — move the startup gate BEFORE named routes:**

```javascript
const router = express.Router();

// ── Startup gate (registered FIRST — blocks ALL /api/admin/rbac/* when disabled) ──
// When ADMIN_RBAC_ENABLED=false in ENV at process start, this catch-all fires
// for ALL requests before any named route can match.
// When ADMIN_RBAC_ENABLED=true, this block is not executed — named routes match normally.
if (!adminPlatformConfig.rbacEnabled) {
  router.use((req, res) => {
    return res.status(404).json({ error: "not found" });
  });
}

// ── Read routes (rbac:read) ──────────────────────────────────────────────────
// Reachable only when ADMIN_RBAC_ENABLED=true at startup.
router.get(
  "/roles",
  requireAuth, requireAdmin, requirePermission("rbac:read"),
  getRoles,
);
// ... remaining routes
```

**Why this is safe:** When `rbacEnabled=true` at startup, the `if` block does NOT execute, so NO catch-all is registered. All named routes match normally. When `rbacEnabled=false`, the catch-all IS registered first and ALL requests return 404 — no named route is ever consulted. This achieves the true hidden-deployment semantics.

**Implementation plan consistency:** Plan §3.2 states "request NEVER reaches requirePermission or any handler" when RBAC is disabled. This is only achievable with the gate BEFORE named routes.

**Express 5 compatibility:** `router.use((req, res) => {...})` (no wildcard) — unchanged, still Express 5 safe.

---

## CORRECTIONS

### C1 — `assignRole` Returns 201 for Idempotent Re-Assignment

**File:** `backend/modules/admin/rbac/controllers/rbac.admin.controller.js`  
**Lines in spec:** The `INSERT IGNORE` block in `assignRole`

**The issue:**

```javascript
// DB write: INSERT IGNORE prevents duplicate-assignment errors
await pool.query(
  "INSERT IGNORE INTO admin_user_roles (admin_id, role_id, granted_by) VALUES (?, ?, ?)",
  [adminId, roleId, req.user.id],
);

// C2 final-review: invalidate AFTER successful DB write (fire-and-forget)
invalidateAdminRbacCache(adminId).catch(() => {});

return res.status(201).json({ ok: true, adminId, roleId });
```

When the admin already has the role assigned, `INSERT IGNORE` silently does nothing (`affectedRows = 0`). The code still returns `201 Created` and calls cache invalidation unnecessarily.

**Impact:** Not a security issue. Cache invalidation on a no-op is harmless (fire-and-forget). The 201 vs 200 distinction is a minor semantic imprecision — `201 Created` implies a new resource was created when nothing was.

**Required fix:** Capture the result and return 200 for idempotent re-assignment:

```javascript
const [insertResult] = await pool.query(
  "INSERT IGNORE INTO admin_user_roles (admin_id, role_id, granted_by) VALUES (?, ?, ?)",
  [adminId, roleId, req.user.id],
);

if (insertResult.affectedRows > 0) {
  invalidateAdminRbacCache(adminId).catch(() => {});
}

const statusCode = insertResult.affectedRows > 0 ? 201 : 200;
return res.status(statusCode).json({ ok: true, adminId, roleId });
```

Benefits: correct HTTP semantics, avoids unnecessary cache invalidation on no-ops.

---

### C2 — Smoke Test #3 Expected Value Is Conditional on B1 Fix

**File:** `phase-1a-slice3-files.md` — Runtime Verification Commands section  
**Lines in spec:** Smoke test #3

```bash
# 3. New RBAC routes hidden (startup gate returns 404)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.otofine.com/api/admin/rbac/roles
# Expected: 404
```

**The issue:** This test is only correct AFTER the B1 fix is applied (gate before routes). Without the B1 fix, the expected response is `200` (not `404`) for a valid admin JWT. Once B1 is fixed, the expected `404` is correct.

**Impact:** No code change required — the smoke test is already correct for the intended (fixed) behavior. This is a documentation confirmation, not a code fix. Including here so the implementer understands why the `404` expectation is valid and that it depends on the B1 fix.

---

## File-Level Review Results

### File 1: `053_admin_rbac.sql` — SAFE

| Check | Result |
|---|---|
| CREATE TABLE order: roles → permissions → role_permissions → user_roles | ✓ Correct (FK parents before children) |
| All tables use `CREATE TABLE IF NOT EXISTS` | ✓ |
| `INT UNSIGNED` for all id/fk columns | ✓ |
| `DATETIME(3)` with `CURRENT_TIMESTAMP(3)` | ✓ |
| `UNIQUE KEY` on role_name and permission_key | ✓ |
| FK constraints: `fk_arp_role`, `fk_arp_permission`, `fk_aur_role` | ✓ |
| FK `ON DELETE CASCADE` for join-table FKs | ✓ |
| NO FK from admin_user_roles.admin_id to admin.id | ✓ (C4 correct) |
| admin_user_roles starts empty (no seed rows) | ✓ |
| Seed roles: 4 rows (INSERT IGNORE) | ✓ (superadmin, moderator, analyst, operator) |
| Seed permissions: 20 rows (INSERT IGNORE) | ✓ (counted: 3+1+2+2+2+2+1+2+2+2+1=20) |
| Seed role-permission: 14 rows via subquery pattern | ✓ (5 mod + 4 analyst + 5 operator) |
| Subquery pattern avoids hardcoded AUTO_INCREMENT IDs | ✓ |
| superadmin has ZERO rows in admin_role_permissions | ✓ |
| `INSERT IGNORE INTO ... SELECT ...` — no rows if refs missing (impossible here — seeded first) | ✓ |

---

### File 2: `053_admin_rbac.rollback.sql` — SAFE

| Check | Result |
|---|---|
| Drop order: admin_user_roles → admin_role_permissions → admin_permissions → admin_roles | ✓ (child before parent) |
| `DROP TABLE IF EXISTS` — safe to run even if tables don't exist | ✓ |
| Removes tracking row from schema_migrations | ✓ |
| Does NOT drop admin_feature_flags or schema_migrations tables | ✓ |

---

### File 3: `rbac.service.js` — SAFE

| Check | Result |
|---|---|
| Import paths verified: `../../../../services/redisCache.service.js` | ✓ (matches featureFlag.service.js convention) |
| Import paths verified: `../../../../config/db.js` | ✓ (matches featureFlag.service.js convention) |
| `RBAC_CACHE_TTL_MS = 300_000` | ✓ (not 300 or 60) |
| Cache key: `` `admin:rbac:${adminId}:perms` `` | ✓ (B2 format) |
| Redis try/catch wraps `getRaw` — falls through to DB on error | ✓ |
| DB query uses LEFT JOIN to capture NULL-permission_key superadmin rows | ✓ |
| C1 iteration: `for (const row of rows)` checks `is_superadmin` on ALL rows | ✓ |
| C1 iteration: only non-null `permission_key` values added to Set | ✓ |
| Cache write: fire-and-forget after DB query | ✓ |
| DB error catch: returns `{ permissions: new Set(), isSuperadmin: false }` — deny-safe | ✓ |
| `JSON.stringify({ permissions: [...permissions], isSuperadmin })` — serializable | ✓ |
| Cache hit: converts array back to `new Set()` | ✓ |
| `invalidateAdminRbacCache`: `adminId != null` (loose equality — catches both null and undefined) | ✓ |
| Per-admin prefix: `` `admin:rbac:${adminId}:` `` — colon-terminated (B2) | ✓ |
| Bulk prefix: `"admin:rbac:"` | ✓ |
| `GROUP BY p.permission_key` satisfies MySQL ONLY_FULL_GROUP_BY | ✓ (only p.permission_key in SELECT non-aggregate) |

---

### File 4: `rbac.middleware.js` — SAFE

| Check | Result |
|---|---|
| Import path: `"../featureFlags/featureFlag.service.js"` | ✓ (from core/rbac/ → core/featureFlags/) |
| Import path: `"../../config/adminPlatform.config.js"` | ✓ (from core/rbac/ → admin/config/) |
| Import path: `"./rbac.service.js"` | ✓ (same directory) |
| `requirePermission(permissionKey)` is a factory function | ✓ |
| Inner function is `async` | ✓ |
| `isFeatureEnabled` wrapped in try/catch — B3 ENV fallback on error | ✓ |
| `!rbacEnabled` → `next()` (requireAdmin already verified role) | ✓ |
| Defensive check: `req.user.role !== "admin"` → 403 | ✓ |
| Defensive check: `!req.user.id` → 401 | ✓ |
| `req.adminPermissionChecked = permissionKey` set BEFORE `next()` (C3) | ✓ |
| `hasPermission` result false → 403 `{ error, required }` | ✓ |
| `hasPermission` result true → `next()` | ✓ |
| `hasPermission` throws → 500 (programming error only) | ✓ (infra errors absorbed in service) |
| No double-response risk: all branches `return` | ✓ |

---

### File 5: `rbac.admin.controller.js` — SAFE

| Check | Result |
|---|---|
| Import path: `"../../../../config/db.js"` | ✓ (from rbac/controllers/ → backend/) |
| Import path: `"../../core/rbac/rbac.service.js"` | ✓ (from rbac/controllers/ → admin/core/rbac/) |
| `parseInt(req.params.adminId, 10)` — URL params are strings, must parse | ✓ |
| `parseInt(req.body?.roleId, 10)` — optional chaining for body safety | ✓ |
| `!adminId || isNaN(adminId)` guard — correctly rejects NaN, 0, undefined | ✓ |
| `getRoles`: SELECT without WHERE — returns all roles | ✓ |
| `getPermissions`: ORDER BY permission_key ASC — deterministic | ✓ |
| `getAdminRoles`: JOIN query with admin_id param | ✓ |
| `assignRole` C2 guard: role lookup → `is_superadmin` check → `getAdminRbac(req.user.id)` | ✓ |
| C2 guard fires BEFORE INSERT | ✓ |
| `INSERT IGNORE` — duplicate assignment silently skipped | ✓ |
| Cache invalidation: `invalidateAdminRbacCache(adminId).catch(() => {})` AFTER INSERT | ✓ |
| `revokeRole` C5 guard: role lookup → `is_superadmin` check → COUNT remaining | ✓ |
| C5 COUNT query: `NOT (aur.admin_id = ? AND aur.role_id = ?)` — correctly excludes the target row | ✓ |
| C5 guard fires BEFORE DELETE | ✓ |
| `result.affectedRows === 0` → 404 "Assignment not found" | ✓ |
| Cache invalidation: AFTER DELETE and AFTER affectedRows check | ✓ |
| All handlers wrapped in try/catch → 500 | ✓ |
| No double-response: all branches `return` | ✓ |

**Minor issue (C1 correction):** `assignRole` returns 201 even when `INSERT IGNORE` does nothing (idempotent re-assignment). See C1 above.

---

### File 6: `rbac.admin.routes.js` — BLOCKER (B1)

| Check | Result |
|---|---|
| `import express from "express"` | ✓ |
| `"../../../../middlewares/auth.js"` | ✓ (from rbac/routes/ → backend/middlewares/) |
| `"../../core/rbac/rbac.middleware.js"` | ✓ (from rbac/routes/ → admin/core/rbac/) |
| `"../../config/adminPlatform.config.js"` | ✓ (from rbac/routes/ → admin/config/) |
| `"../controllers/rbac.admin.controller.js"` | ✓ (sibling rbac/ directory) |
| `router.use((req, res) => ...)` — no wildcard (Express 5 safe) | ✓ |
| `export default router` present | ✓ |
| Middleware order: requireAuth → requireAdmin → requirePermission | ✓ |
| All 5 handlers imported and applied | ✓ |
| **Startup gate position: registered AFTER named routes** | ✗ **BLOCKER B1** |

**Required structure change — see B1 above.**

---

### File 7: `admin/index.js` — SAFE

| Check | Result |
|---|---|
| All 8 Slice 2 exports preserved exactly | ✓ |
| `platformRouter`, `isFeatureEnabled`, `getAllFlagStates`, `invalidateFlagCache` | ✓ |
| `adminPlatformConfig`, `FLAG_KEY_MAP`, `ALL_FLAG_KEYS`, `FLAG_CACHE_TTL_MS` | ✓ |
| `export { default as rbacRouter }` from correct path | ✓ |
| `getAdminRbac`, `hasPermission`, `invalidateAdminRbacCache`, `RBAC_CACHE_TTL_MS` | ✓ |
| `requirePermission` export from correct path | ✓ |
| No naming collision between `FLAG_CACHE_TTL_MS` and `RBAC_CACHE_TTL_MS` | ✓ |
| No circular imports | ✓ |

---

### File 8: `server.js` (changes only) — SAFE

| Check | Result |
|---|---|
| Line 54 import extended from `{ platformRouter }` to `{ platformRouter, rbacRouter }` | ✓ |
| New mount `app.use("/api/admin/rbac", rbacRouter)` added AFTER existing platform mount | ✓ |
| No existing app.use line removed or reordered | ✓ |
| Route collision: `/api/admin/rbac` vs `/api/admin` (admin.routes.js) | ✓ No collision — sub-path |
| Route collision: `/api/admin/rbac` vs `/api/admin/platform` | ✓ No collision |

---

### File 9: `package.json` (changes only) — SAFE

| Check | Result |
|---|---|
| `migrate:admin:rbac` — correct file arg `053_admin_rbac.sql` | ✓ |
| `migrate:admin:rbac:dry` — correct `--dry-run` flag | ✓ |
| Filename matches whitelist entry in `run-admin-migration.js` | ✓ (`053_admin_rbac.sql` already present) |
| No existing scripts removed or modified | ✓ |

---

## Import Path Verification Matrix

| File | Import | Resolved path | Status |
|---|---|---|---|
| `rbac.service.js` | `../../../../services/redisCache.service.js` | `backend/services/redisCache.service.js` | ✓ |
| `rbac.service.js` | `../../../../config/db.js` | `backend/config/db.js` | ✓ |
| `rbac.middleware.js` | `../featureFlags/featureFlag.service.js` | `backend/modules/admin/core/featureFlags/featureFlag.service.js` | ✓ |
| `rbac.middleware.js` | `../../config/adminPlatform.config.js` | `backend/modules/admin/config/adminPlatform.config.js` | ✓ |
| `rbac.middleware.js` | `./rbac.service.js` | `backend/modules/admin/core/rbac/rbac.service.js` | ✓ |
| `rbac.admin.controller.js` | `../../../../config/db.js` | `backend/config/db.js` | ✓ |
| `rbac.admin.controller.js` | `../../core/rbac/rbac.service.js` | `backend/modules/admin/core/rbac/rbac.service.js` | ✓ |
| `rbac.admin.routes.js` | `../../../../middlewares/auth.js` | `backend/middlewares/auth.js` | ✓ |
| `rbac.admin.routes.js` | `../../core/rbac/rbac.middleware.js` | `backend/modules/admin/core/rbac/rbac.middleware.js` | ✓ |
| `rbac.admin.routes.js` | `../../config/adminPlatform.config.js` | `backend/modules/admin/config/adminPlatform.config.js` | ✓ |
| `rbac.admin.routes.js` | `../controllers/rbac.admin.controller.js` | `backend/modules/admin/rbac/controllers/rbac.admin.controller.js` | ✓ |
| `admin/index.js` | `./rbac/routes/rbac.admin.routes.js` | `backend/modules/admin/rbac/routes/rbac.admin.routes.js` | ✓ |
| `admin/index.js` | `./core/rbac/rbac.service.js` | `backend/modules/admin/core/rbac/rbac.service.js` | ✓ |
| `admin/index.js` | `./core/rbac/rbac.middleware.js` | `backend/modules/admin/core/rbac/rbac.middleware.js` | ✓ |

All 14 import paths resolve correctly.

---

## HIGH-RISK FILES

### HR1 — `backend/modules/admin/rbac/routes/rbac.admin.routes.js`

Contains the B1 blocker (startup gate position). Also the highest syntactic risk — route registration errors, wrong middleware order, missing `export default`, or wrong catch-all pattern all produce either silent mis-behavior or startup crashes.

**Required changes before generation:**
- Move startup gate block to BEFORE named route registrations

### HR2 — `backend/modules/admin/index.js`

Barrel modification. A missing export name, wrong path, or syntax error breaks ALL admin module imports in `server.js` — including `platformRouter` (Slice 2). This is the highest blast-radius file for startup failures.

**Mitigation:** Barrel import verification script must pass before PM2 restart.

### HR3 — `backend/server.js`

Any error in the import or `app.use` addition causes a startup crash that takes down the entire API (storefront, RFQ, seller, admin — all endpoints). The change is minimal (1 line modified + 1 line added) but must be applied exactly.

**Mitigation:** `node --check backend/server.js` before PM2 restart.

### HR4 — `backend/modules/admin/core/rbac/rbac.service.js`

The most security-critical new file. Errors in:
- C1 iteration → superadmin undetected → bypass broken
- Cache key format → wrong admin's data served
- TTL constant → permissions expire in milliseconds
- Invalidation prefix → stale data for 5 minutes after role changes

---

## Pre-Generation Patch Required

### Corrected `rbac.admin.routes.js` structure

The spec for File 6 must be replaced with the following structure. All other content (imports, route definitions, export) remains identical — only the **position of the startup gate** changes:

```javascript
// ... imports unchanged ...

const router = express.Router();

// ── Startup gate (MUST be registered BEFORE named routes) ──────────────────
// When ADMIN_RBAC_ENABLED=false in ENV at process start, this handler fires
// for ALL requests to this router — no named route below is consulted.
// When ADMIN_RBAC_ENABLED=true, this block does NOT execute — named routes match.
// Express 5 safe: router.use(handler) with no path argument.
if (!adminPlatformConfig.rbacEnabled) {
  router.use((req, res) => {
    return res.status(404).json({ error: "not found" });
  });
}

// ── Read routes (rbac:read) ──────────────────────────────────────────────────
// Reachable only when adminPlatformConfig.rbacEnabled = true at startup.

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

**What changed:** The `if (!adminPlatformConfig.rbacEnabled)` block moved from after `router.delete(...)` to immediately after `const router = express.Router()`. No other changes.

### Corrected `assignRole` in `rbac.admin.controller.js` (C1)

Replace the INSERT block with:

```javascript
// DB write: INSERT IGNORE prevents duplicate-assignment errors
const [insertResult] = await pool.query(
  "INSERT IGNORE INTO admin_user_roles (admin_id, role_id, granted_by) VALUES (?, ?, ?)",
  [adminId, roleId, req.user.id],
);

// Invalidate only on actual insert (affectedRows=0 means already assigned — no-op)
if (insertResult.affectedRows > 0) {
  invalidateAdminRbacCache(adminId).catch(() => {});
}

const statusCode = insertResult.affectedRows > 0 ? 201 : 200;
return res.status(statusCode).json({ ok: true, adminId, roleId });
```

---

## Checklist Before File Generation

- [ ] B1 fix confirmed: startup gate moved to BEFORE named routes in `rbac.admin.routes.js`
- [ ] C1 fix confirmed: `assignRole` uses `insertResult.affectedRows` to gate invalidation and select 201 vs 200
- [ ] All import paths verified against matrix above (14/14 ✓)
- [ ] Barrel exports verified: all 8 Slice 2 exports preserved + 6 new Slice 3 exports
- [ ] `export default router` confirmed in `rbac.admin.routes.js`
- [ ] `router.use((req, res) => ...)` — no wildcard — confirmed
- [ ] `RBAC_CACHE_TTL_MS = 300_000` confirmed (not 300 or 60)
- [ ] Cache key `admin:rbac:${adminId}:perms` confirmed (colon after adminId)
- [ ] Per-admin invalidation prefix: `admin:rbac:${adminId}:` (colon-terminated)
- [ ] `req.adminPermissionChecked` set before `next()` confirmed
- [ ] B3 ENV fallback on `isFeatureEnabled` error confirmed
- [ ] C2 escalation guard fires before INSERT confirmed
- [ ] C5 lockout guard fires before DELETE confirmed
- [ ] All modifications to existing files are additive only
- [ ] No existing route mounts in server.js removed or reordered

---

*Document version: 1.0 — Final file-level review only. No implementation files generated.*  
*Next step: Apply B1 + C1 patches to `phase-1a-slice3-files.md`, then generate real implementation files.*
