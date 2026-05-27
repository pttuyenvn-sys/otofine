# Otofine Admin Platform — Phase 1A Slice 4: Audit Log Foundation
## Design + Architecture Document

**Status:** DESIGN ONLY — no implementation  
**Date:** 2026-05-27  
**Source of truth:** `admin-platform-architecture.md` §11, all system audit docs, Slice 1–3 implementation state  
**Deployed baseline:** Slice 1 (schema_migrations), Slice 2 (feature flags), Slice 3 (RBAC)

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Design Goals](#2-design-goals)
3. [Audit Log Table Design](#3-audit-log-table-design)
4. [Append-Only Guarantees](#4-append-only-guarantees)
5. [Runtime Logging Flow](#5-runtime-logging-flow)
6. [Best-Effort vs Strict Semantics](#6-best-effort-vs-strict-semantics)
7. [Feature Flag Integration](#7-feature-flag-integration)
8. [Sensitive Field Stripping](#8-sensitive-field-stripping)
9. [Before/After Snapshot Strategy](#9-beforeafter-snapshot-strategy)
10. [Request Metadata Capture](#10-request-metadata-capture)
11. [RBAC Integration](#11-rbac-integration)
12. [Middleware Integration Points](#12-middleware-integration-points)
13. [Redis/Cache Interaction Rules](#13-rediscache-interaction-rules)
14. [Failure Handling Semantics](#14-failure-handling-semantics)
15. [Module Structure](#15-module-structure)
16. [Migration Plan](#16-migration-plan)
17. [Hidden Deployment Strategy](#17-hidden-deployment-strategy)
18. [PM2 Startup Safety](#18-pm2-startup-safety)
19. [Query and Index Strategy](#19-query-and-index-strategy)
20. [Runtime Performance Considerations](#20-runtime-performance-considerations)
21. [Retention Strategy](#21-retention-strategy)
22. [Rollback Strategy](#22-rollback-strategy)
23. [Operational Recovery Procedures](#23-operational-recovery-procedures)
24. [Slice 4 Scope Constraints](#24-slice-4-scope-constraints)
25. [Dangerous Coupling Analysis](#25-dangerous-coupling-analysis)
26. [Implementation Phases](#26-implementation-phases)

---

## 1. Current State Analysis

### 1.1 Existing Admin Infrastructure

| Component | Status | Relevance to Slice 4 |
|---|---|---|
| `schema_migrations` table | Deployed (Slice 1) | Migration runner for `054_admin_audit_log.sql` |
| `admin_feature_flags` table | Deployed (Slice 2) | `ADMIN_AUDIT_LOG_ENABLED` flag already seeded as `false` |
| `isFeatureEnabled()` service | Deployed (Slice 2) | Gate for audit log writes |
| `adminPlatformConfig.auditLogEnabled` | Deployed (Slice 2) | ENV fallback for feature flag |
| `requirePermission()` middleware | Deployed (Slice 3) | Sets `req.adminPermissionChecked` before handler runs |
| `getAdminRbac()` service | Deployed (Slice 3) | Used in controller guards — not consumed by audit log |
| `admin_user_roles` table | Deployed (Slice 3) | First audit log consumer (RBAC role assignments) |

### 1.2 Migration Runner Whitelist

`run-admin-migration.js` `ADMIN_MIGRATION_FILES` already contains `"054_admin_audit_log.sql"` at index 3 (between `053_admin_rbac.sql` and `055_admin_feature_flags.sql`).

**No runner modification is needed for Slice 4.**

### 1.3 What Slice 4 Does NOT Replace

- `requireAdmin` middleware — unchanged
- JWT payload (`{ id, role, email }`) — unchanged
- Existing admin routes (`/api/admin/shops`, `/api/admin/rfq`, etc.) — unchanged
- Slice 2 `platformRouter` and feature flag service — unchanged
- Slice 3 `rbacRouter`, `requirePermission`, `getAdminRbac` — unchanged (behavior only extended by adding `logAdminAction` calls in the RBAC controllers)

---

## 2. Design Goals

1. **Append-only audit trail** for all RBAC management actions (Slice 4 scope)
2. **Best-effort semantics** — audit log failure never blocks the business action
3. **Feature-flag gated** — `ADMIN_AUDIT_LOG_ENABLED` controls writes at call time
4. **Sensitive field safe** — before/after snapshots strip credentials and secrets
5. **RBAC-aware** — captures `req.adminPermissionChecked` from Slice 3
6. **Hidden deployment** — table created and code deployed before the flag is enabled
7. **Additive only** — no modifications to existing tables, controllers, or auth
8. **PM2 safe** — no startup side effects, no new environment variables required

---

## 3. Audit Log Table Design

### 3.1 Table: `admin_audit_log`

**Migration file:** `054_admin_audit_log.sql` (already in runner whitelist)

```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Actor fields
  admin_id           INT UNSIGNED NULL,
  -- admin_id: logical reference to admin.id — NO physical FK (C4 pattern from Slice 3)
  -- NULL is reserved for future system-initiated actions (job runners, etc.)
  -- Must survive admin deletion without FK constraint violation
  actor_type         ENUM('admin', 'superadmin', 'system') NOT NULL DEFAULT 'admin',
  -- actor_type: 'admin' for all Slice 4 writes; 'superadmin' and 'system' reserved

  -- Action fields
  action             VARCHAR(100) NOT NULL,
  -- Format: {domain}.{subject}.{verb}
  -- Examples: rbac.role.assign, rbac.role.revoke, shop.status.update
  target_type        VARCHAR(50)  NULL,
  -- The entity type affected: 'admin_user_roles', 'admin_roles', 'shop', etc.
  target_id          BIGINT UNSIGNED NULL,
  -- The numeric primary key of the affected row (NULL for list-level actions)

  -- State snapshot fields
  before_json        JSON NULL,
  -- State of the entity BEFORE the action (NULL if not applicable, e.g. CREATE)
  -- Must be sanitized: no passwords, tokens, or secrets
  after_json         JSON NULL,
  -- State of the entity AFTER the action (NULL if not applicable, e.g. DELETE)
  -- Must be sanitized: no passwords, tokens, or secrets

  -- Request context fields
  ip_address         VARCHAR(45)  NULL,
  -- Supports IPv4 (15 chars) and IPv6 (39 chars max, 45 with zone ID)
  user_agent         VARCHAR(512) NULL,
  -- Truncated to 512 chars to prevent abuse
  permission_checked VARCHAR(64)  NULL,
  -- Populated from req.adminPermissionChecked (set by requirePermission before next())
  -- Slice 3 integration: links each audit entry to its RBAC permission check
  -- NULL for actions that bypass requirePermission (e.g. future system actions)

  -- Additional context
  metadata_json      JSON NULL,
  -- Freeform: { request_id, correlation_id, extra_context }
  -- request_id: UUID generated per request for log correlation
  -- correlation_id: links related log entries (e.g. bulk operations)

  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- No updated_at — append-only by design
  -- No soft-delete columns — log entries are never marked deleted in Slice 4

  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 Column Rationale

| Column | Type | Rationale |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | Audit logs can reach millions of rows; INT UNSIGNED (4B max) is insufficient for long-lived systems |
| `admin_id` | `INT UNSIGNED NULL` | Matches existing `admin` table PK type; NULL reserved for system actions; no physical FK (C4) |
| `actor_type` | `ENUM` | Distinguishes human admin from superadmin bypass from future automated actions |
| `action` | `VARCHAR(100)` | Structured `domain.subject.verb` format; 100 chars is sufficient |
| `target_type` | `VARCHAR(50)` | Entity type string; 50 chars covers all current entity names |
| `target_id` | `BIGINT UNSIGNED NULL` | Matches the BIGINT PK used in most tables; NULL for non-entity-specific actions |
| `before_json` / `after_json` | `JSON` | MySQL JSON type enforces valid JSON at insert time; supports indexing via generated columns in future |
| `ip_address` | `VARCHAR(45)` | 45 chars covers all IPv6 formats including zone IDs |
| `user_agent` | `VARCHAR(512)` | Truncated at service layer; prevents unbounded growth from unusual clients |
| `permission_checked` | `VARCHAR(64)` | Matches max `permission_key` length from `admin_permissions` table |
| `metadata_json` | `JSON NULL` | Extensible context without schema migration; houses request_id and correlation_id |
| `created_at` | `DATETIME(3)` | Millisecond precision for ordering concurrent writes; UTC |

### 3.3 Indexes

```sql
-- Query: "What did admin 7 do in the last hour?"
INDEX idx_aal_admin_created  (admin_id, created_at),

-- Query: "What happened to admin_user_roles entry for admin 5?"
INDEX idx_aal_target         (target_type, target_id),

-- Query: "Show me all rbac.role.assign actions today"
INDEX idx_aal_action         (action),

-- Query: "Show me the last 100 audit entries" (dashboard default)
INDEX idx_aal_created        (created_at)
```

**Note:** No composite covering index is created in Slice 4. The four single/two-column indexes cover all expected Slice 4 query patterns. Covering indexes are deferred to when the read endpoint is implemented (future slice).

---

## 4. Append-Only Guarantees

### 4.1 Service Layer Constraint

`auditLog.service.js` exports ONLY an INSERT function. No UPDATE, DELETE, or TRUNCATE SQL is present in the service. This is enforced by code convention, not by a DB-level constraint.

**The service contract:**
```
auditLog.service.js:
  ALLOWED:  INSERT INTO admin_audit_log
  FORBIDDEN: UPDATE admin_audit_log
  FORBIDDEN: DELETE FROM admin_audit_log
  FORBIDDEN: TRUNCATE admin_audit_log
```

### 4.2 Why No DB-Level Enforcement in Slice 4

Adding DB-level append-only protection would require one of:
- A separate DB user with `INSERT`-only permissions on `admin_audit_log` (requires DBA-level infrastructure change outside Slice 4 scope)
- A `BEFORE UPDATE` trigger using `SIGNAL SQLSTATE '45000'` (which MySQL 5.7+ does support and which does prevent updates — see §4.4)

Both are deferred to a future operational hardening slice to keep Slice 4 scope focused on the core logging infrastructure. **MySQL `BEFORE UPDATE` triggers with `SIGNAL SQLSTATE` do work correctly to prevent updates** — the deferral is a scope decision, not a technical limitation.

**Operational constraint:** The application DB user in production has full DML permissions. The append-only guarantee is enforced at the application layer in Slice 4. A future operational hardening slice can add DB-level protection via the trigger described in §4.4.

### 4.3 No `updated_at` Column

The table design intentionally omits `updated_at`. If an `updated_at` column existed, a future developer might be tempted to UPDATE rows. Its absence signals intent.

### 4.4 Future Protection Path

In a future slice, a MySQL-level protection can be added:
```sql
-- Trigger to prevent modifications (future hardening)
CREATE TRIGGER prevent_audit_log_update
BEFORE UPDATE ON admin_audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'admin_audit_log is append-only';
```

This is documented here but NOT implemented in Slice 4.

---

## 5. Runtime Logging Flow

### 5.1 Standard Flow (RBAC Controller — Slice 4 Consumer)

```
POST /api/admin/rbac/admins/:adminId/roles
  │
  ├── requireAuth (Slice 3 unchanged)
  ├── requireAdmin (Slice 3 unchanged)
  ├── requirePermission("rbac:manage") (Slice 3 unchanged)
  │     └── sets req.adminPermissionChecked = "rbac:manage"
  │
  └── assignRole handler (Slice 3, extended in Slice 4):
        1. Validate inputs
        2. C2 escalation guard (existing)
        3. INSERT INTO admin_user_roles (existing)
        4. invalidateAdminRbacCache(adminId) (existing)
        5. [NEW] await logAdminAction({    ← Slice 4 addition
               adminId: req.user.id,
               action: "rbac.role.assign",
               targetType: "admin_user_roles",
               targetId: adminId,
               before: null,                ← no prior state (new assignment)
               after: { adminId, roleId, roleName },
               req,
           })
        6. return res.status(201/200).json(...)
```

### 5.2 Logging Order Contract

**Mandatory sequence:**
```
1. Business action DB write    ← must succeed first
2. invalidateAdminRbacCache    ← fire-and-forget (existing)
3. logAdminAction              ← best-effort (new)
4. Send HTTP response
```

`logAdminAction` is always called AFTER the business DB write succeeds and AFTER cache invalidation. If the business write fails, `logAdminAction` is NOT called (no phantom audit entries for failed actions).

### 5.3 No-Op Flow (Audit Log Disabled)

```
assignRole handler:
  1–4. [same as above]
  5. await logAdminAction(...)
        → isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED") → false
        → return immediately (no INSERT)
  6. return res.status(201).json(...)
```

### 5.4 Failure Flow (Audit Log Write Fails)

```
assignRole handler:
  1–4. [same as above]
  5. await logAdminAction(...)
        → isFeatureEnabled → true
        → pool.query(INSERT) throws (DB error)
        → catch: console.error('[audit:log] write failed:', err.message)
        → return (no throw — best-effort)
  6. return res.status(201).json(...)  ← response still sent normally
```

---

## 6. Best-Effort vs Strict Semantics

### 6.1 Decision: Best-Effort

Slice 4 uses **best-effort** audit logging. The audit log write failure does NOT:
- Roll back the business action
- Return a 500 to the client
- Block the HTTP response

### 6.2 Rationale

The architecture document (§11.1) originally specified synchronous write with failure returning 500. After reviewing the operational context:

| Concern | Strict (500 on failure) | Best-Effort (continue on failure) |
|---|---|---|
| Audit completeness | 100% (for successful actions) | ~99.9% (drops entries on DB error) |
| Operational safety | A DB blip on audit table blocks all admin actions | Admin actions proceed normally |
| Shop approval blocked by audit failure | Yes | No |
| RBAC assignment blocked by audit failure | Yes | No |
| Monitoring burden | Alert on 500s from admin routes | Alert on `[audit:log] write failed` log patterns |
| Recovery from missed entries | Impossible (action was blocked) | Gap in log, business action succeeded |

The Otofine admin is a small-team internal tool. A strict audit failure blocking a shop approval (which may require immediate action for a seller) is operationally unacceptable in Slice 4. **Best-effort is the correct choice for Slice 4.**

### 6.3 Strict Mode Path (Future)

A future slice can introduce strict mode as an optional `{ strict: true }` parameter to `logAdminAction`. If strict mode is requested and the write fails, the service throws — allowing the controller to return 500 and issue a DB rollback (for transactional controllers). This is NOT implemented in Slice 4.

### 6.4 Best-Effort is NOT Fire-and-Forget

Best-effort means:
- The INSERT is awaited (the response waits for the write to complete or fail)
- On failure, the error is logged synchronously before the response is sent
- The write does NOT run in a detached promise after the response

This distinction matters: a detached promise (fire-and-forget) can write to the DB after the connection is closed or Node event loop drains, causing silent data loss. The await ensures the write attempt completes before the response.

---

## 7. Feature Flag Integration

### 7.1 Flag: `ADMIN_AUDIT_LOG_ENABLED`

Already seeded as `is_enabled = 0` in `admin_feature_flags` (Slice 2).
Already `false` in `backend/.env` as `ADMIN_AUDIT_LOG_ENABLED=false` (Slice 2).
Already `false` in `adminPlatformConfig.auditLogEnabled` (Slice 2).

**No new ENV variable, DB row, or config entry is needed for Slice 4.**

### 7.2 Call-Time Flag Check

`logAdminAction` checks the feature flag at **call time** using `isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")`:

```
logAdminAction() called
  → isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")
       Layer 1: Redis cache (60s TTL)
       Layer 2: DB (admin_feature_flags)
       Layer 3: adminPlatformConfig.auditLogEnabled (ENV)
  → if false: return immediately (no-op)
  → if true: proceed with INSERT
```

**Why call-time and not startup-time?**

A startup-time gate would prevent toggling without a PM2 restart. Call-time allows:
- Enabling the audit log for a test period without restarting
- Disabling if write pressure grows unexpectedly
- DB-driven toggle from the platform features endpoint

### 7.3 Feature Flag Error Handling

If `isFeatureEnabled` throws (Redis + DB both fail):
- Fallback to `adminPlatformConfig.auditLogEnabled` (ENV value)
- If ENV is `false` (default): no-op — safe default
- If ENV is `true`: proceed with INSERT

This matches the B3 pattern established in `requirePermission`.

---

## 8. Sensitive Field Stripping

### 8.1 Mandatory Sanitization

Before any object is passed as `before` or `after` to `logAdminAction`, it must pass through `sanitizeSnapshot(obj)`. The service enforces this internally — it does NOT trust callers to pre-sanitize.

### 8.2 Blocked Field Names

The following field names are stripped at any nesting depth:

```
password, passwordHash, hashedPassword, hash,
token, accessToken, refreshToken, idToken,
secret, apiKey, apiSecret, clientSecret,
otp, totp, pin,
sessionId, sessionToken,
privateKey, signingKey
```

**Replacement value:** `"[REDACTED]"`

### 8.3 Sanitization Contract

```javascript
function sanitizeSnapshot(obj) {
  // Deep clone to avoid mutating the original object
  // Recursively walk all keys at all nesting depths
  // If key matches BLOCKED_FIELDS (case-insensitive): replace value with "[REDACTED]"
  // Arrays: sanitize each element
  // Primitives: return as-is
  // null/undefined: return as-is
}
```

**Case insensitivity:** Both `passwordHash` and `PasswordHash` and `PASSWORDHASH` are blocked.

### 8.4 Size Limit

Before INSERT, if `JSON.stringify(before)` or `JSON.stringify(after)` exceeds 64 KB:
- Truncate to `{ _truncated: true, _reason: "snapshot exceeded 64KB", _keys: [...top-level keys] }`
- Log a warning: `[audit:log] snapshot truncated for action ${action}`

64 KB is chosen because MySQL JSON columns have a practical limit (~1 GB theoretically, but large JSON slows INSERT and creates index bloat). 64 KB is ample for any single entity state.

---

## 9. Before/After Snapshot Strategy

### 9.1 Snapshot Responsibility

Controllers are responsible for capturing snapshots. The audit log service does NOT perform DB reads to build snapshots — it only receives and persists what controllers provide.

This design choice:
- Avoids a second DB read inside the audit log service
- Avoids race conditions (the service reads state that may already have changed)
- Gives controllers full control over what is captured

### 9.2 Snapshot Patterns by Action Type

| Action type | Before snapshot | After snapshot |
|---|---|---|
| CREATE (role assign) | `null` | `{ adminId, roleId, roleName, grantedBy, grantedAt }` |
| DELETE (role revoke) | `{ adminId, roleId, roleName, grantedBy, grantedAt }` | `null` |
| UPDATE (shop status) | `{ id, status: "pending" }` | `{ id, status: "approved" }` |
| READ-only | `null` | `null` (no logging for reads in Slice 4) |

**Slice 4 initial scope:** Only RBAC assignment and revocation are logged. Shop actions, product moderation, billing, etc. are future slices.

### 9.3 RBAC-Specific Snapshots

For `rbac.role.assign` (POST /admins/:adminId/roles):
- `before`: `null` (new assignment, no prior state)
- `after`: `{ admin_id: adminId, role_id: roleId, role_name: targetRole.role_name, granted_by: req.user.id }`

For `rbac.role.revoke` (DELETE /admins/:adminId/roles/:roleId):
- `before`: `{ admin_id: adminId, role_id: roleId, role_name: targetRole.role_name, granted_by: <from DB>, granted_at: <from DB> }`
- `after`: `null` (assignment deleted)

**revokeRole pre-DELETE SELECT requirement:**

The `granted_by` and `granted_at` values are stored in `admin_user_roles` and are not available to the controller without an explicit SELECT. The controller must query these fields before issuing the DELETE:

```sql
SELECT granted_by, granted_at
FROM admin_user_roles
WHERE admin_id = ? AND role_id = ?
```

This SELECT must be placed **after the C5 guard check** (which verifies the role is not a protected superadmin role) but **before the DELETE**. If the SELECT returns no rows, the assignment does not exist; the subsequent DELETE will return `affectedRows = 0`, and `logAdminAction` will not be called (no phantom entries for non-existent assignments).

**Why `granted_by` and `granted_at` are required:**

The core use case for RBAC audit logs includes answering "who originally granted this role and when?" — not only "who revoked it and when?" Without `granted_by` and `granted_at` in the before snapshot, the audit trail cannot reconstruct the full lifecycle of a role assignment (grant → revoke). This is operationally critical for privilege chain audits.

### 9.4 No Nested Object Bloat

Snapshots should contain ONLY the relevant fields — not the full DB row with all metadata. For example, for a role assignment, the snapshot should NOT include `admin_roles.created_at` or `admin_roles.updated_at` — only the fields relevant to the audit record.

---

## 10. Request Metadata Capture

### 10.1 Captured Per Request

| Field | Source | Notes |
|---|---|---|
| `admin_id` | `req.user.id` | From JWT (always present after requireAuth) |
| `actor_type` | `'admin'` (Slice 4) | Hardcoded for Slice 4; superadmin detection deferred |
| `ip_address` | `req.ip \|\| req.headers['x-forwarded-for']` | Nginx sets X-Forwarded-For; prefer `req.ip` if set |
| `user_agent` | `req.headers['user-agent']` | Truncated to 512 chars by service |
| `permission_checked` | `req.adminPermissionChecked` | Set by `requirePermission` before `next()` (Slice 3 C3) |

### 10.2 `metadata_json` Contents

```json
{
  "request_id": "uuid-v4-generated-at-log-time",
  "correlation_id": null
}
```

`request_id` is generated inside `logAdminAction` using `crypto.randomUUID()`. A future slice can propagate request IDs from a request-ID middleware to enable cross-log correlation.

`correlation_id` is `null` in Slice 4. Reserved for future bulk operations where multiple log entries should be linked.

### 10.3 `req.ip` vs `x-forwarded-for`

The production setup uses Nginx as a reverse proxy. Nginx sets `X-Forwarded-For` with the client IP. Express's `req.ip` returns the correct client IP **only** when `app.set('trust proxy', 1)` (or a trusting value) is configured in `server.js`. Without this setting, `req.ip` returns `127.0.0.1` (the Nginx loopback address), not the client IP — silently corrupting every audit log IP field.

**Pre-deploy requirement:** Before deploying Slice 4, verify that `server.js` contains `app.set('trust proxy', 1)`. This must be a named checkpoint in the activation sequence (§17.3).

**IP capture logic:**
```
ip_address = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
             ?? (req.ip !== '127.0.0.1' ? req.ip : null)
```

If the resolved IP is the loopback address `127.0.0.1` (proxy IP leak), store `null` rather than the misleading loopback value. `null` in the audit log is more honest than a permanently incorrect address that is indistinguishable from a legitimate localhost entry.

**Activation smoke test addition (§17.3 step 7):** After enabling the flag, inspect a captured row and verify `ip_address` is a real client IP, not `127.0.0.1`.

---

## 11. RBAC Integration

### 11.1 What Slice 3 Provides

`req.adminPermissionChecked` is set by `requirePermission` BEFORE `next()` is called (C3 constraint). By the time any handler runs, this field is populated with the permission key that was verified (e.g., `"rbac:manage"`).

This makes RBAC-aware audit logging zero-cost at the handler level — the handler does not need to know which permission was checked; it's already on the request.

### 11.2 Audit Entries for RBAC Actions

In Slice 4, the RBAC controllers (`rbac.admin.controller.js`) are the first handlers to call `logAdminAction`. The integration is additive — the controllers gain a `logAdminAction` call after their existing logic.

**Actions logged in Slice 4:**

| Controller action | Audit `action` value | `target_type` | `target_id` |
|---|---|---|---|
| `assignRole` (new assignment) | `"rbac.role.assign"` | `"admin_user_roles"` | `adminId` (target) |
| `assignRole` (idempotent, no-op) | NOT logged | — | — |
| `revokeRole` | `"rbac.role.revoke"` | `"admin_user_roles"` | `adminId` (target) |

**Why not log idempotent re-assignments?** An `INSERT IGNORE` with `affectedRows = 0` means nothing changed — logging a "rbac.role.assign" when the role was already assigned would create misleading audit entries. The C1 fix (Slice 3) already distinguishes this case via `insertResult.affectedRows`.

**`target_id` semantic note:** The column definition in §3.1 describes `target_id` as "the numeric primary key of the affected row." For `admin_user_roles` actions, this convention is intentionally deviated from: `admin_user_roles` has a composite primary key `(admin_id, role_id)` with no single-column numeric PK. `target_id` stores `adminId` (the subject of the role change) rather than a composite or role-specific value.

Rationale: storing `adminId` as `target_id` enables the primary per-admin audit query:
```sql
WHERE target_type = 'admin_user_roles' AND target_id = <admin_id>
```
This answers "what role changes happened to this admin?" — the most operationally useful query pattern for RBAC audit logs.

To query all changes involving a specific role (secondary pattern), use JSON path filtering:
```sql
WHERE action = 'rbac.role.assign'
  AND (after_json->>'$.role_id' = ? OR before_json->>'$.role_id' = ?)
```
This uses `idx_aal_action` for the `action` filter, with JSON path extraction on the result set. A future composite index on `(action, created_at)` may be added when this pattern is queried at volume.

### 11.3 Actor Type Determination

In Slice 4, `actor_type` is always set to `'admin'`. Superadmin detection via `getAdminRbac(req.user.id)` is NOT called in the audit service — this would add a Redis/DB lookup to every logged action. 

Superadmin status is captured contextually: since the RBAC C2 guard verifies superadmin status before allowing superadmin role assignments, and that action is logged, the audit trail implicitly reflects superadmin activity without an explicit actor_type distinction.

Future slices can enrich `actor_type` by reading from the RBAC cache (Redis hit = ~1ms overhead) if superadmin distinction becomes operationally required.

---

## 12. Middleware Integration Points

### 12.1 Design: Helper Function, Not Express Middleware

Audit logging is implemented as a **service function** called directly from controllers, NOT as an Express middleware. This design is chosen because:

1. **Before/after state access**: Middleware runs before the handler; it cannot access the post-action state. A service function called from inside the handler has full access to before and after states.

2. **Conditional logging**: Controllers log only on success (after DB write confirmed). A middleware can't know whether the handler succeeded.

3. **Selective logging**: Not every admin route needs audit logging (e.g., GET /roles is read-only). A service function is called explicitly only where needed.

4. **req.adminPermissionChecked availability**: `requirePermission` sets this field before the handler runs, so it's available inside the controller when `logAdminAction` is called.

### 12.2 Middleware Chain Position (For Context)

The audit log service is called FROM INSIDE the handler, not added to the middleware chain:

```
requireAuth → requireAdmin → requirePermission → handler → [calls logAdminAction]
```

No new middleware is added to the Express chain in Slice 4.

### 12.3 Future Middleware Integration (Out of Scope for Slice 4)

A future generic audit middleware could be added AFTER handlers using Express's `res.on('finish', ...)` pattern. This would capture all responses without explicit controller calls. However, it cannot capture before-state or per-action context. This is deferred to a future slice.

---

## 13. Redis/Cache Interaction Rules

### 13.1 Audit Log Service Does NOT Use Redis for Write Path

The `logAdminAction` function performs a direct DB INSERT. There is no Redis write, no Redis read (except the feature flag check), and no caching of audit log entries.

**Rationale:** Audit logs are write-once, rarely-read data. Caching them in Redis would waste memory and create consistency complexity. The feature flag check uses Slice 2's Redis-backed `isFeatureEnabled`, which operates on a 60-second TTL cache.

### 13.2 Feature Flag Cache Interaction

The only Redis interaction in `logAdminAction` is the `isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")` call:

```
logAdminAction():
  → isFeatureEnabled("ADMIN_AUDIT_LOG_ENABLED")
       → getRaw("admin:ff:ADMIN_AUDIT_LOG_ENABLED") [Redis hit/miss]
       → if miss: SELECT from admin_feature_flags [DB]
       → if miss: cache result in Redis (60s TTL)
  → result: true/false
```

On subsequent calls within 60 seconds, the feature flag check costs a single Redis GET (~1ms). On Redis failure, falls back to `adminPlatformConfig.auditLogEnabled` (ENV = false by default).

### 13.3 No RBAC Cache Interaction

`logAdminAction` does NOT call `getAdminRbac`. The actor's permission is already known from `req.adminPermissionChecked`. Calling `getAdminRbac` inside the audit service would add unnecessary Redis/DB lookups.

---

## 14. Failure Handling Semantics

### 14.1 Failure Scenarios and Responses

| Failure point | `logAdminAction` behavior | HTTP response | Business action |
|---|---|---|---|
| `isFeatureEnabled` throws | Fallback to ENV (default: false) → no-op | Normal | Committed |
| `isFeatureEnabled` returns false | Return immediately | Normal | Committed |
| `sanitizeSnapshot` throws | Catch internally, log warning, use `null` for the affected snapshot field | Normal | Committed |
| `pool.query(INSERT)` throws | Catch, `console.error('[audit:log] write failed:')`, return | Normal | Committed |
| JSON serialization fails | Catch, log, continue with `null` snapshot | Normal | Committed |
| `crypto.randomUUID()` unavailable | Falls back to `Date.now().toString()` as request_id | Normal | Committed |

**Sanitization failure note:** On `sanitizeSnapshot` failure, `null` is used rather than a placeholder object (e.g., `{ _error: "sanitization failed" }`). Rationale: the design establishes `null` as the canonical value for "no snapshot available" (e.g., `before = null` for CREATE actions). Introducing a third state (null / valid object / error object) would complicate future audit log consumers. `null` is equally safe — the unsanitized original object is NOT used, so there is no data leakage risk from the failure path.

### 14.2 No Cascading Failures

**Guaranteed:** A failure inside `logAdminAction` NEVER propagates to the calling controller. The function wraps all operations in a top-level try/catch. Any thrown error is caught, logged to console, and swallowed.

### 14.3 Monitoring the Failure Rate

The `console.error('[audit:log] write failed:')` log line is a stable sentinel. PM2 routes stderr to log files. A monitoring alert (e.g., alerting on log file pattern `\[audit:log\] write failed`) provides operational visibility into audit log failure rate without blocking operations.

---

## 15. Module Structure

### 15.1 New Files in Slice 4 (3 files)

```
backend/modules/admin/
└── core/
    └── auditLog/
        └── auditLog.service.js          ← new: logAdminAction, sanitizeSnapshot
```

```
backend/migrations/
├── 054_admin_audit_log.sql              ← new: admin_audit_log table creation
└── 054_admin_audit_log.rollback.sql     ← new: DROP TABLE + DELETE tracking row
```

### 15.2 Modified Files in Slice 4 (3 files)

```
backend/modules/admin/rbac/controllers/rbac.admin.controller.js
  ← add: import logAdminAction from auditLog service
  ← add: logAdminAction call in assignRole (on affectedRows > 0)
  ← add: logAdminAction call in revokeRole (on successful DELETE)
  ← preserves: all existing C2, C5, cache invalidation logic

backend/modules/admin/index.js
  ← add: export { logAdminAction } from auditLog service
  ← preserves: all Slice 2 + Slice 3 exports

backend/package.json
  ← add: "migrate:admin:audit" and "migrate:admin:audit:dry" scripts
```

### 15.3 Directory Structure After Slice 4

```
backend/modules/admin/
├── config/
│   └── adminPlatform.config.js           (Slice 2 — unchanged)
├── core/
│   ├── auditLog/
│   │   └── auditLog.service.js           (Slice 4 NEW)
│   ├── featureFlags/
│   │   └── featureFlag.service.js        (Slice 2 — unchanged)
│   └── rbac/
│       ├── rbac.service.js               (Slice 3 — unchanged)
│       └── rbac.middleware.js            (Slice 3 — unchanged)
├── platform/
│   ├── controllers/
│   │   └── platform.admin.controller.js  (Slice 2 — unchanged)
│   └── routes/
│       └── platform.admin.routes.js      (Slice 2 — unchanged)
├── rbac/
│   ├── controllers/
│   │   └── rbac.admin.controller.js      (Slice 3, Slice 4 additive modification)
│   └── routes/
│       └── rbac.admin.routes.js          (Slice 3 — unchanged)
└── index.js                              (Slice 2+3, Slice 4 additive modification)
```

### 15.4 Explicitly Unchanged Files

```
backend/domains/auth/middlewares/auth.middleware.js    ← NEVER TOUCH
backend/domains/auth/services/token.service.js         ← NEVER TOUCH
backend/domains/auth/services/adminAuth.service.js     ← NEVER TOUCH
backend/routes/admin.routes.js                         ← NEVER TOUCH
backend/controllers/adminController.js                 ← NEVER TOUCH
backend/modules/admin/config/adminPlatform.config.js   ← NEVER TOUCH
backend/modules/admin/core/featureFlags/               ← NEVER TOUCH
backend/modules/admin/platform/                        ← NEVER TOUCH
backend/modules/admin/core/rbac/                       ← NEVER TOUCH
backend/modules/admin/rbac/routes/                     ← NEVER TOUCH
backend/scripts/run-admin-migration.js                 ← NEVER TOUCH (054 already in whitelist)
backend/.env                                           ← NEVER TOUCH (ADMIN_AUDIT_LOG_ENABLED=false already set)
frontend/                                              ← NEVER TOUCH in Slice 4
```

---

## 16. Migration Plan

### 16.1 Migration File: `054_admin_audit_log.sql`

**Content summary:**
- `CREATE TABLE IF NOT EXISTS admin_audit_log` with all columns and indexes as specified in §3.1
- No seed data (log starts empty — correct)
- No foreign keys (all references are logical, not physical — C4 pattern)
- `BIGINT UNSIGNED AUTO_INCREMENT` primary key for long-term scale

**Idempotency:** `CREATE TABLE IF NOT EXISTS` — safe to run twice.

**Index creation:** MySQL creates indexes as part of `CREATE TABLE` — no separate `CREATE INDEX` statements needed.

### 16.2 Rollback File: `054_admin_audit_log.rollback.sql`

```sql
DROP TABLE IF EXISTS admin_audit_log;
DELETE FROM schema_migrations WHERE filename = '054_admin_audit_log.sql';
```

**Warning in rollback file:** All audit log entries are permanently lost. This is a destructive operation.

### 16.3 NPM Scripts to Add

```json
"migrate:admin:audit":     "node scripts/run-admin-migration.js --file 054_admin_audit_log.sql",
"migrate:admin:audit:dry": "node scripts/run-admin-migration.js --file 054_admin_audit_log.sql --dry-run"
```

### 16.4 Post-Migration Validation

```sql
-- 1. Confirm table exists
SHOW TABLES LIKE 'admin_audit_log';

-- 2. Confirm schema
DESCRIBE admin_audit_log;
-- Expected columns: id (BIGINT UNSIGNED), admin_id (INT UNSIGNED NULL),
--   actor_type (ENUM), action (VARCHAR 100), target_type (VARCHAR 50),
--   target_id (BIGINT UNSIGNED NULL), before_json (JSON), after_json (JSON),
--   ip_address (VARCHAR 45), user_agent (VARCHAR 512),
--   permission_checked (VARCHAR 64), metadata_json (JSON),
--   created_at (DATETIME(3))

-- 3. Confirm indexes
SHOW INDEX FROM admin_audit_log;
-- Expected: idx_aal_admin_created, idx_aal_target, idx_aal_action, idx_aal_created

-- 4. Confirm table is empty (correct initial state)
SELECT COUNT(*) FROM admin_audit_log;
-- Expected: 0

-- 5. Confirm migration tracking
SELECT filename, applied_at, checksum FROM schema_migrations
WHERE filename = '054_admin_audit_log.sql';
-- Expected: 1 row
```

---

## 17. Hidden Deployment Strategy

### 17.1 Three-State Deployment Model

| State | Description | Audit log behavior |
|---|---|---|
| Deployed, flag disabled (default) | Table exists, code deployed | All `logAdminAction` calls → no-op (0 inserts) |
| Deployed, test mode | Flag enabled temporarily for testing | Inserts happen; can verify schema and content |
| Deployed, flag enabled (production) | Permanent activation | All RBAC actions logged |

### 17.2 Hidden Deployment Guarantee

When `ADMIN_AUDIT_LOG_ENABLED=false`:
- The `admin_audit_log` table exists but receives zero rows
- RBAC routes function identically to Slice 3 (no behavioral change)
- No performance overhead beyond the feature flag Redis GET (~1ms per RBAC write action)
- Storefront, RFQ, seller, and existing admin routes are completely unaffected

### 17.3 Activation Sequence

**Prerequisite:** At least one admin has been assigned the superadmin role (Slice 3 bootstrap).

```
1. Run migration: npm run migrate:admin:audit
2. Deploy code (controller + service + barrel changes)
3. PM2 restart
4. Verify smoke tests (RBAC still works, audit log table empty)
5. Enable flag (DB): UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_AUDIT_LOG_ENABLED'
6. Test: assign a role → verify admin_audit_log has 1 row
7. Verify row contents: action, target_type, target_id, permission_checked, before_json, after_json
```

---

## 18. PM2 Startup Safety

### 18.1 No Startup Side Effects

`auditLog.service.js` has no module-level initialization code:
- No DB connection at module load
- No Redis connection at module load
- No feature flag evaluation at module load
- No scheduled jobs at module load

The module evaluates only `import` statements when first loaded. Startup cannot fail because of the audit log module.

### 18.2 Startup Gate: Not Needed

Unlike `rbac.admin.routes.js` (which has a startup gate to return 404 when RBAC is disabled), the audit log service has no HTTP routes in Slice 4. There are no routes to gate.

The feature flag is checked per-call inside `logAdminAction`. No startup gate is required.

### 18.3 Import Chain Safety

```
rbac.admin.controller.js
  → imports: auditLog.service.js
      → imports: isFeatureEnabled (featureFlag.service.js — stable Slice 2)
      → imports: adminPlatformConfig (adminPlatform.config.js — stable Slice 2)
      → imports: pool (config/db.js — stable)
      → imports: crypto (Node.js built-in — always available)
```

No circular imports. All imports resolve to stable, deployed modules or Node built-ins.

### 18.4 Barrel Safety

The barrel (`admin/index.js`) gains one new export:
```javascript
export { logAdminAction } from "./core/auditLog/auditLog.service.js";
```

If `auditLog.service.js` fails to import (syntax error, missing dep), the barrel fails, breaking `server.js` startup — including `platformRouter` and `rbacRouter`. This is the same blast-radius risk as Slice 3. The pre-restart syntax check (`node --check`) prevents this.

---

## 19. Query and Index Strategy

### 19.1 Expected Operational Queries

**Dashboard: recent activity (most frequent)**
```sql
SELECT admin_id, action, target_type, target_id, created_at
FROM admin_audit_log
ORDER BY created_at DESC
LIMIT 50;
-- Uses: idx_aal_created (leading column: created_at)
```

**Per-admin audit trail**
```sql
SELECT action, target_type, target_id, before_json, after_json, created_at
FROM admin_audit_log
WHERE admin_id = ?
ORDER BY created_at DESC
LIMIT 100;
-- Uses: idx_aal_admin_created (admin_id, created_at)
```

**Entity history**
```sql
SELECT admin_id, action, before_json, after_json, created_at
FROM admin_audit_log
WHERE target_type = 'admin_user_roles' AND target_id = ?
ORDER BY created_at DESC;
-- Uses: idx_aal_target (target_type, target_id)
```

**Action type filter**
```sql
SELECT admin_id, target_id, before_json, after_json, created_at
FROM admin_audit_log
WHERE action = 'rbac.role.assign'
  AND created_at >= NOW() - INTERVAL 7 DAY;
-- Uses: idx_aal_action for action filter; idx_aal_created for date range
-- Note: MySQL picks one index; composite index may be added in future
```

### 19.2 Index Adequacy Assessment

The four indexes defined in §3.3 cover all expected Slice 4 queries. The read endpoint (future slice) will reveal additional access patterns that may warrant covering indexes or composite additions. Adding indexes later is safe (non-destructive DDL with `CREATE INDEX IF NOT EXISTS`).

### 19.3 `created_at` Ordering

All dashboard queries order by `created_at DESC`. The `idx_aal_created (created_at)` index makes this efficient. As the table grows, this index remains effective because `created_at` is monotonically increasing — new rows are always at the high end of the index.

---

## 20. Runtime Performance Considerations

### 20.1 Overhead Per Audited Action

| Operation | Typical latency | Notes |
|---|---|---|
| `isFeatureEnabled` (Redis hit) | ~1 ms | 60s TTL cache; most calls are hits |
| `isFeatureEnabled` (Redis miss → DB) | ~3–5 ms | Only on first call after cache expires |
| `sanitizeSnapshot(obj)` | < 0.5 ms | Deep clone of a small object |
| `JSON.stringify(before/after)` | < 0.5 ms | Small objects only |
| `pool.query(INSERT)` | ~3–8 ms | Single INSERT, no JOIN, InnoDB |
| **Total overhead per action** | **~5–10 ms** | When audit is enabled |

### 20.2 Acceptable Overhead

The RBAC management actions (role assign, revoke) are low-frequency, operational actions performed by a small admin team. A 5–10ms overhead is imperceptible in this context. There is no performance concern for Slice 4.

For high-frequency actions (shop product listing queries, storefront SSR), the audit log is NOT called — those paths are untouched.

### 20.3 Write Volume at Scale

At 10 admin actions per day (typical for a small ops team), the audit log grows at ~10 rows/day. Even at 100x scale (1,000 actions/day), the table reaches 365,000 rows after one year — well within single-table performance range for MySQL with proper indexing.

No partitioning, sharding, or write queue is needed in Slice 4.

---

## 21. Retention Strategy

### 21.1 Slice 4 Scope: No Active Retention

In Slice 4, `admin_audit_log` is append-only with no retention management. Rows accumulate indefinitely. Given the write volume projection (§20.3), this is safe for at least 2–3 years without management.

### 21.2 Future Retention Mechanism (Out of Scope for Slice 4)

A future slice will implement a retention job:
- Archive rows older than 90 days to an `admin_audit_log_archive` table (same schema)
- Or export to CSV/S3 for long-term storage
- Or soft-delete using a `archived_at DATETIME(3) NULL` column (requires schema migration)
- Archival job runs as a cron: `DELETE FROM admin_audit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)`

**Critical constraint:** The archival job uses DELETE (not the service layer), and must be considered a privileged administrative operation separate from normal audit log writes.

### 21.3 Index Efficiency Over Time

The `idx_aal_created` index remains efficient as the table grows because:
- Range queries on `created_at` (e.g., last 7 days) use the index
- Old rows are at the low end; new rows at the high end
- Index pages for recent data remain hot in the buffer pool

---

## 22. Rollback Strategy

### 22.1 Code Rollback (If PM2 Restart Fails)

```bash
git revert <slice4-commit-sha> --no-edit
node --check backend/modules/admin/index.js
node --check backend/modules/admin/rbac/controllers/rbac.admin.controller.js
pm2 restart api --update-env
# Verify: GET /api/admin/rbac/roles → same behavior as Slice 3
```

Slice 4 code changes are additive (new service, barrel export, controller call). Reverting removes:
- The `logAdminAction` import in `rbac.admin.controller.js`
- The `logAdminAction` call after `assignRole` and `revokeRole` writes
- The barrel export
- The new scripts in `package.json`

The `admin_audit_log` table is NOT dropped by code rollback. It simply receives no new rows.

### 22.2 When Migration Rollback Is Needed

Migration rollback is ONLY required if the `admin_audit_log` table itself causes issues (extremely unlikely — pure INSERT table with no FKs to production tables). If needed:

```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME \
  < backend/migrations/054_admin_audit_log.rollback.sql
# Drops admin_audit_log and removes tracking row
# WARNING: all audit log entries are permanently lost
```

### 22.3 Feature Flag Deactivation (Without Rollback)

```sql
UPDATE admin_feature_flags SET is_enabled = 0 WHERE flag_key = 'ADMIN_AUDIT_LOG_ENABLED';
-- Takes effect within 60s via feature flag TTL
```

After deactivation, `logAdminAction` calls become no-ops. The table retains all previously logged entries.

---

## 23. Operational Recovery Procedures

### 23.1 Audit Log Gap Recovery

If the audit log was disabled or failed during a period:
- The gap is permanent — best-effort semantics means missed entries cannot be reconstructed
- Document the gap in an incident note (date range, cause)
- No data recovery is possible from a best-effort system

### 23.2 Duplicate Entry Prevention

If `logAdminAction` is called twice for the same action (e.g., due to a retry):
- A duplicate row is inserted — the table has no unique constraint on (admin_id, action, target_id, created_at)
- Duplicates can be identified by comparing `created_at` + `metadata_json.request_id`
- No deduplication logic is added in Slice 4

**Prevention:** Ensure `logAdminAction` is called exactly once per action in the controller. Use the `insertResult.affectedRows > 0` guard (from C1 fix) to avoid logging idempotent no-ops.

### 23.3 Corrupt JSON in Snapshots

If a snapshot stored in `before_json` or `after_json` is malformed:
- MySQL's JSON column type rejects invalid JSON at INSERT time → the INSERT fails
- `logAdminAction` catches the error → logs to console → swallows → no crash
- The business action is not affected

If a snapshot was stored correctly but is later found to be incomplete or misleading:
- No correction mechanism exists (append-only)
- A compensating audit entry can be written manually via `INSERT INTO admin_audit_log ... VALUES (...)` with action `'audit.correction'` and a note in `metadata_json`

### 23.4 Table Accidentally Dropped

If the `admin_audit_log` table is dropped in production:
- Re-run `npm run migrate:admin:audit` — the migration recreates the table (empty)
- All historical audit entries are permanently lost
- `logAdminAction` calls will fail until the table is recreated (errors are caught and swallowed)

---

## 24. Slice 4 Scope Constraints

### 24.1 In Scope

- `admin_audit_log` table creation (`054_admin_audit_log.sql`)
- `auditLog.service.js` with `logAdminAction` and `sanitizeSnapshot`
- Barrel export of `logAdminAction`
- `rbac.admin.controller.js` — additive `logAdminAction` calls in `assignRole` and `revokeRole`
- NPM scripts for migration
- Rollback file

### 24.2 Explicitly Out of Scope

- Audit log read endpoint (`GET /api/admin/audit-log`) — future slice
- Audit log viewer frontend page (`/admin/audit`) — future slice
- Retention/archival job — future slice
- Audit log integration into shop, product, billing, CRM controllers — future slices
- DB-level append-only enforcement (trigger) — future slice
- Partitioning of `admin_audit_log` — future slice (at high row volume)
- `actor_type = 'superadmin'` differentiation — future slice
- Correlation ID propagation middleware — future slice

---

## 25. Dangerous Coupling Analysis

### 25.1 New Coupling Introduced

| Coupling | Risk | Mitigation |
|---|---|---|
| `rbac.admin.controller.js` → `auditLog.service.js` | If audit service has a startup error, controller fails to load | `node --check` + barrel import verification before PM2 restart |
| `auditLog.service.js` → `featureFlag.service.js` | Audit log inherits feature flag service availability | Best-effort: flag failure defaults to disabled (safe) |
| `auditLog.service.js` → `pool` (DB) | Audit log shares the main DB connection pool | INSERT is non-blocking; pool exhaustion is monitored separately |
| Barrel (`admin/index.js`) → `auditLog.service.js` | Barrel failure breaks platformRouter + rbacRouter | Pre-restart verification required |

### 25.2 Zero-Regression Guarantee

The audit log service is NOT in any existing code path:
- Storefront rendering: no audit log calls
- RFQ dispatch: no audit log calls
- Shop product queries: no audit log calls
- Seller auth: no audit log calls
- Existing admin routes (`/api/admin/shops`, `/api/admin/rfq`): no audit log calls

Only the two RBAC write handlers (`assignRole`, `revokeRole`) call `logAdminAction` in Slice 4. Both handlers are new (Slice 3), not existing production routes.

---

## 26. Implementation Phases

### 26.1 Slice 4 Implementation Sequence

```
Phase A: Migration
  1. Write 054_admin_audit_log.sql
  2. Write 054_admin_audit_log.rollback.sql
  3. Dry-run: npm run migrate:admin:audit:dry
  4. Apply: npm run migrate:admin:audit
  5. Validate §16.4 queries

Phase B: Service + Barrel
  6. Write auditLog.service.js
  7. Modify admin/index.js (additive export)
  8. node --check auditLog.service.js
  9. node --check admin/index.js
  10. Barrel import verification

Phase C: Controller Integration
  11. Modify rbac.admin.controller.js (add logAdminAction calls)
  12. node --check rbac.admin.controller.js
  13. Add package.json scripts

Phase D: PM2 Restart + Smoke Tests
  14. pm2 restart api --update-env
  15. Verify RBAC routes still work (flag disabled — no audit writes)
  16. Verify admin_audit_log is empty
  17. Enable flag: UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_AUDIT_LOG_ENABLED'
  18. Assign a test role → verify 1 row in admin_audit_log
  19. Verify row: action='rbac.role.assign', permission_checked='rbac:manage', before_json=null, after_json not null
  20. Verify sensitive field stripping (no passwords in after_json)
```

### 26.2 Pre-Implementation Review Required

Before implementation, a pre-implementation review of the `auditLog.service.js` spec should cover:
- `logAdminAction` function signature
- `sanitizeSnapshot` field blocklist completeness
- Feature flag error handling (B3 pattern)
- `req.ip` vs `x-forwarded-for` handling
- Size limit enforcement
- JSON serialization error handling
- Idempotent no-op detection (affectedRows guard)

---

*Document version: 1.0 — Design only. No implementation.*  
*Next step: Pre-implementation review of this design, then implementation plan, then file generation.*
