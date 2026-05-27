# Otofine Admin Platform — Phase 1A Slice 3 RBAC Foundation
## Architecture Review Document

**Status:** REVIEW ONLY — no implementation  
**Date:** 2026-05-26  
**Reviews:** `phase-1a-slice3-rbac-design.md`  
**Cross-checked against:** `run-admin-migration.js`, `redisCache.service.js`, `auth.middleware.js`, `token.service.js`, `featureFlag.service.js`, `platform.admin.routes.js`, `server.js`

---

## Summary

| Category | Count |
|---|---|
| BLOCKERS | 3 |
| CORRECTIONS | 6 |
| SAFE decisions confirmed | 10 |
| HIGH-RISK areas identified | 5 |

---

## BLOCKERS

### B1 — Migration Runner Whitelist Mismatch (CRITICAL)

**File:** `backend/scripts/run-admin-migration.js` lines 49–56  
**Impact:** `npm run migrate:admin:rbac` fails immediately, migration cannot run at all.

The migration runner maintains an explicit whitelist of managed files:

```javascript
const ADMIN_MIGRATION_FILES = [
  "051_schema_migrations.sql",
  "052_admin_accounts.sql",      // ← NOT "052_admin_rbac_schema.sql"
  "053_admin_rbac.sql",          // ← different name from design
  "054_admin_audit_log.sql",
  "055_admin_feature_flags.sql",
  "056_admin_job_queue.sql",
];
```

The design proposes the filename `052_admin_rbac_schema.sql`. The runner will reject it:

```
[admin-migration] ERROR: "052_admin_rbac_schema.sql" is not in the managed file list.
```

**Required fix:** The design must specify ONE of:

Option A — Use existing whitelist filename `053_admin_rbac.sql` (skip 052 for now; keep `052_admin_accounts.sql` reserved for a future admin accounts table per original architecture plan).

Option B — Update the runner whitelist to replace `052_admin_accounts.sql` with `052_admin_rbac_schema.sql`. This changes a Slice 1 artifact and must be an explicit patched step.

**Recommendation:** Option A. Use `053_admin_rbac.sql` and rename the migration file accordingly. Slot 052 remains reserved. This preserves the original architecture numbering intent and does NOT require modifying a Slice 1 artifact.

**Impact on design:** All references to `052_admin_rbac_schema.sql` must be changed to `053_admin_rbac.sql`. The npm script target must change accordingly.

---

### B2 — Per-Admin Cache Invalidation Key Collision (CRITICAL)

**File:** Design §6.2, §8.1, §8.3  
**Impact:** Invalidating cache for admin ID 1 accidentally invalidates admin IDs 10, 100, 1000, etc.

The design proposes cache key format: `admin:rbac:perms:{adminId}` and per-admin invalidation via `invalidateByLogicalPrefix('admin:rbac:perms:{adminId}')`.

`invalidateByLogicalPrefix` from `redisCache.service.js` (line 188) constructs this SCAN pattern:
```
${PREFIX}dv${CACHE_DATA_VERSION}:admin:rbac:perms:{adminId}*
```

With adminId = 1, this becomes: `otofine:v1:dv1:admin:rbac:perms:1*`

This pattern matches ALL of:
- `otofine:v1:dv1:admin:rbac:perms:1`   (admin 1) ← intended
- `otofine:v1:dv1:admin:rbac:perms:10`  (admin 10) ← unintended
- `otofine:v1:dv1:admin:rbac:perms:100` (admin 100) ← unintended
- `otofine:v1:dv1:admin:rbac:perms:1000` (admin 1000) ← unintended

This is the exact same class of bug that was fixed in Slice 2 (narrowing `admin:ff:` to `admin:ff:ADMIN_`).

**Required fix:** Change the cache key format to include a colon after the adminId:

```
admin:rbac:{adminId}:perms
```

Per-admin invalidation prefix:  `admin:rbac:{adminId}:`  
Bulk invalidation prefix:       `admin:rbac:`

Verification that the colon-terminated format is safe:
- Pattern for admin 1: `...admin:rbac:1:*` 
- Key for admin 10:    `...admin:rbac:10:perms` — does NOT match `...admin:rbac:1:*` because after `1` the key has `0` but the pattern requires `:`
- Exact separation is enforced by the colon delimiter

**Impact on design:** Update §6.2 (`getAdminRbac` resolution path), §8.1 (cache key format), §8.3 (invalidation targets), and all `setRaw`/`getRaw` call sites to use `admin:rbac:{adminId}:perms` as the key.

---

### B3 — Feature Flag Error Handling Silently Bypasses RBAC (CRITICAL)

**File:** Design §15.1  
**Impact:** A transient feature flag service error disables RBAC protection without logging a meaningful error.

Design §15.1 states:

> "If Slice 2's feature flag service fails, RBAC middleware falls back to calling next() (treating RBAC as disabled)"

This is the wrong failure behavior. `isFeatureEnabled` in `featureFlag.service.js` can fail in two ways:

1. **Redis error** — already handled internally: the service catches and falls back to DB
2. **DB error** — already handled internally: falls back to ENV (`adminPlatformConfig.rbacEnabled`)
3. **Unhandled throw** — e.g., programming error, corrupted ENV config

For case 3, the design says to silently call `next()`. This means: any unexpected error in the feature flag resolution path silently disables RBAC for that request.

The correct behavior depends on the ENV fallback value:
- If `ADMIN_RBAC_ENABLED=false` in ENV: treating it as disabled is correct (same as ENV default)
- If `ADMIN_RBAC_ENABLED=true` in ENV: silently disabling RBAC is a security bypass

**Required fix:** The `requirePermission` middleware must wrap the `isFeatureEnabled` call in a try/catch. On error, the middleware must fall back to the ENV value via `adminPlatformConfig.rbacEnabled`, NOT to an unconditional `next()`. This matches the existing Slice 2 pattern where ENV is the final fallback for all feature flag resolutions.

```javascript
// Required behavior in requirePermission:
let rbacEnabled;
try {
  rbacEnabled = await isFeatureEnabled("ADMIN_RBAC_ENABLED");
} catch (err) {
  console.error("[rbac:middleware] isFeatureEnabled error:", err.message);
  rbacEnabled = adminPlatformConfig.rbacEnabled; // ENV fallback, not silent next()
}
if (!rbacEnabled) return next();
```

**Impact on design:** Update §7.2 (execution flow step 1) and §15.1 to reflect the ENV-fallback-on-error behavior.

---

## CORRECTIONS

### C1 — DB Query Iteration Logic Underspecified for Superadmin Detection

**File:** Design §6.2 (`getAdminRbac` service function)  
**Impact:** If misimplemented, a superadmin's bypass flag is missed when the admin also has regular roles.

The DB query:
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

For an admin with BOTH the `superadmin` role (no permission rows) AND the `operator` role (has permission rows), the result set is:

| `permission_key` | `is_superadmin` |
|---|---|
| NULL | 1 (from superadmin role, LEFT JOIN null) |
| `shops:read` | 0 (from operator role; superadmin's row doesn't contribute here) |
| `rfq:admin:read` | 0 |

The `is_superadmin = 1` is ONLY in the NULL `permission_key` row. If the service iterates rows and only checks `is_superadmin` on non-null permission_key rows, it will miss the superadmin status entirely and fall back to the permission check.

**Required fix:** The implementation spec must explicitly state:

> The service iterates ALL rows from the query result, including rows with `permission_key = NULL`. `isSuperadmin` is set to `true` if ANY row has `is_superadmin = 1`. Only non-null `permission_key` rows are added to the permissions Set.

```javascript
// Required implementation pattern:
let isSuperadmin = false;
const permissions = new Set();
for (const row of rows) {
  if (row.is_superadmin) isSuperadmin = true;   // check ALL rows
  if (row.permission_key) permissions.add(row.permission_key); // skip NULLs
}
```

**Impact on design:** Add this explicit iteration contract to §6.2.

---

### C2 — Permission Escalation via `rbac:manage` Undocumented

**File:** Design §4.2, §9.2  
**Impact:** An admin with `rbac:manage` can assign themselves the `superadmin` role.

The `POST /api/admin/rbac/admins/:adminId/roles` route is protected by `rbac:manage`. Nothing in the design prevents an admin with this permission from calling:

```
POST /api/admin/rbac/admins/{their_own_id}/roles
{ "roleId": <superadmin_role_id> }
```

This grants themselves superadmin status — bypassing all future permission checks — without any superadmin pre-approval.

This is a privilege escalation path that must be acknowledged and mitigated. Two options:

Option A — **Only a superadmin can assign the `is_superadmin=1` role.** The controller checks: if the target role has `is_superadmin=1`, verify `req.user.id` has `isSuperadmin=true`. Non-superadmins with `rbac:manage` can assign non-superadmin roles only.

Option B — **Separate `rbac:superadmin_assign` permission** distinct from `rbac:manage`. Add to the permission registry. Only the superadmin role holds it.

**Recommendation:** Option A (simpler, no new permission row required).

**Impact on design:** Add a new risk entry in §14, document controller-level guard in §9.2, and update the `rbac.admin.controller.js` spec to include this guard.

---

### C3 — `req.adminPermissionChecked` Must Be Set Before `next()`

**File:** Design §7.2 (execution flow)  
**Impact:** If set after `next()`, the audit log handler that runs as part of the same middleware chain will see the value; but if set after `next()` in an async context, timing is undefined and it may not be available to a subsequent synchronous middleware.

The design's execution flow in §7.2 lists:
```
3. Call hasPermission → On true: call next()
4. Attach req.adminPermissionChecked = permissionKey
```

Step 4 is listed AFTER step 3's `next()` call. In Express middleware, code after `next()` runs after the entire downstream chain completes (including the handler). This is a well-known Express timing issue.

**Required fix:** Step 4 must execute BEFORE `next()`:

```javascript
// Correct order:
const allowed = await hasPermission(req.user.id, permissionKey);
if (!allowed) return res.status(403).json({ error: "Forbidden", required: permissionKey });
req.adminPermissionChecked = permissionKey;  // set BEFORE next()
return next();
```

**Impact on design:** Reorder steps 3 and 4 in §7.2.

---

### C4 — FK Omission Rationale Is Incorrect

**File:** Design §5.4, §2.2  
**Impact:** Documentation misleads future implementers about MySQL FK constraints.

Design §2.2 states:

> "DO NOT add FK from `admin_user_roles.admin_id` to `admin.id` — `admin` table is unmodified; FK requires referencing table to be altered or have explicit support"

This is technically **incorrect**. In MySQL/InnoDB, a FK is defined on the **child** table (`admin_user_roles`) referencing the **parent** table (`admin`). This does NOT require altering the parent table. The only requirement is that `admin.id` is indexed (it is — it's the PK).

The actual correct reasons for omitting the FK are:

1. We have not audited the complete DDL of the `admin` table (only 3 columns known from query context). Without knowing the full column set and engine settings, we cannot safely assert the FK won't cause unexpected behavior.
2. Conservative isolation: the additive-only policy means minimizing dependencies on unaudited existing tables.
3. The soft reference (`idx_aur_admin_id` index) achieves lookup efficiency without coupling risks.

**Required fix:** Correct §5.4 and §2.2 to state the real reasons (incomplete table audit, conservative isolation) and remove the incorrect claim that FKs require parent table alteration.

---

### C5 — Superadmin Role Deletion Lockout Risk Unmitigated

**File:** Design §4.3, §9.2  
**Impact:** Accidental deletion or de-superadmin-ing of the superadmin role via the RBAC management API creates an unrecoverable lockout from all RBAC-protected routes.

The `DELETE /api/admin/rbac/admins/:adminId/roles/:roleId` route allows revoking any role. If a superadmin removes all superadmin role assignments from all admins, no one can access RBAC-managed routes, and there is no recovery path except a direct DB operation.

Additionally, if the `admin_roles` row for the superadmin role is deleted (via direct DB access or a future "delete role" endpoint), the `ON DELETE CASCADE` on `admin_user_roles.role_id → admin_roles.id` removes all superadmin assignments simultaneously.

The design's risk analysis (§14) does not address this.

**Required fixes:**

1. Add controller-level guard: the RBAC controller must refuse to revoke the last superadmin assignment. Before completing a role revocation, check: `SELECT COUNT(*) FROM admin_user_roles WHERE role_id = (SELECT id FROM admin_roles WHERE is_superadmin = 1)`. If count would drop to 0, reject the operation.

2. Add documentation: the superadmin `admin_roles` row MUST NOT be deleted (no "delete role" API in Slice 3; document this constraint for Slice 5+).

3. Add rollback recovery procedure: document the direct DB fix if a superadmin lockout occurs — manual `INSERT INTO admin_user_roles (admin_id, role_id, granted_by) VALUES (...)`.

---

### C6 — HTTP 403 Response Shape Divergence Not Documented

**File:** Design §7.2, §2.2  
**Impact:** Inconsistent 403 shapes from `requireAdmin` vs `requirePermission` will cause confusion for future frontend developers and API consumers.

`requireAdmin` returns:
```json
{ "message": "Không có quyền admin" }
```

`requirePermission` returns (per §7.2):
```json
{ "error": "Forbidden", "required": "shops:read" }
```

These shapes are different. The design §2.2 says "MUST NOT change `requireAdmin` response shape" but does not address the new shape introduced by `requirePermission`.

When both middleware are present (`requireAdmin → requirePermission`), the client may receive either shape depending on which layer rejects the request:
- No admin JWT: `requireAuth` returns 401
- Admin JWT but wrong role: `requireAdmin` returns 403 `{ message }`
- Admin JWT, correct role, insufficient permission: `requirePermission` returns 403 `{ error, required }`

**Required fix:** Document the 403 response shape divergence explicitly in the design. Future Slice 5 frontend code must handle both shapes. The `requirePermission` 403 shape should remain as specified (it carries useful diagnostic info), but its existence must be documented.

---

## SAFE Decisions Confirmed

The following 10 design decisions are reviewed and confirmed as correct:

| # | Decision | Section | Assessment |
|---|---|---|---|
| S1 | JWT token structure unchanged — permissions resolved per-request | §3 | Correct. 7-day token lifetime makes embedded permissions hazardous. |
| S2 | `requireAdmin` left completely unchanged | §2.2 | Correct. All 6 existing protected route groups depend on it. |
| S3 | `admin` table not modified | §2.2 | Correct. Additive-only policy preserved. |
| S4 | Redis namespace isolation (`admin:rbac:` vs `admin:ff:`) | §8.5 | Correct. No collision with Slice 2 keys. |
| S5 | Fail-safe deny on DB+Redis dual failure | §6.3 | Correct. Authorization errors must deny, not grant. |
| S6 | `router.use(handler)` without path argument | §9.4 | Correct. Same Express 5 / path-to-regexp@8 fix as Slice 2. |
| S7 | Single migration file `052/053_admin_rbac.sql` for all 4 FK-coupled tables | §11 | Correct. Atomicity prevents FK dependency ordering failures. |
| S8 | `ADMIN_RBAC_ENABLED=false` default (ENV already set in Slice 2) | §2.3 | Correct. No behavior change until explicitly activated. |
| S9 | `INSERT IGNORE` for all seed data | §5.5 | Correct. Idempotent — safe to re-run migration. |
| S10 | `RBAC_CACHE_TTL_MS = 300_000` as named constant | §8.2 | Correct. Prevents the literal-60 (= 60ms) unit confusion bug. |

---

## HIGH-RISK AREAS

### HR1 — Migration Runner Whitelist Mismatch (Blocker B1)

If the migration is run before the runner whitelist is updated, the process exits with code 1 and the migration is never applied. All subsequent deployment steps assume the tables exist. **Pre-deployment verification is mandatory.**

---

### HR2 — Per-Admin Cache Key Prefix Collision (Blocker B2)

Until the key format is changed to `admin:rbac:{adminId}:perms`, any role assignment change for admin ID `N` will inadvertently flush permission caches for all admins whose IDs start with the same digit sequence as `N`. On a production system with admins numbered 1–9, this means: invalidating admin 1 also invalidates admin 10, 11, ..., 19, etc. This causes unnecessary DB queries and, more importantly, is an incorrect implementation of targeted cache invalidation.

---

### HR3 — RBAC Feature Flag Error Silently Disabling RBAC (Blocker B3)

The proposed "fallback to next()" on feature flag error is the same pattern as "RBAC is disabled" — making it indistinguishable from a legitimate disabled state. If this behavior reaches production with `ADMIN_RBAC_ENABLED=true`, any Redis+DB outage would simultaneously disable both the cache AND RBAC protection, creating an unprotected window while the infrastructure error persists.

---

### HR4 — Privilege Escalation via `rbac:manage` (Correction C2)

An operator-level admin with `rbac:manage` can escalate themselves to superadmin without any approval gate. This is a privilege escalation path that survives through the entire RBAC system. The controller-level guard (only superadmins assign superadmin roles) must be implemented in Slice 3, not deferred.

---

### HR5 — Superadmin Lockout via Last-Superadmin Revocation (Correction C5)

There is no safeguard preventing the last superadmin from being removed from the superadmin role. Unlike feature flag deactivation (which gracefully degrades), removing all superadmin assignments means NO ONE can access RBAC-protected routes — including the route to re-assign superadmin roles — creating a deadlock that requires a direct DB operation. The last-superadmin guard must be implemented in Slice 3.

---

## Review by Design Section

| Section | Status | Issues |
|---|---|---|
| §1 Current State Analysis | SAFE | Correct audit of existing auth stack |
| §2 Design Goals and Constraints | CORRECTION | C4: FK rationale is incorrect |
| §3 JWT Token Strategy | SAFE | Correct decision; no token changes needed |
| §4 Permission Model | CORRECTION | C2: privilege escalation not addressed |
| §5 DB Schema Design | CORRECTION | C4: FK rationale; otherwise DDL is correct |
| §6 RBAC Service Architecture | BLOCKER + CORRECTION | B2: key format; B3: error handling; C1: iteration |
| §7 Middleware Design | BLOCKER + CORRECTION | B3: error handling; C3: step ordering; C6: 403 shape |
| §8 Redis Cache Strategy | BLOCKER | B2: per-admin key collision |
| §9 Route Protection Strategy | CORRECTION | C2: privilege escalation guard needed in controller |
| §10 Module File Structure | SAFE | Directory structure is correct and consistent |
| §11 Migration Plan | BLOCKER | B1: filename mismatch with runner whitelist |
| §12 Rollout Plan | SAFE | Deployment order is correct; pre-checks are appropriate |
| §13 Rollback Plan | SAFE | Rollback is complete and correct |
| §14 Risk Analysis | CORRECTION | C5: superadmin lockout risk missing |
| §15 Dangerous Coupling Analysis | BLOCKER | B3: isFeatureEnabled error coupling undocumented |
| §16 Implementation Phases | SAFE | Scope is correctly bounded |

---

## Required Patches Before Implementation

The following patches must be applied to `phase-1a-slice3-rbac-design.md` before implementation begins:

**Blockers (must fix before any file is written):**

- **B1**: Change migration filename from `052_admin_rbac_schema.sql` to `053_admin_rbac.sql`; update all references; add the runner whitelist update as an explicit implementation step (modify `run-admin-migration.js` ADMIN_MIGRATION_FILES array)
- **B2**: Change cache key format from `admin:rbac:perms:{adminId}` to `admin:rbac:{adminId}:perms`; update §6.2, §8.1, §8.3 accordingly; change per-admin invalidation prefix to `admin:rbac:{adminId}:`
- **B3**: Change `requirePermission` error-handling spec: `isFeatureEnabled` errors fall back to `adminPlatformConfig.rbacEnabled` (ENV), not unconditional `next()`; update §7.2 and §15.1

**Corrections (must fix before implementation):**

- **C1**: Add explicit iteration contract in §6.2: check `is_superadmin` from ALL rows (including NULL permission_key rows)
- **C2**: Add privilege escalation guard spec to §9.2 and §4.4: only superadmins may assign `is_superadmin=1` roles
- **C3**: Reorder §7.2 execution flow: set `req.adminPermissionChecked` BEFORE calling `next()`
- **C4**: Correct §5.4 and §2.2 FK omission rationale: real reason is incomplete table DDL audit, not "FK requires parent table alteration"
- **C5**: Add last-superadmin guard to §9.2 controller spec and add lockout recovery procedure to §13
- **C6**: Document 403 response shape divergence in §7.2 for future frontend consumers

---

*Document version: 1.0 — Review only. No implementation files generated.*  
*Next step: Apply design patches, then create implementation plan.*
