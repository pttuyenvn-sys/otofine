# Otofine Admin Platform — Phase 1A Slice 3: RBAC Foundation
## Final Implementation Review

**Status:** REVIEW ONLY — no implementation  
**Date:** 2026-05-27  
**Reviews:** `phase-1a-slice3-rbac-implementation-plan.md`  
**Cross-checked against:** `phase-1a-slice3-rbac-design.md` v1.1, `phase-1a-slice3-rbac-review.md`, `redisCache.service.js`, `run-admin-migration.js`, `auth.middleware.js`, `featureFlag.service.js`

---

## Summary

| Category | Count |
|---|---|
| BLOCKERS | 0 |
| CORRECTIONS | 3 |
| SAFE areas confirmed | 14 |
| HIGH-RISK files | 5 |

No blockers found. Three corrections are needed before file generation. All critical prior review findings (B1–B3, C1–C6) are correctly reflected in the plan.

---

## BLOCKERS

None.

---

## CORRECTIONS

### C1 — Dual-Failure Response Code Inconsistency Between §3.4 and §6.2

**Location:** Plan §3.4 (runtime flow diagram) vs §6.2 (implementation contract)  
**Impact:** Implementer confusion; could cause incorrect monitoring expectations or incorrect 500-handling in the controller.

**The inconsistency:**

Plan §3.4 states:
> "requirePermission returns 500 (infrastructure error, not 403) — Both Redis AND DB unavailable is an infra error, not an authz decision"

But the actual execution path from §6.2 and §5.1 is:

1. `hasPermission` calls `getAdminRbac(adminId)`
2. `getAdminRbac` has its own internal try/catch around the DB query (documented in §5.1 step 5): on DB error, it logs a warning and **returns** `{ permissions: new Set(), isSuperadmin: false }` — it does NOT throw
3. `hasPermission` receives this result → `isSuperadmin: false` → `permissions.has(key): false` → returns `false`
4. In `requirePermission` §6.2 step 4: `allowed = false` → returns `403 { error: "Forbidden", required: permissionKey }` — NOT 500

The `500` path in §6.2 step 4 (`catch (err) → 500`) is only reachable if `hasPermission` itself throws an uncaught exception (a programming error), not an infrastructure failure. Infrastructure failures are absorbed by `getAdminRbac`'s internal try/catch and converted to a silent empty-result deny.

**The actual dual-failure behavior:** `403` (deny via empty permissions Set). This is correct and safe — an infrastructure failure results in a deterministic access denial. The `503 Service Unavailable` or `500` would be appropriate for an infrastructure monitor/health-check, not for an authorization middleware.

**Required fix:** The description in §3.4 that says "requirePermission returns 500" is inaccurate. The implementation must follow §6.2 exactly. The flow in §3.4 should state:

```
→ return { permissions: new Set(), isSuperadmin: false }  (no throw)
→ hasPermission returns false
→ requirePermission returns 403 (deny — empty permissions, not an infra signal)
```

The distinction matters for implementation: the developer should NOT add special try/catch handling in `requirePermission` expecting infrastructure errors from `hasPermission` to throw. They are absorbed internally. The only 500 path is a genuine programming error.

**Implementation constraint:** Do not add special DB-error logic in `requirePermission`. Trust that `getAdminRbac` (§5.1) absorbs infrastructure errors. The `hasPermission` call in step 4 of `requirePermission` is wrapped in try/catch for programming errors only.

---

### C2 — Cache Invalidation Ordering Not Specified for Controller

**Location:** Plan §4.4 (invalidation matrix), §14.3 (controller guard verification)  
**Impact:** If `invalidateAdminRbacCache` is called before the DB write, a race condition can leave a re-cached stale value for up to 300s. If called concurrently with the DB write, the old cached value survives the window between invalidation and write commit.

**The gap:** The plan specifies WHAT to invalidate after a role change but not the MANDATORY ORDERING. The controller implementation must follow this exact sequence:

For `assignRole` (POST /admins/:adminId/roles):
```
1. Validate request body (roleId exists, valid format)
2. C2 escalation guard check (is target role is_superadmin? is requester superadmin?)
3. INSERT INTO admin_user_roles ... (DB write)
4. On INSERT success ONLY: invalidateAdminRbacCache(adminId) [fire-and-forget]
5. Return 201 or 200
```

For `revokeRole` (DELETE /admins/:adminId/roles/:roleId):
```
1. C5 last-superadmin guard check (count remaining superadmins excluding this row)
2. DELETE FROM admin_user_roles ... (DB write)
3. On DELETE success ONLY: invalidateAdminRbacCache(adminId) [fire-and-forget]
4. Return 200
```

**Required constraint:** `invalidateAdminRbacCache` must be called:
- After a successful DB write (not before, not concurrently)
- As fire-and-forget (`.catch(() => {})`) — invalidation failure must not fail the HTTP response
- With the specific `adminId` (not null/bulk) for role-assignment changes
- With null (bulk) only when role-level changes affect all holders (not applicable in Slice 3 controller scope — Slice 3 only does per-admin assignment, not role definition changes)

**Add this ordering constraint to the implementation spec** to prevent the invalidation-before-write mistake.

---

### C3 — Barrel Import Verification Script Missing Working-Directory Constraint

**Location:** Plan §11.2 (barrel import verification)  
**Impact:** The dynamic import check silently fails if run from the wrong directory, giving a false "IMPORT FAILED" result that blocks deployment unnecessarily, or is dismissed as a false alarm.

**The issue:** The verification script:
```bash
node -e "import('./backend/modules/admin/index.js').then(...)"
```

This uses a relative path resolved from the shell's current working directory (CWD). If run from the project root (`/var/www/otofine`), the path `./backend/modules/admin/index.js` is correct. If run from `backend/`, the path `./backend/modules/admin/index.js` does NOT exist (it should be `./modules/admin/index.js`).

The plan §11.1 syntax check commands use `backend/modules/admin/...` paths (implying they are run from the project root). But the barrel import script is prefixed with `import('./backend/...)` which also implies project-root CWD. This is consistent — but the CWD must be explicitly stated in the pre-deploy checklist.

**Required constraint:** Add to §11.2 and §20 checklist:
```bash
# Must be run from project root (/var/www/otofine):
cd /var/www/otofine
node -e "import('./backend/modules/admin/index.js').then(...)"
```

Or alternatively, use an absolute path:
```bash
node --input-type=module -e "
import '/var/www/otofine/backend/modules/admin/index.js'
  ...
"
```

The existing syntax-check commands in §11.1 (`node --check backend/modules/admin/...`) also require project-root CWD. The pre-deploy checklist in §20 should explicitly state: "All commands in §11 are run from the project root `/var/www/otofine`."

---

## SAFE Areas Confirmed

### S1 — RBAC Fail-Safe (Deny-by-Default)

When RBAC is enabled and both Redis and DB are unavailable:
- `getAdminRbac` catches the DB error internally → returns `{ permissions: new Set(), isSuperadmin: false }`
- `hasPermission` returns `false`
- `requirePermission` returns `403`

No fail-open path exists when RBAC is enabled. **Safe and correct.**

### S2 — Feature Flag Error Handling (B3)

`requirePermission` wraps `isFeatureEnabled` in try/catch. On error, it falls back to `adminPlatformConfig.rbacEnabled` (the ENV value). This correctly handles the case where ENV=true: RBAC protection is preserved even when the feature flag service itself fails. **Correctly specified in §6.2.**

### S3 — Superadmin Bypass with Multi-Role Admins (C1)

The C1 iteration contract in §5.1 correctly handles an admin holding both a superadmin role and a regular role. The `GROUP BY p.permission_key` query produces a NULL-permission_key row that carries `is_superadmin = 1` exclusively (the superadmin role contributes only to this group because it has no admin_role_permissions entries). The iteration checks `is_superadmin` on ALL rows. **Correctly specified.**

### S4 — Cache Key Collision Prevention (B2)

The key format `admin:rbac:{adminId}:perms` with per-admin invalidation prefix `admin:rbac:{adminId}:` correctly prevents numeric prefix collision. Prefix `admin:rbac:7:` only matches `admin:rbac:7:*` — the colon after the numeric ID acts as a delimiter that prevents matching `admin:rbac:70:perms` or `admin:rbac:700:perms`. **Correctly specified in §4.1 and §4.4.**

### S5 — Middleware Ordering

`requireAuth → requireAdmin → requirePermission` is the mandatory chain for all new routes. `requirePermission` also performs a self-defensive role check in step 2, making it safe even if accidentally placed without `requireAdmin`. **Correctly specified in §6.1 and §6.2.**

### S6 — Route Registration Order

In `rbac.admin.routes.js`, all five named routes are registered before the startup catch-all `router.use(handler)`. This is identical to the Slice 2 `platform.admin.routes.js` pattern. Express matches named routes first; the catch-all only fires for unmatched paths. **Correctly specified in §7.1.**

### S7 — Startup Gate Dual Layer

When `ADMIN_RBAC_ENABLED=false` in ENV (default), two independent layers prevent RBAC execution:
1. Startup gate: `router.use(handler)` registered at module load → returns 404 immediately
2. Runtime guard: `requirePermission` step 1 checks `isFeatureEnabled` → returns `next()` for disabled

The startup gate makes the runtime guard the secondary protection. Even if the startup gate is somehow bypassed (not possible in current design), `requirePermission` would call `next()` when RBAC is disabled — which is safe because `requireAdmin` has already run. **Correctly specified in §12.2.**

### S8 — Existing Admin Route Isolation

All 6 existing `requireAdmin`-protected routes are listed as unchanged in §1.3 and §19.2. The modified `server.js` adds one mount after the existing `platformRouter` mount — no existing mount is removed or reordered. **Verified against actual server.js structure.**

### S9 — JWT Compatibility

The JWT payload `{ id, role: "admin", email }` is not modified. `req.user.id` is the RBAC lookup key. Both `getAdminRbac` and the C2/C5 controller guards use this value consistently. **Safe — no token changes required.**

### S10 — Migration Idempotency

`CREATE TABLE IF NOT EXISTS` for all 4 tables + `INSERT IGNORE` for all seed rows + `INSERT IGNORE ... SELECT ...` for role-permission assignments. Running the migration twice produces identical results. **Correctly specified in §2.1 and §8.3.**

### S11 — Migration Rollback FK Safety

The rollback order (admin_user_roles → admin_role_permissions → admin_permissions → admin_roles) correctly drops child tables before parent tables. Reverse FK cascade prevents constraint violation errors during rollback. **Correctly specified in §2.5 and §15.3.**

### S12 — No Circular Imports

Import chain: `rbac.middleware.js` → `featureFlag.service.js` → `redisCache.service.js` (no rbac imports). `rbac.service.js` → `redisCache.service.js` + `adminPlatform.config.js` (no rbac imports). `admin/index.js` exports from all modules but imports nothing circular. **No circular dependency.**

### S13 — Seed ID-Safety

Role-permission assignments use the subquery pattern:
```sql
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_roles r, admin_permissions p
WHERE r.role_name = 'moderator' AND p.permission_key = 'shops:read';
```
This avoids hardcoded AUTO_INCREMENT IDs and works correctly regardless of insertion order or table state. **Correctly specified in §8.3.**

### S14 — Superadmin Bootstrap Separation

The deployment (Phase A–E) and RBAC activation (Phase F) are explicitly separated. Deployment completes with RBAC disabled and all new routes returning 404. Superadmin role assignment happens after deployment verification, before RBAC activation. **Correctly sequenced in §10 and §12.1.**

---

## HIGH-RISK FILES

### HR1 — `backend/server.js`

Any syntax error, wrong import path, or incorrect `app.use` ordering in this file causes a startup crash that takes down the entire API (storefront, RFQ, seller, admin — all endpoints). The modification is minimal (1 import change + 1 `app.use` line) and additive. The `node --check` + barrel import verification must pass before PM2 restart.

**Mitigation:** §11.1 syntax check + §11.2 barrel verification + §20 checklist item for server.js.

### HR2 — `backend/modules/admin/index.js`

A missing export, wrong path reference, or syntax error in the barrel file causes all imports from `./modules/admin/index.js` in `server.js` to fail — including `platformRouter` from Slice 2. This would crash startup even if `rbacRouter` is not the direct cause of the error. The barrel modification is additive (new exports only).

**Mitigation:** §11.2 barrel import verification explicitly checks that all Slice 2 exports (`platformRouter`, `isFeatureEnabled`, etc.) are still present.

### HR3 — `backend/modules/admin/core/rbac/rbac.service.js`

The most security-critical new file. Errors here affect:
- Permission resolution (wrong result → unauthorized access or false denial)
- Cache key format (wrong key → cache always misses, DB overloaded, or wrong admin's data returned)
- Superadmin detection (C1 iteration bug → superadmins treated as non-superadmin)
- Cache invalidation (wrong prefix → stale permissions for up to 300s)

**Mitigation:** §20 checklist has 4 specific checks for this file (TTL constant, key format, invalidation prefix, C1 iteration).

### HR4 — `backend/migrations/053_admin_rbac.sql`

Once applied to production, this migration cannot be undone without the explicit rollback procedure. Errors in the DDL (wrong column types, missing UNIQUE constraints, wrong FK references) would require the rollback procedure plus a re-application — adding operational complexity. The FK ordering within the file is critical: `admin_role_permissions` must be created after both `admin_roles` and `admin_permissions`.

**Mitigation:** §2.7 validation queries run immediately after migration and must all pass before code deployment proceeds.

### HR5 — `backend/modules/admin/core/rbac/rbac.middleware.js`

Security-critical: all new admin routes pass through this middleware. Errors here include:
- B3 violation: `isFeatureEnabled` error handling that calls `next()` unconditionally
- C3 violation: `req.adminPermissionChecked` set after `next()`
- Missing defensive role check (allows non-admin JWT to proceed to RBAC lookup)
- Wrong response shape for 403 (breaks future frontend consumers)

**Mitigation:** §20 checklist has 2 specific checks for this file (try/catch with ENV fallback, C3 timing).

---

## Review by Plan Section

| Section | Status | Notes |
|---|---|---|
| §1 File Inventory | SAFE | 6 real new files (rows 7–8 are directories, not files — minor doc imprecision) |
| §2 Migration Plan | SAFE | `053_admin_rbac.sql` confirmed in runner whitelist; seed counts correct; ID-safe pattern |
| §3 RBAC Runtime Flow | CORRECTION | C1: §3.4 dual-failure response should be 403, not 500 |
| §4 Redis Cache Strategy | SAFE | Key format, TTL, invalidation matrix, namespace isolation all correct |
| §5 Permission Resolution | SAFE | C1 iteration contract correctly specified; `Set` conversion on cache hit documented |
| §6 Middleware Chain | SAFE | B3 try/catch correct; C3 timing correct; defensive role check present |
| §7 Route Registration | SAFE | Named routes before catch-all; `export default router`; no collision with existing routes |
| §8 Seed Strategy | CORRECTION | C2: invalidation ordering after DB write not yet explicit |
| §9 Superadmin Bootstrap | SAFE | Pre-activation requirement clear; SQL steps correct; `ON DUPLICATE KEY` safety handled |
| §10 Deployment Order | SAFE | 6-phase sequence correct; migration before code; PM2 last |
| §11 PM2 Restart Safety | CORRECTION | C3: working directory must be stated for barrel verification script |
| §12 Hidden Deployment | SAFE | 3 states documented; startup gate reliable; no leakage between states |
| §13 Production Smoke Tests | SAFE | Pre and post-activation tests cover all critical paths |
| §14 Runtime Verification | SAFE | Redis TTL check; DB query verification; controller guard verification |
| §15 Rollback Strategy | SAFE | Trigger conditions clear; FK-safe drop order; tracking row removal |
| §16 Recovery Procedures | SAFE | Superadmin lockout recovery SQL documented; Redis flush procedure correct |
| §17 Dangerous File List | SAFE | 12 files identified correctly; `featureFlag.service.js` correctly listed |
| §18 Forbidden Modification List | SAFE | Key prohibitions: router.use("*"), old cache key format, requireAdmin modification |
| §19 Regression Test Checklist | SAFE | All 5 domains covered (storefront, admin, seller, RFQ, auth) |
| §20 Implementation Checklist | SAFE | 30 items; add C3 working-directory note as follow-on correction |

---

## Specific Implementation Constraints for File Generation

These constraints must be enforced in the generated files. They are derived from the full design + review cycle.

### `rbac.service.js`

```
- Export: RBAC_CACHE_TTL_MS = 300_000  (not literal 60, not 300)
- Cache SET key: `admin:rbac:${adminId}:perms`
- Cache GET key: `admin:rbac:${adminId}:perms`  (same)
- Per-admin invalidation: invalidateByLogicalPrefix('admin:rbac:' + adminId + ':')
- Bulk invalidation:      invalidateByLogicalPrefix('admin:rbac:')
- C1: iterate ALL rows — check is_superadmin on every row including NULL permission_key rows
- On Redis hit: JSON.parse → new Set(parsed.permissions), isSuperadmin: parsed.isSuperadmin
- On DB error: catch internally → return { permissions: new Set(), isSuperadmin: false }
- Cache write: fire-and-forget (.catch(() => {})) AFTER successful DB query
```

### `rbac.middleware.js`

```
- requirePermission(permissionKey) is a factory — returns async function
- Step 1: try { rbacEnabled = await isFeatureEnabled("ADMIN_RBAC_ENABLED") }
          catch (err) { rbacEnabled = adminPlatformConfig.rbacEnabled } // ENV fallback (B3)
- Step 2: if !rbacEnabled → next() (no RBAC resolution)
- Step 3: defensive check req.user.role !== "admin" → 403 { error: "Forbidden" }
- Step 4: if !req.user.id → 401
- Step 5: req.adminPermissionChecked = permissionKey  (BEFORE next() — C3)
- Step 6: try { allowed = await hasPermission(...) }
          if !allowed → 403 { error: "Forbidden", required: permissionKey }
          if allowed → next()
          catch (err) → 500 (programming error only — infra errors absorbed by service)
```

### `rbac.admin.controller.js`

```
- assignRole: C2 escalation guard BEFORE INSERT:
    check if target role.is_superadmin = 1
    if yes: verify getAdminRbac(req.user.id).isSuperadmin = true
    if not superadmin: return 403 { error: "Only superadmins may assign the superadmin role" }
  - After successful INSERT: invalidateAdminRbacCache(adminId).catch(() => {})  (C2: AFTER write)

- revokeRole: C5 last-superadmin guard BEFORE DELETE:
    if role.is_superadmin = 1:
      count = SELECT COUNT(*) FROM admin_user_roles aur
              JOIN admin_roles r ON r.id = aur.role_id
              WHERE r.is_superadmin = 1
                AND NOT (aur.admin_id = :adminId AND aur.role_id = :roleId)
      if count = 0: return 403 { error: "Cannot revoke last superadmin assignment" }
  - After successful DELETE: invalidateAdminRbacCache(adminId).catch(() => {})  (C2: AFTER write)
```

### `rbac.admin.routes.js`

```
- All 5 named routes registered UNCONDITIONALLY and FIRST
- Startup gate: if (!adminPlatformConfig.rbacEnabled) { router.use((req, res) => res.status(404)...) }
  registered AFTER all named routes
- router.use(handler)  NOT router.use("*", handler)  (Express 5 fix)
- export default router  (required by barrel { default as rbacRouter })
```

### `admin/index.js` (modification)

```
- Existing Slice 2 exports MUST remain unchanged:
    platformRouter, isFeatureEnabled, getAllFlagStates, invalidateFlagCache,
    adminPlatformConfig, FLAG_KEY_MAP, ALL_FLAG_KEYS, FLAG_CACHE_TTL_MS
- Add AFTER existing exports:
    export { default as rbacRouter } from "./rbac/routes/rbac.admin.routes.js"
    export { getAdminRbac, hasPermission, invalidateAdminRbacCache, RBAC_CACHE_TTL_MS }
    export { requirePermission }
```

### `server.js` (modification)

```
- Combine import: import { platformRouter, rbacRouter } from "./modules/admin/index.js"
  OR add separate: import { rbacRouter } from "./modules/admin/index.js"
  (either is valid; combining is cleaner)
- Mount AFTER existing platformRouter mount:
    app.use("/api/admin/platform", platformRouter);  // existing — unchanged
    app.use("/api/admin/rbac", rbacRouter);           // new
- No existing app.use line removed or reordered
```

### `053_admin_rbac.sql`

```
- CREATE TABLE order: admin_roles → admin_permissions → admin_role_permissions → admin_user_roles
  (FKs require parent tables to exist first)
- admin_role_permissions FKs: ON DELETE CASCADE for both role_id and permission_id
- admin_user_roles FK: ON DELETE CASCADE for role_id; NO FK for admin_id
- All CREATE TABLE use IF NOT EXISTS
- All INSERT use INSERT IGNORE
- Role-permission seed uses subquery pattern (no hardcoded IDs)
- admin_user_roles is empty after migration (no seed rows)
```

---

## Pre-Generation Checklist

Before generating any implementation file, confirm the following are resolved:

- [ ] C1 correction acknowledged: implementer knows §3.4 flow diagram is corrected — dual-failure returns 403 (via empty permission Set), not 500. The `500` in §6.2 step 4 `catch` is for programming errors only.
- [ ] C2 correction acknowledged: cache invalidation called AFTER successful DB write in both `assignRole` and `revokeRole` controllers, as fire-and-forget.
- [ ] C3 correction acknowledged: barrel import verification script runs from project root `/var/www/otofine`.

---

*Document version: 1.0 — Final review only. No implementation files generated.*  
*Next step: Generate implementation files using plan + review as source of truth.*
