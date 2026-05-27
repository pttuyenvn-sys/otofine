# Otofine Admin Platform — Phase 1A Slice 4: Audit Log Foundation
## Final File-Level Review

**Status:** REVIEW ONLY — no implementation  
**Date:** 2026-05-27  
**Files reviewed:**
- `backend/migrations/054_admin_audit_log.sql`
- `backend/migrations/054_admin_audit_log.rollback.sql`
- `backend/modules/admin/core/auditLog/auditLog.service.js`
- `backend/modules/admin/rbac/controllers/rbac.admin.controller.js`
- `backend/modules/admin/index.js`
- `backend/package.json`

---

## Summary

| Category | Count |
|---|---|
| BLOCKERS | 1 |
| CORRECTIONS | 1 |
| SAFE areas | 18 |
| HIGH-RISK files/flows | 3 |

One blocker prevents correct snapshot capture in `revokeRole`. One correction prevents a JSON null vs SQL NULL semantic mismatch in the INSERT. Both are targeted fixes with no scope expansion.

---

## BLOCKERS

### B1 — `revokeRole` Role Lookup Query Missing `role_name`

**File:** `backend/modules/admin/rbac/controllers/rbac.admin.controller.js`  
**Location:** Lines 189–196 (role lookup at top of `revokeRole`), then line 230 (`targetRole.role_name` in the before snapshot)

**Problem:**

The existing `revokeRole` role lookup query (carried over from Slice 3, which only needed `is_superadmin` for the C5 guard) selects only `id` and `is_superadmin`:

```javascript
// Line 189–190
const [roleRows] = await pool.query(
  "SELECT id, is_superadmin FROM admin_roles WHERE id = ?",
```

The Slice 4 addition then reads `targetRole.role_name` for the before snapshot:

```javascript
// Line 229–230
beforeSnapshot = {
  admin_id:   adminId,
  role_id:    roleId,
  role_name:  targetRole.role_name,   // ← UNDEFINED — not in SELECT
```

Since `role_name` is not in the SELECT result set, `targetRole.role_name` is `undefined`. JavaScript `undefined` properties are silently dropped by `JSON.stringify`, so the `before_json` audit entry is stored as:

```json
{ "admin_id": 5, "role_id": 2, "granted_by": 1, "granted_at": "..." }
```

— missing `role_name` entirely. The C4 design patch (which extended the before snapshot to include `role_name`) is silently not working for `revokeRole`.

Compare with `assignRole` (line 109) which correctly includes `role_name` in its query:
```javascript
"SELECT id, role_name, is_superadmin FROM admin_roles WHERE id = ?"
```

**Required fix:** Change the `revokeRole` role lookup query to also select `role_name`:

```javascript
"SELECT id, role_name, is_superadmin FROM admin_roles WHERE id = ?"
```

This is a single-word addition (`role_name,`) to the existing query. No logic changes. The `role_name` field is already available from the same `admin_roles` table row — no additional query needed.

---

## CORRECTIONS

### C1 — `JSON.stringify(null)` Stores JSON Null Instead of SQL NULL

**File:** `backend/modules/admin/core/auditLog/auditLog.service.js`  
**Location:** Lines 227–228 (INSERT parameters for `before_json` and `after_json`)

**Problem:**

```javascript
// Lines 227–228
finalBefore  !== undefined ? JSON.stringify(finalBefore)  : null,
finalAfter   !== undefined ? JSON.stringify(finalAfter)   : null,
```

When `finalBefore` is `null` (e.g., `before = null` for a CREATE action like `assignRole`), the condition `null !== undefined` evaluates to `true`, so `JSON.stringify(null)` is called — which returns the 4-character string `"null"`.

MySQL receives the string `"null"` for a `JSON` column and stores it as the JSON literal `null` (a valid JSON value). This is semantically different from storing SQL `NULL`:

- **SQL NULL** (`before_json IS NULL`): the column has no value — "no snapshot was provided"
- **JSON null** (`before_json = CAST('null' AS JSON)`): the column has an explicit JSON null value

Future audit log queries that filter on `WHERE before_json IS NULL` (to find CREATE actions with no prior state) will silently miss rows stored with JSON null. This is a data correctness issue that accumulates over all logged `assignRole` actions.

**Required fix:** Use `!=` (loose equality) which matches both `null` and `undefined`, ensuring both produce SQL NULL:

```javascript
finalBefore != null ? JSON.stringify(finalBefore) : null,
finalAfter  != null ? JSON.stringify(finalAfter)  : null,
```

With this fix:
- `null` input → SQL NULL in DB (correct: "no snapshot")
- `undefined` input → SQL NULL in DB (defensive: shouldn't happen, but safe)
- `{}` input → `"{}"` string stored as JSON object (correct: valid snapshot)
- `{ _truncated: true, ... }` → JSON object (correct: truncation marker)

---

## SAFE AREAS

### S1 — Append-Only Integrity

`auditLog.service.js` contains exactly one SQL statement: `INSERT INTO admin_audit_log`. No UPDATE, DELETE, or TRUNCATE is present anywhere in the file. `sanitizeSnapshot`, `redactDeep`, and `enforceSnapshotSize` are all internal (not exported). The exported API surface is a single function: `logAdminAction`. **Append-only constraint is fully enforced.**

### S2 — Sanitization Correctness

`sanitizeSnapshot` correctly:
- Returns `null`/`undefined` as-is (line 71)
- Returns primitives unchanged (line 72)
- Deep clones via `JSON.parse(JSON.stringify(obj))` — catches circular references and BigInt by throwing, falls back to `null` (lines 74–82, C1 design patch)
- Delegates to `redactDeep` which walks the clone recursively, replacing BLOCKED_FIELDS keys case-insensitively (lines 88–108)

`redactDeep` handles arrays, objects, and primitives correctly. After a BLOCKED_FIELDS key is replaced with `"[REDACTED]"`, the `else` branch does not recurse into the redacted string — correct behavior. The function walks a JSON-parsed tree (no circular references possible after the round-trip clone), so recursion terminates on all valid inputs.

### S3 — RBAC Snapshot Contents for `assignRole`

The `after` snapshot passed to `logAdminAction` in `assignRole`:
```javascript
after: {
  admin_id:   adminId,
  role_id:    roleId,
  role_name:  targetRole.role_name,   // ← FROM SELECT id, role_name, is_superadmin
  granted_by: req.user.id,
}
```
None of these fields (`admin_id`, `role_id`, `role_name`, `granted_by`) appear in `BLOCKED_FIELDS`. No sensitive data leakage risk. `targetRole.role_name` is correctly populated because `assignRole`'s role lookup includes `role_name` in the SELECT.

### S4 — Hidden Deployment Semantics

`logAdminAction` checks `isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")` at line 183. When the flag is `false` (default), the function returns immediately at line 189 (`if (!enabled) return;`) before any sanitization, serialization, or INSERT occurs. RBAC routes behave identically to Slice 3. Zero behavioral change when the flag is disabled.

### S5 — Best-Effort Semantics

The outer `try/catch` in `logAdminAction` (lines 179–238) catches all errors and calls `console.error` without rethrowing. The inner `try/catch` for `isFeatureEnabled` (lines 182–187) falls back to the ENV value without rethrowing. No code path exits `logAdminAction` via an exception — controllers never see a thrown error from the audit service.

The `await logAdminAction(...)` in controllers is correctly awaited (not fire-and-forget): the write attempt completes before the HTTP response is sent, but failures do not block the response.

### S6 — Feature Flag Error Handling (B3 Pattern)

The inner try/catch for `isFeatureEnabled`:
```javascript
try {
  enabled = await isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED");
} catch {
  enabled = adminPlatformConfig.auditLogEnabled ?? false;
}
```
On Redis+DB dual failure, falls back to `adminPlatformConfig.auditLogEnabled` (ENV value, default `false`). This matches the B3 pattern from `requirePermission`. Safe default: when infrastructure fails, audit writes are disabled (no phantom entries from degraded state).

### S7 — Import Path Correctness

All import paths verified:
- `rbac.admin.controller.js` → `../../core/auditLog/auditLog.service.js`: up 2 = `backend/modules/admin/`, then `core/auditLog/auditLog.service.js` ✓
- `auditLog.service.js` → `../featureFlags/featureFlag.service.js`: up 1 = `backend/modules/admin/core/`, then `featureFlags/featureFlag.service.js` ✓
- `auditLog.service.js` → `../../config/adminPlatform.config.js`: up 2 = `backend/modules/admin/`, then `config/adminPlatform.config.js` ✓
- `auditLog.service.js` → `../../../../config/db.js`: up 4 = `backend/`, then `config/db.js` ✓
- `admin/index.js` → `./core/auditLog/auditLog.service.js`: relative to `backend/modules/admin/` ✓

Barrel import verification confirmed live resolution.

### S8 — Barrel Compatibility

`admin/index.js` adds exactly one line to the Slice 3 exports:
```javascript
export { logAdminAction } from "./core/auditLog/auditLog.service.js";
```
All Slice 2 and Slice 3 exports (`platformRouter`, `rbacRouter`, `isFeatureEnabled`, `getAllFlagStates`, `invalidateFlagCache`, `adminPlatformConfig`, `FLAG_KEY_MAP`, `ALL_FLAG_KEYS`, `FLAG_CACHE_TTL_MS`, `getAdminRbac`, `hasPermission`, `invalidateAdminRbacCache`, `RBAC_CACHE_TTL_MS`, `requirePermission`) are preserved verbatim. The live barrel verification confirmed all 15 exports are present.

### S9 — Migration SQL Correctness

`054_admin_audit_log.sql`:
- `CREATE TABLE IF NOT EXISTS` — idempotent ✓
- `BIGINT UNSIGNED AUTO_INCREMENT` PK — scale-appropriate ✓
- No physical FKs — consistent with C4 pattern ✓
- No `updated_at` column — append-only signal ✓
- 4 indexes match design §3.3 exactly ✓
- `utf8mb4_unicode_ci` — consistent with other admin tables ✓
- No seed data — correct (audit log starts empty) ✓

Column count: 13 (id, admin_id, actor_type, action, target_type, target_id, before_json, after_json, ip_address, user_agent, permission_checked, metadata_json, created_at) — matches design spec exactly.

### S10 — Rollback SQL Correctness

`054_admin_audit_log.rollback.sql`:
- `DROP TABLE IF EXISTS admin_audit_log` — idempotent ✓
- `DELETE FROM schema_migrations WHERE filename = '054_admin_audit_log.sql'` — correct tracking row removal ✓
- DDL implicit COMMIT behavior documented correctly in the file comment ✓

### S11 — Logging Order in `assignRole`

The `logAdminAction` call is inside the `if (insertResult.affectedRows > 0)` block, placed after `invalidateAdminRbacCache`. Correct sequence:
1. INSERT IGNORE admin_user_roles ✓
2. Cache invalidation (fire-and-forget) ✓
3. `await logAdminAction(...)` ✓
4. Send response ✓

Idempotent re-assignments (`affectedRows = 0`) skip both cache invalidation and audit logging.

### S12 — Logging Order in `revokeRole`

`logAdminAction` is placed after the DELETE and after cache invalidation. The early-return path (`if (result.affectedRows === 0) return res.status(404)...`) exits before `logAdminAction` is reached — no phantom audit entries for non-existent revocations. Correct sequence:
1. C5 lockout guard ✓
2. pre-DELETE SELECT (before snapshot capture) ✓
3. DELETE admin_user_roles ✓
4. 404 return if affectedRows = 0 (exits before logAdminAction) ✓
5. Cache invalidation (fire-and-forget) ✓
6. `await logAdminAction(...)` ✓
7. Send response ✓

### S13 — pre-DELETE SELECT Error Isolation

The before-snapshot SELECT in `revokeRole` is wrapped in its own try/catch (lines 221–241). If it throws, `beforeSnapshot` remains `null`, a warning is logged, and the DELETE proceeds normally. The business action (DELETE) is not affected by snapshot query failures.

### S14 — PM2 Startup Safety

`auditLog.service.js` module body executes only:
- ESM import declarations (resolved at startup, not executed)
- `BLOCKED_FIELDS` Set construction (synchronous constant initialization)
- `MAX_SNAPSHOT_BYTES` constant assignment

No DB connections, Redis connections, feature flag evaluations, or scheduled jobs at module load. Startup cannot fail because of this module.

### S15 — IP Capture and Loopback Guard

```javascript
const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
         ?? (req.ip !== "127.0.0.1" ? req.ip : null);
```
Correctly implements C3 design patch: X-Forwarded-For is the primary source; `req.ip` is the fallback only if it is not the Nginx loopback address; otherwise `null` is stored. No silent corruption with a misleading `127.0.0.1` value.

### S16 — INSERT Column/Parameter Count Match

INSERT columns (11): `admin_id, actor_type, action, target_type, target_id, before_json, after_json, ip_address, user_agent, permission_checked, metadata_json`

INSERT VALUES: `(?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, ?)` — `'admin'` is a SQL literal, 10 `?` placeholders.

Parameters array: 10 items `[adminId, action, targetType, targetId, finalBefore, finalAfter, ip, ua, permissionChecked, metadata]`.

Column count (11) = literal (1) + `?` count (10) ✓. Parameters array (10) = `?` count (10) ✓. **No mismatch.**

### S17 — No Recursion Risk in `redactDeep`

Input to `redactDeep` is always the output of `JSON.parse(JSON.stringify(obj))` — a plain JavaScript value with no circular references, prototype chain entries, getters, or setters. `redactDeep` walks a finite tree and terminates on every valid JSON value.

### S18 — Package.json Scripts

Both new scripts are syntactically correct and use the right migration filename:
```json
"migrate:admin:audit":     "node scripts/run-admin-migration.js --file 054_admin_audit_log.sql",
"migrate:admin:audit:dry": "node scripts/run-admin-migration.js --file 054_admin_audit_log.sql --dry-run"
```
`054_admin_audit_log.sql` is already in the runner's `ADMIN_MIGRATION_FILES` whitelist at index 3. `package.json` is valid JSON (verified via `node -e`).

---

## HIGH-RISK FILES / FLOWS

### HR1 — `rbac.admin.controller.js` (B1 Blocker Location)

The only deployed Slice 3 file modified by Slice 4. The B1 blocker is in this file's `revokeRole` role lookup query. Additionally, the `assignRole` modification is correctly guarded inside `affectedRows > 0`, but the entire controller's outer try/catch now wraps more code — any exception thrown by the pre-DELETE SELECT that escapes its inner try/catch would propagate to the controller's outer catch and return 500. The inner try/catch correctly prevents this, but the flow is more complex than Slice 3.

### HR2 — `auditLog.service.js` Sanitization Path (C1 Correction Location)

The JSON.stringify null issue (C1) could cause subtle data quality degradation that accumulates silently across all `assignRole` audit entries — the rows exist but `before_json` stores JSON null instead of SQL NULL, breaking future `WHERE before_json IS NULL` filters. This is the highest-risk silent failure in the implementation.

### HR3 — `admin/index.js` Barrel (Blast Radius)

A syntax error or unresolvable import in `auditLog.service.js` would break the barrel, preventing `server.js` from importing `platformRouter` and `rbacRouter`, causing a PM2 startup loop. The `node --check` passes and barrel import verification succeeded, but this risk persists for any future edits to `auditLog.service.js`.

---

## Pre-Implementation Patch Requirements

Before deploying, apply these two targeted fixes:

### Fix for B1 — `rbac.admin.controller.js` `revokeRole` role lookup

Change:
```javascript
"SELECT id, is_superadmin FROM admin_roles WHERE id = ?"
```
To:
```javascript
"SELECT id, role_name, is_superadmin FROM admin_roles WHERE id = ?"
```
This is a one-word addition that makes `targetRole.role_name` available for the before snapshot.

### Fix for C1 — `auditLog.service.js` INSERT null handling

Change:
```javascript
finalBefore  !== undefined ? JSON.stringify(finalBefore)  : null,
finalAfter   !== undefined ? JSON.stringify(finalAfter)   : null,
```
To:
```javascript
finalBefore != null ? JSON.stringify(finalBefore) : null,
finalAfter  != null ? JSON.stringify(finalAfter)  : null,
```
This ensures `null` snapshots are stored as SQL NULL (not the JSON string `"null"`).

After applying both fixes, re-run `node --check` on `rbac.admin.controller.js` and `auditLog.service.js`.

---

## Review by File

| File | Status | Notes |
|---|---|---|
| `054_admin_audit_log.sql` | SAFE | Idempotent DDL, correct schema, correct indexes, no FKs |
| `054_admin_audit_log.rollback.sql` | SAFE | Correct DROP + tracking row removal, DDL COMMIT documented |
| `auditLog.service.js` | CORRECTION (C1) | JSON.stringify(null) issue in INSERT parameters |
| `rbac.admin.controller.js` | BLOCKER (B1) | revokeRole role lookup missing role_name |
| `admin/index.js` | SAFE | Additive Slice 4 export, all Slice 2/3 exports preserved |
| `package.json` | SAFE | Valid JSON, correct script values, correct migration filename |

---

*Document version: 1.0 — File-level review only. No implementation.*  
*Next step: Apply B1 and C1 patches to implementation files, then re-run node --check, then deploy.*
