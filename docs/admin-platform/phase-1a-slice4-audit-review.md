# Otofine Admin Platform — Phase 1A Slice 4: Audit Log Foundation
## Design Review

**Status:** REVIEW ONLY — no implementation  
**Date:** 2026-05-27  
**Source reviewed:** `phase-1a-slice4-audit-design.md`  
**Cross-referenced against:** `phase-1a-slice3-rbac-implementation-plan.md`, `run-admin-migration.js`, `rbac.admin.controller.js`, `redisCache.service.js`, `featureFlag.service.js`, `server.js`

---

## Summary

| Category | Count |
|---|---|
| BLOCKERS | 0 |
| CORRECTIONS | 6 |
| SAFE areas | 14 |
| HIGH-RISK files/flows | 4 |

No blockers. Six corrections address factual inaccuracies, an incomplete snapshot, a misleading file count, and operational concerns that need explicit documentation before implementation planning begins.

---

## BLOCKERS

None.

---

## CORRECTIONS

### C1 — Sanitization Failure Fallback Should Produce `null`, Not a Placeholder Object

**Location:** §14.1 failure scenario table, row: "`sanitizeSnapshot` throws"  
**Current design:** On sanitization failure, continue with `{ _error: "sanitization failed" }`  
**Problem:**

The design states that if `sanitizeSnapshot` throws, the audit INSERT proceeds with `{ _error: "sanitization failed" }` as the snapshot value. This creates two issues:

1. **Convention inconsistency:** The design establishes `null` as the canonical value for "no snapshot available" (e.g., `before = null` for CREATE actions). A placeholder error object introduces a third possible state (`null` / valid object / error object), complicating future audit log readers that need to handle all three.

2. **Confusing audit trail:** An audit log entry with `before_json = { _error: "sanitization failed" }` could be mistaken for a real snapshot. A consumer might parse this as a legitimate `before` state and derive incorrect conclusions.

3. **Not safer than `null`:** The design aims to use the fallback to prevent sensitive data from entering the DB. This goal is already achieved — if `sanitizeSnapshot` throws, the original unsanitized object is NOT used. The replacement `{ _error: ... }` achieves nothing beyond `null` in terms of data safety.

**Required fix:** On sanitization failure, use `null` for the affected snapshot (before/after), not a placeholder object. Log a warning. The audit entry is still inserted; only the affected snapshot field is `null`.

---

### C2 — Incorrect Statement About MySQL `BEFORE UPDATE` Trigger Capability

**Location:** §4.2 "Why No DB-Level REVOKE"  
**Current design:**
> "MySQL doesn't support `BEFORE UPDATE` that prevents the update cleanly"

**Problem:** This statement is factually incorrect. MySQL `BEFORE UPDATE` triggers can prevent row modifications by using `SIGNAL SQLSTATE '45000'` to raise an error. The update is aborted when the signal fires. This is a standard, well-supported MySQL feature.

The evidence: §4.4 itself proposes exactly this pattern as the "future hardening" trigger:
```sql
CREATE TRIGGER prevent_audit_log_update
BEFORE UPDATE ON admin_audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'admin_audit_log is append-only';
```

This trigger is fully functional in MySQL 5.7+ and MySQL 8+. The statement in §4.2 contradicts the implementation in §4.4 that it introduces.

**Required fix:** Correct §4.2 to: "Adding DB-level protection would require a separate DB user with restricted permissions, or a `BEFORE UPDATE` trigger using `SIGNAL SQLSTATE` (which MySQL does support). Both are deferred to a future operational hardening slice to keep Slice 4 scope focused."

This correction does not change the scope decision (defer the trigger to a future slice) — it only removes the false factual claim that could mislead future implementers.

---

### C3 — IP Address Capture Requires `trust proxy` Verification

**Location:** §10.3 "`req.ip` vs `x-forwarded-for`"  
**Current design:**
> "Recommended: The service captures `req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip`"

**Problem:** The design recommends `req.ip` as a fallback, but `req.ip` in Express returns the correct client IP (not the Nginx proxy IP) ONLY when `app.set('trust proxy', 1)` (or a truthy value) is configured on the Express app. Without this setting, `req.ip` returns the IP of the immediately connected socket — which is `127.0.0.1` (the Nginx proxy's loopback address), not the client IP.

The design mentions Nginx as the reverse proxy in §10.3 but does not verify or require the `trust proxy` setting. This creates a silent data quality issue: if `X-Forwarded-For` is absent for any reason AND `trust proxy` is not set, every audit log entry captures `127.0.0.1` as the IP — defeating the purpose of IP logging.

**Required fix:** Add two explicit requirements to the design:

1. **Verify `app.set('trust proxy', 1)` in `server.js`** before deploying Slice 4. If not present, the service should use `req.headers['x-forwarded-for']?.split(',')[0]?.trim()` exclusively (not fall back to `req.ip`).

2. **Document the capture priority:** 
   ```
   IP = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        ?? (trustProxyConfigured ? req.ip : null)
   ```
   
   If neither source yields a non-loopback IP, store `null` rather than `'127.0.0.1'` — `null` is more honest than a misleading loopback address.

---

### C4 — `revokeRole` Before Snapshot Is Incomplete

**Location:** §9.3 "RBAC-Specific Snapshots"  
**Current design:**
```
For rbac.role.revoke:
  before: { admin_id: adminId, role_id: roleId, role_name: targetRole.role_name }
```

**Problem:** The `revokeRole` before snapshot omits `granted_by` and `granted_at` from the `admin_user_roles` row. For an audit log, knowing who originally granted the role being revoked — and when — is operationally significant. Without this information, the audit trail cannot answer "who granted this role and when was it originally assigned?" which is a core use case for RBAC audit logs.

The data is available in the `admin_user_roles` table as `(granted_by, granted_at)`. Capturing it requires one additional DB query before the DELETE:
```sql
SELECT granted_by, granted_at
FROM admin_user_roles
WHERE admin_id = ? AND role_id = ?
```

This is consistent with §9.1 (controllers capture snapshots without the audit service doing independent reads). The controller performs the read and passes the result to `logAdminAction`.

**Required fix:** The `revokeRole` before snapshot must include the full assignment row:
```
before: {
  admin_id:   adminId,
  role_id:    roleId,
  role_name:  targetRole.role_name,
  granted_by: <from DB SELECT before DELETE>,
  granted_at: <from DB SELECT before DELETE>
}
```

This requires adding one SELECT query to `revokeRole` in `rbac.admin.controller.js`, between the C5 guard check and the DELETE. If the SELECT returns no rows, the assignment doesn't exist and the DELETE will return `affectedRows = 0` anyway — the C4 data capture is conditional on the row existing.

---

### C5 — New File Count in §15.1 Is Incorrect

**Location:** §15.1 "New Files in Slice 4 (6 files)"  
**Current design:** The section header says "(6 files)" but only 3 new files are listed:
- `backend/modules/admin/core/auditLog/auditLog.service.js`
- `backend/migrations/054_admin_audit_log.sql`
- `backend/migrations/054_admin_audit_log.rollback.sql`

**Required fix:** Change "(6 files)" to "(3 files)". The modified files count (§15.2) is correct at 3.

---

### C6 — `target_id` Semantic Deviation Is Undocumented

**Location:** §11.2 "Audit Entries for RBAC Actions" and §3.1 column definition  
**Current design:**
- §3.1 defines `target_id` as "The numeric primary key of the affected row"
- §11.2 assigns `target_id = adminId` (the target admin being assigned/revoked a role)

**Problem:** `admin_user_roles` has a **composite primary key** `(admin_id, role_id)`. Using `adminId` alone as `target_id` deviates from the stated "numeric primary key" semantics — `adminId` is not the PK of the affected row.

This is a pragmatic choice: storing `adminId` as `target_id` enables the entity-history query "what role changes happened to this admin?" via `WHERE target_type = 'admin_user_roles' AND target_id = ?`. This is arguably more useful than the role_id or a composite value.

However, the deviation is undocumented, which will cause confusion when future slices need to understand the `target_id` contract for their own actions.

**Required fix:** Add a note to §11.2 explicitly documenting the semantic:

> "`target_id` for `admin_user_roles` actions stores `admin_id` (the subject of the role change), not a composite or role-specific PK. This enables per-admin role-change queries: `WHERE target_type = 'admin_user_roles' AND target_id = <admin_id>`. To find all changes involving a specific role, use `action = 'rbac.role.assign' AND after_json->>'$.role_id' = ?` with `idx_aal_action` + JSON filtering."

---

## SAFE Areas Confirmed

### S1 — Best-Effort Semantics Decision

The decision to use best-effort (not strict 500) audit logging is correctly justified in §6.2. For a small-team internal tool, blocking shop approvals on audit DB failures is operationally unacceptable. The "awaited best-effort" pattern (§6.4) correctly distinguishes from fire-and-forget, ensuring the write attempt completes before the response is sent.

### S2 — Feature Flag Integration

Call-time `isFeatureEnabled` check (§7.2) is the correct choice. It enables toggling without PM2 restart and inherits the B3 ENV fallback pattern from `requirePermission`. The default `false` ensures zero audit writes until deliberately enabled. **Correctly specified.**

### S3 — Migration File Name

`054_admin_audit_log.sql` is confirmed in the `ADMIN_MIGRATION_FILES` whitelist in `run-admin-migration.js` at position index 3. No runner modification needed. **Verified correct.**

### S4 — Hidden Deployment Three-State Model

§17.1–17.2 correctly define the three deployment states. When flag is false, `logAdminAction` is a no-op with ~1ms overhead (Redis GET for flag check) per RBAC write action. Storefront and RFQ are completely unaffected. **Safe.**

### S5 — PM2 Startup Safety

`auditLog.service.js` has no module-level side effects. The import chain (§18.3) is:
- `auditLog.service.js` → `featureFlag.service.js` (Slice 2 stable)
- `auditLog.service.js` → `adminPlatformConfig` (Slice 2 stable)
- `auditLog.service.js` → `pool` (db.js stable)
- `auditLog.service.js` → `crypto` (Node.js built-in)

No circular imports. **Safe.**

### S6 — Logging Order Contract

§5.2 correctly specifies: (1) business DB write → (2) cache invalidation → (3) `logAdminAction` → (4) send response. This ensures no phantom audit entries for failed actions, and no business action failures due to audit failures. **Correctly specified.**

### S7 — `permission_checked` Column Integration

Capturing `req.adminPermissionChecked` (§10.1) seamlessly integrates with Slice 3's C3 guarantee — the field is set before `next()`, so it is always populated when `logAdminAction` is called from a RBAC handler. **Correctly specified.**

### S8 — Idempotent No-Op Non-Logging

§11.2 correctly specifies that idempotent re-assignments (`INSERT IGNORE` with `affectedRows = 0`) are NOT logged. This reuses the C1 fix from Slice 3 and prevents misleading "rbac.role.assign" entries when nothing changed. **Correctly specified.**

### S9 — Sensitive Field Blocklist

The blocklist in §8.2 covers the primary categories of sensitive data in the Otofine stack: passwords, tokens, secrets, OTP, session identifiers, and private keys. For RBAC snapshots (§9.3), none of the captured fields (`admin_id`, `role_id`, `role_name`, `granted_by`) are sensitive. The sanitizer runs internally regardless. **Safe for Slice 4 scope.**

### S10 — Rollback Completeness

Code rollback (§22.1) removes only additive changes — the new import + two `logAdminAction` calls in the controller + barrel export + package.json scripts. The audit log table survives code rollback (correct — the table itself causes no production impact when no code writes to it). Feature flag deactivation (§22.3) is documented as the preferred first response. **Correctly specified.**

### S11 — Redis Cache Non-Interference

The audit log service has no Redis writes. The only Redis interaction is the `isFeatureEnabled` call, which operates on the existing `admin:ff:ADMIN_AUDIT_LOG_ENABLED` cache entry — no new key namespace. No RBAC cache interference. **Correctly isolated.**

### S12 — Write Volume and Performance

§20 correctly estimates 5–10ms overhead per audited action. At the expected Slice 4 frequency (RBAC write actions by a small ops team), this is negligible. The table will have < 10K rows for typical operation — well within single-table MySQL performance bounds. **Safe.**

### S13 — Index Adequacy for Slice 4 Patterns

The four indexes (§3.3) cover all four primary query patterns in §19.1. The `idx_aal_admin_created (admin_id, created_at)` compound index is well-designed: low-selectivity leading column (admin_id) narrows results quickly; the trailing `created_at` provides efficient ORDER BY. **Correctly specified.**

### S14 — Append-Only Service Contract

While the service-layer append-only guarantee (§4.1) is not DB-enforced in Slice 4, the design correctly:
- Exports only one function (`logAdminAction`) that always INSERTs
- Omits `updated_at` column to signal intent
- Documents the DB-level enforcement path (§4.4) for a future slice
- Acknowledges the limitation transparently (§4.2)

**Safe for Slice 4 scope given the small trusted team context.**

---

## HIGH-RISK FILES / FLOWS

### HR1 — `backend/modules/admin/rbac/controllers/rbac.admin.controller.js`

The only already-deployed file modified by Slice 4. Any error introduced here affects the live RBAC assignment and revocation routes. The modification is additive (new import + two `await logAdminAction(...)` calls), but incorrect placement (e.g., calling before the DB write, or within the wrong conditional) could:
- Log phantom entries for failed actions (if placed before DB write)
- Miss logging successful revocations (if placed outside the `affectedRows > 0` guard scope)

**Risk mitigation:** The C4 correction (adding a SELECT before DELETE for `granted_by/granted_at`) adds one more DB query to `revokeRole`. The SELECT must be placed after the C5 guard check but before the DELETE — any reordering breaks either correctness or the guard.

### HR2 — `backend/modules/admin/index.js`

Barrel modification blast radius: a syntax error or wrong path in the new `logAdminAction` export line breaks ALL admin module imports in `server.js` — including the already-live `platformRouter` (Slice 2) and `rbacRouter` (Slice 3). The pre-restart barrel import verification is mandatory.

### HR3 — `auditLog.service.js` Sanitization Path

The `sanitizeSnapshot` function is the primary security control preventing sensitive data from entering the audit log. Its correctness cannot be verified by `node --check` (syntax-only). Testing with an object that contains:
- Known sensitive fields at root level
- Known sensitive fields at nested depth
- Non-sensitive fields with similar names (e.g., `shopHash`, `checksum`)
- Circular references (should produce `null`, not a crash)

is required during activation verification, not just after deployment.

### HR4 — IP Capture Flow (Trust Proxy Gap)

If `server.js` does not have `app.set('trust proxy', ...)` configured and `X-Forwarded-For` is absent or stripped, all captured IP addresses will be `127.0.0.1`. This is a silent data quality failure — no error, no crash, just permanently incorrect IP records in the audit log. This is the highest-risk operational assumption in the design. Must be verified in the activation sequence (§17.3 step 7 should include IP verification).

---

## Review by Section

| Section | Status | Notes |
|---|---|---|
| §1 Current State | SAFE | Migration whitelist confirmed; ENV/DB flags confirmed |
| §2 Design Goals | SAFE | Goals are achievable and correctly scoped |
| §3 Table Design | CORRECTION (C6) | target_id semantic deviation needs documentation |
| §4 Append-Only | CORRECTION (C2) | Incorrect trigger capability statement |
| §5 Runtime Flow | SAFE | Logging order contract and no-op flow are correct |
| §6 Best-Effort | SAFE | Decision rationale is well-argued; "awaited best-effort" is correctly distinguished from fire-and-forget |
| §7 Feature Flag | SAFE | Call-time check, B3 fallback, default-false — all correct |
| §8 Sensitive Fields | CORRECTION (C1) | Sanitization failure should produce null, not placeholder |
| §9 Snapshots | CORRECTION (C4) | revokeRole before snapshot missing granted_by/granted_at |
| §10 Metadata | CORRECTION (C3) | trust proxy verification needed for req.ip correctness |
| §11 RBAC Integration | CORRECTION (C6) | target_id deviation undocumented |
| §12 Middleware | SAFE | Service function pattern is correct for Slice 4 |
| §13 Redis | SAFE | No new Redis interactions; feature flag cache correctly reused |
| §14 Failure Handling | CORRECTION (C1) | Sanitization failure fallback |
| §15 Module Structure | CORRECTION (C5) | "(6 files)" should be "(3 files)" |
| §16 Migration Plan | SAFE | Idempotent DDL, correct filename, rollback correct |
| §17 Hidden Deployment | SAFE | Three-state model correct; activation sequence correct |
| §18 PM2 Startup | SAFE | No side effects; import chain clean; barrel risk documented |
| §19 Query/Index | SAFE | Four indexes cover Slice 4 query patterns adequately |
| §20 Performance | SAFE | 5–10ms overhead acceptable for RBAC write frequency |
| §21 Retention | SAFE | No active retention in Slice 4 is explicitly scoped and projected |
| §22 Rollback | SAFE | Three rollback levels (flag/code/migration) correctly specified |
| §23 Recovery | SAFE | Gap acknowledgment and compensating entry pattern are correct |
| §24 Scope | SAFE | Out-of-scope list is explicit and complete |
| §25 Coupling | SAFE | No existing production paths affected; blast radius documented |
| §26 Implementation | SAFE | Phase sequence is correct; review checklist is adequate |

---

## Pre-Implementation Patch Requirements

Before creating the implementation plan, apply these corrections to `phase-1a-slice4-audit-design.md`:

1. **C1** — Change §14.1 sanitization failure behavior to use `null` instead of `{ _error: "sanitization failed" }` for the affected snapshot field.

2. **C2** — Correct §4.2: MySQL `BEFORE UPDATE` with `SIGNAL SQLSTATE` does work to prevent updates. The deferral is a scope decision, not a technical limitation.

3. **C3** — Add to §10.3: Require verification that `app.set('trust proxy', 1)` is present in `server.js`. If absent, use only `X-Forwarded-For`; store `null` rather than a loopback address if neither source yields a client IP.

4. **C4** — Extend §9.3 `revokeRole` before snapshot to include `granted_by` and `granted_at`. Document the pre-DELETE SELECT query required in the controller.

5. **C5** — Change §15.1 header from "(6 files)" to "(3 files)".

6. **C6** — Add documentation to §11.2 explaining why `target_id = adminId` for `admin_user_roles` actions and how to query by role_id using JSON path expressions.

---

*Document version: 1.0 — Design review only. No implementation.*  
*Next step: Apply C1–C6 patches to `phase-1a-slice4-audit-design.md`, then create implementation plan.*
