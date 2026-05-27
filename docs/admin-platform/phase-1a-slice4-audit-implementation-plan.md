# Otofine Admin Platform — Phase 1A Slice 4: Audit Log Foundation
## Implementation Plan

**Status:** PLANNING ONLY — no implementation  
**Date:** 2026-05-27  
**Source of truth:** `phase-1a-slice4-audit-design.md` (patched), `phase-1a-slice4-audit-review.md`  
**Deployed baseline:** Slice 1 (schema_migrations), Slice 2 (feature flags), Slice 3 (RBAC)

---

## 1. File Inventory

### 1.1 New Files (3)

```
backend/migrations/054_admin_audit_log.sql
backend/migrations/054_admin_audit_log.rollback.sql
backend/modules/admin/core/auditLog/auditLog.service.js
```

### 1.2 Modified Files (3)

```
backend/modules/admin/rbac/controllers/rbac.admin.controller.js
  ← additive: import logAdminAction
  ← additive: logAdminAction call in assignRole (when affectedRows > 0)
  ← additive: pre-DELETE SELECT + logAdminAction call in revokeRole

backend/modules/admin/index.js
  ← additive: export { logAdminAction } from auditLog service

backend/package.json
  ← additive: two new npm scripts
```

### 1.3 Explicitly Unchanged Files

The following files must NOT be touched under any circumstances:

```
backend/scripts/run-admin-migration.js       ← 054 already in whitelist
backend/modules/admin/core/rbac/             ← entire Slice 3 RBAC core
backend/modules/admin/rbac/routes/           ← Slice 3 RBAC routes
backend/modules/admin/platform/              ← Slice 2 platform routes
backend/modules/admin/core/featureFlags/     ← Slice 2 feature flag service
backend/modules/admin/config/                ← Slice 2 config
backend/domains/auth/                        ← never touch
backend/middlewares/auth.js                  ← never touch
backend/routes/admin.routes.js               ← never touch
backend/controllers/adminController.js       ← never touch
backend/server.js                            ← never touch
backend/.env                                 ← flag already seeded
frontend/                                    ← no frontend changes in Slice 4
```

---

## 2. Migration Plan

### 2.1 File: `054_admin_audit_log.sql`

Full content specification:

```sql
-- Admin audit log table.
-- Migration: 054_admin_audit_log.sql
-- Runner: run-admin-migration.js (054 already in whitelist)
-- Idempotent: CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                 BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  admin_id           INT UNSIGNED      NULL,
  actor_type         ENUM('admin', 'superadmin', 'system') NOT NULL DEFAULT 'admin',
  action             VARCHAR(100)      NOT NULL,
  target_type        VARCHAR(50)       NULL,
  target_id          BIGINT UNSIGNED   NULL,
  before_json        JSON              NULL,
  after_json         JSON              NULL,
  ip_address         VARCHAR(45)       NULL,
  user_agent         VARCHAR(512)      NULL,
  permission_checked VARCHAR(64)       NULL,
  metadata_json      JSON              NULL,
  created_at         DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  INDEX idx_aal_admin_created (admin_id, created_at),
  INDEX idx_aal_target        (target_type, target_id),
  INDEX idx_aal_action        (action),
  INDEX idx_aal_created       (created_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

No seed data. No foreign keys. `CREATE TABLE IF NOT EXISTS` ensures idempotency.

### 2.2 File: `054_admin_audit_log.rollback.sql`

```sql
-- Rollback: 054_admin_audit_log.sql
-- WARNING: All audit log entries are permanently destroyed.
-- Only run if the table itself causes a production incident.

DROP TABLE IF EXISTS admin_audit_log;
DELETE FROM schema_migrations WHERE filename = '054_admin_audit_log.sql';
```

**Note:** `DROP TABLE` is DDL and causes an implicit InnoDB COMMIT immediately. The `DELETE FROM schema_migrations` is a separate DML statement that runs after. If the session dies between them, the tracking row persists — this is handled by re-running the migration (idempotent).

### 2.3 npm Scripts to Add

Add to `backend/package.json` scripts block, alongside the existing `migrate:admin:rbac` lines:

```json
"migrate:admin:audit":     "node scripts/run-admin-migration.js --file 054_admin_audit_log.sql",
"migrate:admin:audit:dry": "node scripts/run-admin-migration.js --file 054_admin_audit_log.sql --dry-run"
```

### 2.4 Post-Migration Validation Queries

```sql
-- 1. Table exists
SHOW TABLES LIKE 'admin_audit_log';
-- Expected: 1 row

-- 2. Schema is correct
DESCRIBE admin_audit_log;
-- Expected: 13 columns matching spec

-- 3. Indexes exist
SHOW INDEX FROM admin_audit_log;
-- Expected: PRIMARY + idx_aal_admin_created + idx_aal_target + idx_aal_action + idx_aal_created

-- 4. Table starts empty
SELECT COUNT(*) FROM admin_audit_log;
-- Expected: 0

-- 5. Migration tracking row exists
SELECT filename, applied_at, checksum
FROM schema_migrations
WHERE filename = '054_admin_audit_log.sql';
-- Expected: 1 row
```

---

## 3. `auditLog.service.js` — Full Specification

### 3.1 Location

```
backend/modules/admin/core/auditLog/auditLog.service.js
```

### 3.2 Import Chain

```
auditLog.service.js
  → isFeatureEnabled, adminPlatformConfig  (Slice 2 — relative paths)
  → pool                                   (backend/config/db.js)
  → crypto                                 (Node.js built-in)
```

Relative import paths from `backend/modules/admin/core/auditLog/`:
- Feature flags: `../featureFlags/featureFlag.service.js`
- Config: `../../config/adminPlatform.config.js`
- DB pool: `../../../../config/db.js`
- Crypto: `node:crypto` (built-in, always available)

### 3.3 Sensitive Field Blocklist

```javascript
const BLOCKED_FIELDS = new Set([
  "password", "passwordhash", "hashedpassword", "hash",
  "token", "accesstoken", "refreshtoken", "idtoken",
  "secret", "apikey", "apisecret", "clientsecret",
  "otp", "totp", "pin",
  "sessionid", "sessiontoken",
  "privatekey", "signingkey",
]);
```

All comparisons are lowercased (`key.toLowerCase()`). Matches the exact field name — does NOT match substrings (e.g., `shopHash` is NOT blocked; only `hash` as a standalone field name is blocked).

### 3.4 `sanitizeSnapshot(obj)` — Logic Contract

```
sanitizeSnapshot(obj):
  if obj is null or undefined: return obj as-is
  if obj is a primitive (string, number, boolean): return as-is
  if obj is an Array: return obj.map(element => sanitizeSnapshot(element))
  if obj is an Object:
    deep clone via JSON.parse(JSON.stringify(obj))
      → if JSON.stringify throws (circular ref, BigInt): catch → log warning → return null
    recursively walk all keys:
      if key.toLowerCase() is in BLOCKED_FIELDS: replace value with "[REDACTED]"
      else if value is Object or Array: recurse
    return sanitized clone
```

If `sanitizeSnapshot` throws for any reason: return `null` (not a placeholder object). Log a warning with `console.warn('[audit:log] sanitizeSnapshot failed:', err.message)`.

### 3.5 Size Limit — Logic Contract

After sanitization and before INSERT:
```
JSON.stringify(sanitizedBefore) → if length > 65536 bytes:
  sanitizedBefore = {
    _truncated: true,
    _reason: "snapshot exceeded 64KB",
    _keys: Object.keys(originalBefore)
  }
  console.warn('[audit:log] snapshot truncated for action', action)
```

Apply the same check independently to `sanitizedAfter`.

### 3.6 IP Capture — Logic Contract

```javascript
const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
         ?? (req.ip !== '127.0.0.1' ? req.ip : null);
```

If neither source yields a non-loopback IP, `ip_address` is `null`.

**Pre-deploy prerequisite (C3):** Verify `app.set('trust proxy', 1)` is present in `server.js`. If absent, add before deploying Slice 4. This is a named checkpoint in the activation sequence.

> **Verified:** `server.js` does NOT currently contain `app.set('trust proxy', ...)`. This must be added as a named pre-deploy step before Slice 4 is deployed. However, because `server.js` is on the forbidden modification list for Slice 4, this must be treated as a separate operational prerequisite — not a Slice 4 file change. The IP capture logic in `auditLog.service.js` uses the `X-Forwarded-For` header as the primary source; `req.ip` is only the fallback, and the loopback guard prevents silent corruption.

### 3.7 `logAdminAction` — Full Function Contract

```
logAdminAction({
  adminId,       ← req.user.id (INT)
  action,        ← string: "rbac.role.assign" | "rbac.role.revoke"
  targetType,    ← string: "admin_user_roles"
  targetId,      ← INT (adminId of the subject being role-changed)
  before,        ← object | null (will be sanitized internally)
  after,         ← object | null (will be sanitized internally)
  req,           ← Express request object (for ip, user_agent, permission_checked)
})
```

**Internal execution order:**

```
1. Check isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")
   → false or throws-with-ENV-fallback-false: return immediately (no-op)
   → true: continue

2. sanitizeSnapshot(before) → sanitizedBefore (or null on failure)
3. sanitizeSnapshot(after)  → sanitizedAfter  (or null on failure)

4. Size limit check on sanitizedBefore (64 KB)
5. Size limit check on sanitizedAfter  (64 KB)

6. Capture request metadata:
   ip      = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
             ?? (req.ip !== '127.0.0.1' ? req.ip : null)
   ua      = (req.headers['user-agent'] ?? '').slice(0, 512)
   permKey = req.adminPermissionChecked ?? null

7. Generate request_id:
   crypto.randomUUID() (Node 14.17+) with fallback to Date.now().toString()

8. pool.query(INSERT INTO admin_audit_log ...)
   → on success: return (no value needed)
   → on error: console.error('[audit:log] write failed:', err.message)
               return (swallow — best-effort)
```

**Top-level try/catch:** The entire function body is wrapped in try/catch. Any unhandled error inside is caught, logged, and swallowed. The caller never sees a thrown error from `logAdminAction`.

### 3.8 Exports

```javascript
export { logAdminAction };
// sanitizeSnapshot is internal — NOT exported
```

---

## 4. RBAC Controller Integration

### 4.1 Integration Points in `rbac.admin.controller.js`

**New import (additive — line to add after existing imports):**

```javascript
import { logAdminAction } from "../../core/auditLog/auditLog.service.js";
```

Relative path from `backend/modules/admin/rbac/controllers/rbac.admin.controller.js` to `backend/modules/admin/core/auditLog/auditLog.service.js`:
- Up 2 levels (`../../`) = `backend/modules/admin/`
- Then `core/auditLog/auditLog.service.js`

### 4.2 `assignRole` — Additive Changes

**No changes to existing logic.** Additive only: insert `logAdminAction` call after the cache invalidation, inside the `if (insertResult.affectedRows > 0)` block:

```
[existing] const [insertResult] = await pool.query(INSERT IGNORE ...)

[existing] if (insertResult.affectedRows > 0) {
[existing]   invalidateAdminRbacCache(adminId).catch(() => {});
[NEW]        await logAdminAction({
[NEW]          adminId:    req.user.id,
[NEW]          action:     "rbac.role.assign",
[NEW]          targetType: "admin_user_roles",
[NEW]          targetId:   adminId,
[NEW]          before:     null,
[NEW]          after: {
[NEW]            admin_id:   adminId,
[NEW]            role_id:    roleId,
[NEW]            role_name:  targetRole.role_name,
[NEW]            granted_by: req.user.id,
[NEW]          },
[NEW]          req,
[NEW]        });
[existing] }

[existing] const statusCode = insertResult.affectedRows > 0 ? 201 : 200;
[existing] return res.status(statusCode).json({ ok: true, adminId, roleId });
```

**Idempotent no-op (affectedRows = 0):** `logAdminAction` is NOT called. No audit entry for re-assignments that changed nothing.

### 4.3 `revokeRole` — Additive Changes

**New step: pre-DELETE SELECT.** Added after the C5 lockout guard, before the DELETE:

```
[existing] // C5: Last-superadmin lockout guard
[existing] if (targetRole.is_superadmin) { ... }

[NEW]    // Capture before-snapshot for audit log (C4 design patch)
[NEW]    // SELECT must run BEFORE DELETE to capture granted_by and granted_at.
[NEW]    let beforeSnapshot = null;
[NEW]    try {
[NEW]      const [assignmentRows] = await pool.query(
[NEW]        "SELECT granted_by, granted_at FROM admin_user_roles WHERE admin_id = ? AND role_id = ?",
[NEW]        [adminId, roleId],
[NEW]      );
[NEW]      if (assignmentRows.length > 0) {
[NEW]        beforeSnapshot = {
[NEW]          admin_id:   adminId,
[NEW]          role_id:    roleId,
[NEW]          role_name:  targetRole.role_name,
[NEW]          granted_by: assignmentRows[0].granted_by,
[NEW]          granted_at: assignmentRows[0].granted_at,
[NEW]        };
[NEW]      }
[NEW]    } catch (snapshotErr) {
[NEW]      console.warn("[rbac:controller] revokeRole before-snapshot query failed:", snapshotErr.message);
[NEW]      // beforeSnapshot remains null — audit proceeds with null before
[NEW]    }

[existing] const [result] = await pool.query(
[existing]   "DELETE FROM admin_user_roles WHERE admin_id = ? AND role_id = ?",
[existing]   [adminId, roleId],
[existing] );

[existing] if (result.affectedRows === 0) {
[existing]   return res.status(404).json({ error: "Assignment not found" });
[existing] }

[existing] invalidateAdminRbacCache(adminId).catch(() => {});

[NEW]    await logAdminAction({
[NEW]      adminId:    req.user.id,
[NEW]      action:     "rbac.role.revoke",
[NEW]      targetType: "admin_user_roles",
[NEW]      targetId:   adminId,
[NEW]      before:     beforeSnapshot,
[NEW]      after:      null,
[NEW]      req,
[NEW]    });

[existing] return res.json({ ok: true, adminId, roleId });
```

**Before snapshot SELECT failure:** If the SELECT throws, `beforeSnapshot = null`, the audit entry is inserted with `before_json = null`, and the revocation still proceeds normally. The SELECT failure does not abort the DELETE.

**If assignment does not exist:** `assignmentRows.length === 0` → `beforeSnapshot = null`. The subsequent DELETE returns `affectedRows = 0` → 404 response before `logAdminAction` is called.

### 4.4 Logging Order: Final Sequence

```
assignRole:
  1. Validate inputs
  2. SELECT admin_roles (role exists + is_superadmin check)
  3. C2 escalation guard
  4. INSERT IGNORE admin_user_roles
  5. [if affectedRows > 0] invalidateAdminRbacCache (fire-and-forget)
  6. [if affectedRows > 0] await logAdminAction
  7. Send response

revokeRole:
  1. Validate inputs
  2. SELECT admin_roles (role exists + is_superadmin check)
  3. C5 lockout guard
  4. [NEW] SELECT admin_user_roles (capture granted_by, granted_at)
  5. DELETE admin_user_roles
  6. [if affectedRows = 0] return 404
  7. invalidateAdminRbacCache (fire-and-forget)
  8. [NEW] await logAdminAction
  9. Send response
```

---

## 5. Barrel Export — `admin/index.js`

Add the following line after the existing Slice 3 exports section, as a new Slice 4 section:

```javascript
// ── Slice 4: Audit Log service ───────────────────────────────────────────────
export { logAdminAction } from "./core/auditLog/auditLog.service.js";
```

All existing Slice 2 and Slice 3 exports are preserved verbatim. No lines removed or modified.

---

## 6. Runtime Flow Diagrams

### 6.1 Full Request Flow (assignRole with audit enabled)

```
POST /api/admin/rbac/admins/:adminId/roles
  │
  ├── requireAuth             → validates JWT, sets req.user
  ├── requireAdmin            → verifies req.user.role === 'admin'
  ├── requirePermission       → resolves RBAC perms (Redis/DB)
  │   ("rbac:manage")          sets req.adminPermissionChecked = "rbac:manage"
  │
  └── assignRole handler:
        validate adminId, roleId
        SELECT admin_roles (role lookup)
        C2 guard (superadmin check if needed)
        INSERT IGNORE admin_user_roles
        if affectedRows > 0:
          invalidateAdminRbacCache(adminId)  [fire-and-forget]
          await logAdminAction({...})
            → isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")
                Redis GET → true/false (60s TTL)
            → if false: return no-op
            → sanitizeSnapshot(before=null) → null
            → sanitizeSnapshot(after={...}) → sanitized object
            → size check: pass
            → capture ip, user_agent, permission_checked
            → crypto.randomUUID() → request_id
            → INSERT INTO admin_audit_log
            → on error: console.error + return (best-effort)
        return res.status(201/200).json({ ok: true, adminId, roleId })
```

### 6.2 Feature Flag Gating Flow

```
logAdminAction called
  │
  ├── isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")
  │     ├── Layer 1: Redis GET admin:ff:ADMIN_AUDIT_LOG_ENABLED
  │     │     hit: "0" → false   hit: "1" → true   miss: continue
  │     ├── Layer 2: DB SELECT admin_feature_flags WHERE flag_key = ?
  │     │     found: cache in Redis (60s TTL) → return DB value
  │     │     not found / error: continue
  │     └── Layer 3: adminPlatformConfig.auditLogEnabled (ENV = false by default)
  │
  ├── result = false → return immediately (no INSERT, no-op)
  └── result = true  → proceed with INSERT path
```

### 6.3 Sanitization Flow

```
sanitizeSnapshot(obj)
  │
  ├── null/undefined → return null
  ├── primitive → return as-is
  ├── Array → map each element through sanitizeSnapshot
  └── Object:
        try JSON.parse(JSON.stringify(obj))  [deep clone]
          on failure → return null (circular refs, BigInt)
        walk all keys recursively:
          key.toLowerCase() in BLOCKED_FIELDS → replace with "[REDACTED]"
          value is Object/Array → recurse
        return sanitized clone
```

---

## 7. PM2 Startup Safety

### 7.1 Import Chain — No Side Effects

```
server.js
  → admin/index.js (barrel)
      → auditLog.service.js  [NEW]
          → featureFlag.service.js  [Slice 2, stable]
          → adminPlatform.config.js [Slice 2, stable]
          → config/db.js            [stable]
          → node:crypto             [built-in]
```

`auditLog.service.js` has zero module-level side effects:
- No DB connection at module load
- No Redis connection at module load
- No feature flag evaluation at module load
- No scheduled jobs at module load

If `auditLog.service.js` fails to import (syntax error, wrong path): the barrel `admin/index.js` fails → `server.js` startup fails → PM2 restart loop. **Prevention:** `node --check` before PM2 restart.

### 7.2 Barrel Blast Radius

The barrel `admin/index.js` now imports one additional file (`auditLog.service.js`). If that file has any syntax or import error, the blast radius is the same as Slice 3: both `platformRouter` (Slice 2) and `rbacRouter` (Slice 3) fail to load.

**Mitigation:** Mandatory `node --check` + barrel import verification before PM2 restart.

### 7.3 No Startup Gate Needed

Unlike `rbac.admin.routes.js` (which required a startup gate to return 404 when RBAC is disabled), `auditLog.service.js` has no HTTP routes. The feature flag is checked per-call inside `logAdminAction`. No startup gate is required.

---

## 8. Hidden Deployment Sequence

### 8.1 Deploy Order

```
Phase A — Migration (DB only, no restart needed):
  1. npm run migrate:admin:audit:dry   ← dry-run verify
  2. npm run migrate:admin:audit       ← apply migration
  3. Run §2.4 validation queries
  4. Confirm admin_audit_log is empty and indexed correctly

Phase B — Service + Barrel (code deploy, restart required):
  5. Write auditLog.service.js
  6. Modify admin/index.js (additive export)
  7. node --check backend/modules/admin/core/auditLog/auditLog.service.js
  8. node --check backend/modules/admin/index.js
  9. Barrel import verification:
     node -e "import('./modules/admin/index.js').then(m => console.log(Object.keys(m)))"
     (run from /var/www/otofine/backend)
     Expected output includes: platformRouter, rbacRouter, logAdminAction

Phase C — Controller Integration (code deploy, restart required):
  10. Modify rbac.admin.controller.js (additive import + logAdminAction calls)
  11. node --check backend/modules/admin/rbac/controllers/rbac.admin.controller.js
  12. Add package.json migrate:admin:audit scripts

Phase D — PM2 Restart:
  13. pm2 restart api --update-env
  14. pm2 logs api --lines 50 (confirm no startup errors)
  15. Verify RBAC routes still work: GET /api/admin/rbac/roles → 200
  16. Confirm admin_audit_log is still empty (flag is false, no writes)

Phase E — Activation (flag enable):
  17. Verify app.set('trust proxy', ...) in server.js (C3 prerequisite — see §14)
  18. Enable flag:
      UPDATE admin_feature_flags SET is_enabled = 1
      WHERE flag_key = 'ADMIN_AUDIT_LOG_ENABLED';
  19. Wait 60s for Redis TTL to expire (or invalidate: npm run ... invalidate)
  20. Test: POST /api/admin/rbac/admins/:adminId/roles → verify 1 row in admin_audit_log
  21. Inspect row: action='rbac.role.assign', permission_checked='rbac:manage',
      before_json=null, after_json not null, ip_address not 127.0.0.1
  22. Test: DELETE /api/admin/rbac/admins/:adminId/roles/:roleId
      → verify 1 row with action='rbac.role.revoke', before_json not null,
        before_json contains granted_by and granted_at
  23. Verify no sensitive fields in after_json / before_json
  24. Verify no storefront regression (GET any product page → 200)
```

---

## 9. Smoke Tests

### 9.1 Smoke Test 1 — Audit Log Disabled (Flag Off, Default State)

```
Precondition: ADMIN_AUDIT_LOG_ENABLED = false (default)
Action: POST /api/admin/rbac/admins/:adminId/roles { roleId: 1 }
Expected HTTP: 201 (same as Slice 3)
Expected DB: admin_audit_log COUNT(*) = 0
Verifies: hidden deployment semantics hold; no audit writes when disabled
```

### 9.2 Smoke Test 2 — assignRole Logged (Flag On)

```
Precondition: ADMIN_AUDIT_LOG_ENABLED = true
Action: POST /api/admin/rbac/admins/:adminId/roles { roleId: 1 }
Expected HTTP: 201
Expected DB: admin_audit_log COUNT(*) = 1
Verify row:
  action           = 'rbac.role.assign'
  target_type      = 'admin_user_roles'
  target_id        = <adminId>
  before_json      = NULL
  after_json       contains { admin_id, role_id, role_name, granted_by }
  permission_checked = 'rbac:manage'
  ip_address       ≠ NULL and ≠ '127.0.0.1'
  metadata_json    contains { request_id: <uuid> }
Verifies: standard logging flow, correct snapshot, RBAC integration
```

### 9.3 Smoke Test 3 — Idempotent assignRole NOT Logged

```
Precondition: Admin already has roleId=1 assigned. Flag = true.
Action: POST /api/admin/rbac/admins/:adminId/roles { roleId: 1 }
Expected HTTP: 200 (idempotent — Slice 3 C1)
Expected DB: admin_audit_log row count unchanged
Verifies: idempotent no-op is not logged (INSERT IGNORE affectedRows=0)
```

### 9.4 Smoke Test 4 — revokeRole Logged with Full Before Snapshot

```
Precondition: Admin has roleId=1 assigned. Flag = true.
Action: DELETE /api/admin/rbac/admins/:adminId/roles/1
Expected HTTP: 200
Expected DB: admin_audit_log COUNT(*) = 1 (new row)
Verify row:
  action      = 'rbac.role.revoke'
  before_json contains { admin_id, role_id, role_name, granted_by, granted_at }
  after_json  = NULL
Verifies: C4 patch — granted_by and granted_at captured from pre-DELETE SELECT
```

### 9.5 Smoke Test 5 — Sensitive Field Stripping

```
Precondition: Flag = true.
Action: Manually call logAdminAction with a snapshot containing { admin_id: 5, password: "secret123" }
  (test only — done via node REPL or unit test, not via HTTP)
Expected: INSERT is made with after_json = { admin_id: 5, password: "[REDACTED]" }
Verifies: sanitizeSnapshot strips known sensitive fields
```

### 9.6 Smoke Test 6 — RBAC Routes Unaffected (Flag Off)

```
Precondition: Flag = false.
Action: GET /api/admin/rbac/roles
Expected HTTP: 200 (unchanged Slice 3 behavior)
Action: GET /api/admin/rbac/admins/:adminId/roles
Expected HTTP: 200 (unchanged Slice 3 behavior)
Verifies: read-only RBAC routes have zero regression
```

### 9.7 Smoke Test 7 — Storefront Smoke Test

```
Action: GET / (any storefront page), GET /api/products (any product list)
Expected: all 200, response times unchanged
Verifies: audit log code is not in any storefront path
```

---

## 10. Rollback Strategy

### 10.1 Rollback Trigger Conditions

Mandatory rollback if any of the following occur within 30 minutes of PM2 restart:

- PM2 restart loop (startup crash)
- `GET /api/admin/rbac/roles` returns non-200 after restart
- `GET /api/admin/platform/features` returns non-200 after restart
- Any storefront page returns non-200
- `[audit:log] write failed:` errors appearing in logs at > 5% rate after flag enabled
- `admin_audit_log` table missing (migration failed silently)

### 10.2 Rollback Procedure

**Step 1 — Feature flag deactivation (first response, takes effect within 60s):**
```sql
UPDATE admin_feature_flags SET is_enabled = 0
WHERE flag_key = 'ADMIN_AUDIT_LOG_ENABLED';
```

**Step 2 — Code rollback (if startup crash or controller regression):**
```bash
git revert <slice4-commit-sha> --no-edit
node --check backend/modules/admin/index.js
node --check backend/modules/admin/rbac/controllers/rbac.admin.controller.js
pm2 restart api --update-env
# Verify: GET /api/admin/rbac/roles → 200
# Verify: GET /api/admin/platform/features → 200
```

Code rollback removes:
- `logAdminAction` import from `rbac.admin.controller.js`
- `logAdminAction` calls from `assignRole` and `revokeRole`
- The pre-DELETE SELECT from `revokeRole`
- The barrel export in `admin/index.js`
- The package.json scripts

The `admin_audit_log` table is NOT dropped by code rollback. It simply receives no new rows.

**Step 3 — Migration rollback (only if the table itself causes an incident):**
```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME \
  < backend/migrations/054_admin_audit_log.rollback.sql
# WARNING: all audit log entries permanently lost
```

---

## 11. Operational Recovery Procedures

### 11.1 Audit Log Gap

A gap in the audit log (due to flag-disabled period or write failures) is permanent. Document it as an incident note with date range and cause. No data recovery is possible under best-effort semantics.

### 11.2 Duplicate Entries

If `logAdminAction` is called twice for the same action (retry scenario): duplicate rows are inserted. Duplicates can be identified by comparing `metadata_json->>'$.request_id'` + `created_at`. No deduplication logic in Slice 4.

### 11.3 Table Accidentally Dropped

Re-run `npm run migrate:admin:audit` — the migration recreates the table empty. All historical entries are lost. `logAdminAction` calls will fail until recreated; all errors are caught and swallowed.

### 11.4 `trust proxy` Not Set (C3 Risk)

If `app.set('trust proxy', ...)` is missing from `server.js` and `X-Forwarded-For` is absent, `ip_address` is stored as `null` (not `127.0.0.1` — the loopback guard in `logAdminAction` prevents silent corruption). The audit log is still operationally useful without IP data.

---

## 12. Dangerous File List

Files where a mistake causes a production incident:

| File | Risk | Why dangerous |
|---|---|---|
| `rbac.admin.controller.js` | HIGH | Only deployed Slice 3 file being modified; must preserve C2, C5, cache invalidation ordering |
| `admin/index.js` | HIGH | Barrel failure breaks platformRouter + rbacRouter (live Slice 2/3) |
| `auditLog.service.js` | MEDIUM | Sanitization bug could leak sensitive data into audit log |
| `054_admin_audit_log.sql` | LOW | `CREATE TABLE IF NOT EXISTS` is idempotent; no FKs to production tables |

---

## 13. Forbidden Modifications

The following are absolutely forbidden during Slice 4 implementation:

```
FORBIDDEN: Modify server.js
FORBIDDEN: Modify backend/middlewares/auth.js
FORBIDDEN: Modify backend/routes/admin.routes.js
FORBIDDEN: Modify backend/controllers/adminController.js
FORBIDDEN: Modify backend/modules/admin/core/rbac/ (any file)
FORBIDDEN: Modify backend/modules/admin/rbac/routes/ (any file)
FORBIDDEN: Modify backend/modules/admin/platform/ (any file)
FORBIDDEN: Modify backend/modules/admin/core/featureFlags/ (any file)
FORBIDDEN: Modify backend/modules/admin/config/ (any file)
FORBIDDEN: Modify backend/scripts/run-admin-migration.js
FORBIDDEN: Modify backend/.env
FORBIDDEN: Modify frontend/ (any file)
FORBIDDEN: Add UPDATE/DELETE/TRUNCATE to auditLog.service.js
FORBIDDEN: Export sanitizeSnapshot from auditLog.service.js
FORBIDDEN: Call logAdminAction before the business DB write succeeds
FORBIDDEN: Call logAdminAction inside a fire-and-forget detached promise
FORBIDDEN: Add a physical FK from admin_audit_log to any other table
FORBIDDEN: Move the logAdminAction call outside the affectedRows > 0 guard in assignRole
FORBIDDEN: Call logAdminAction on idempotent re-assignment (affectedRows = 0)
```

---

## 14. Pre-Deploy Checklist

Before running any migration or deploying any code:

```
[ ] Verify admin_feature_flags row ADMIN_AUDIT_LOG_ENABLED = 0
    SELECT flag_key, is_enabled FROM admin_feature_flags
    WHERE flag_key = 'ADMIN_AUDIT_LOG_ENABLED';

[ ] Verify 054_admin_audit_log.sql is in ADMIN_MIGRATION_FILES whitelist
    (Confirmed — index 3 in run-admin-migration.js)

[ ] Verify PM2 api process is running
    pm2 list

[ ] Verify Slice 3 RBAC routes work
    GET /api/admin/rbac/roles → 200

[ ] Verify Slice 2 platform routes work
    GET /api/admin/platform/features → 200

[ ] Verify storefront is healthy
    curl -s -o /dev/null -w "%{http_code}" https://otofine.com/

[ ] Verify app.set('trust proxy', ...) in server.js
    grep 'trust proxy' backend/server.js
    ACTION REQUIRED IF MISSING: add app.set('trust proxy', 1) to server.js
    before deploying Slice 4 (separate operational step, not a Slice 4 file)

[ ] Confirm git branch is clean / on correct branch
    git status
```

---

## 15. Regression Checklist

After PM2 restart (Phase D), before activating the flag:

```
[ ] GET /api/admin/rbac/roles → 200, correct JSON
[ ] GET /api/admin/rbac/permissions → 200
[ ] GET /api/admin/rbac/admins/:id/roles → 200
[ ] POST /api/admin/rbac/admins/:id/roles → 201 (Slice 3 behavior unchanged)
[ ] DELETE /api/admin/rbac/admins/:id/roles/:id → 200 (Slice 3 behavior unchanged)
[ ] GET /api/admin/platform/features → 200 (Slice 2 behavior unchanged)
[ ] Storefront: GET / → 200
[ ] Storefront: GET /api/products → 200
[ ] PM2 log: no [audit:log] errors
[ ] PM2 log: no startup errors
[ ] admin_audit_log: COUNT(*) = 0 (no writes while flag disabled)
```

After flag activation (Phase E):

```
[ ] Smoke Test 2: assignRole creates 1 audit log row
[ ] Smoke Test 3: idempotent assignRole creates 0 rows
[ ] Smoke Test 4: revokeRole creates 1 row with before_json containing granted_by
[ ] No sensitive fields in any JSON column
[ ] ip_address is not null and not 127.0.0.1
[ ] permission_checked = 'rbac:manage' in audit rows
[ ] RBAC assignment/revocation still works correctly (business action unaffected)
```

---

## 16. Implementation Review Checklist

Self-review before marking implementation complete:

```
[ ] auditLog.service.js has no UPDATE/DELETE SQL
[ ] auditLog.service.js exports only logAdminAction (not sanitizeSnapshot)
[ ] sanitizeSnapshot handles null, primitives, arrays, objects, circular refs
[ ] logAdminAction has a top-level try/catch that swallows all errors
[ ] logAdminAction does not throw to the caller under any circumstances
[ ] isFeatureEnabled error falls back to adminPlatformConfig.auditLogEnabled
[ ] IP loopback guard: 127.0.0.1 → null
[ ] user_agent truncated to 512 chars
[ ] request_id generated via crypto.randomUUID() with Date.now() fallback
[ ] assignRole: logAdminAction called only if affectedRows > 0
[ ] assignRole: logAdminAction called AFTER cache invalidation
[ ] revokeRole: pre-DELETE SELECT wrapped in try/catch (null fallback on failure)
[ ] revokeRole: logAdminAction called only if affectedRows > 0
[ ] revokeRole: logAdminAction called AFTER cache invalidation
[ ] admin/index.js preserves all Slice 2 + Slice 3 exports
[ ] admin/index.js new export is additive (Slice 4 section comment)
[ ] package.json: migrate:admin:audit and migrate:admin:audit:dry scripts added
[ ] node --check passes on all 3 modified/new JS files
[ ] Barrel import verification outputs logAdminAction in key list
[ ] Migration dry-run succeeds before applying
[ ] No circular imports in import chain
[ ] No changes to server.js, auth.js, rbac middleware/routes, feature flag service
```

---

## 17. Operational Constraints

1. **Feature flag is the only activation control.** No restart required to enable or disable audit logging after deploy.
2. **60-second cache TTL.** After enabling/disabling the flag via DB, wait up to 60 seconds for the Redis cache to expire before expecting behavior change. To force immediate effect: `invalidateFlagCache("ADMIN_AUDIT_LOG_ENABLED")` via the admin platform API.
3. **Best-effort is permanent for Slice 4.** A failed audit write never blocks the business action and never surfaces as a 500 to the client.
4. **Append-only is service-layer only.** No DB-level enforcement exists in Slice 4. Never add UPDATE/DELETE to `auditLog.service.js`.
5. **No retention management.** Rows accumulate indefinitely. The projected growth rate (~10–1000 rows/day) is safe for 2–3 years without intervention.
6. **Pre-DELETE SELECT is load-bearing.** Removing the pre-DELETE SELECT in `revokeRole` eliminates `granted_by` and `granted_at` from the before snapshot permanently. Once a revocation is logged without this data, it cannot be reconstructed.
7. **No new environment variables.** `ADMIN_AUDIT_LOG_ENABLED` is already in `.env` (Slice 2). No `.env` changes needed.
8. **`trust proxy` prerequisite.** This is an operational server configuration requirement that must be satisfied before Slice 4 activation, not a Slice 4 code change.

---

*Document version: 1.0 — Implementation plan only. No files written.*  
*Next step: Generate implementation files specification (`phase-1a-slice4-files.md`), then final file-level review, then implement.*
