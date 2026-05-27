# Otofine Admin Platform — Phase 1B Slice 5: Admin Session Governance Foundation
## Pre-Implementation Review

**Status:** REVIEW ONLY — no implementation  
**Date:** 2026-05-27  
**Source reviewed:** `phase-1b-slice5-session-governance-design.md`  
**Cross-referenced against:** `adminAuth.service.js`, `auth.middleware.js`, `token.service.js`, `session.service.js`, `adminAuth.controller.js`, `auth.routes.js`, `auditLog.service.js`

---

## Summary

| Category | Count |
|---|---|
| BLOCKERS | 2 |
| CORRECTIONS | 6 |
| SAFE areas | 12 |
| HIGH-RISK files/flows | 4 |

Two blockers prevent correct implementation: a Redis key inconsistency that would break session validation, and an audit integration design gap that would make `logAdminAction` calls structurally impossible from the service layer. Both require design document corrections before implementation planning begins.

---

## BLOCKERS

### B1 — Redis Revocation Key Is Inconsistent Across §7.2 and §11.1

**Sections:** §7.2 "Redis Blocklist Pattern" vs §7.3 "Session Token vs JWT" and §11.1 "Key Namespace"

**Problem:**

§7.2 specifies the Redis revocation key as:
```
SET admin:session:revoked:{session_token_hash} "1"
```

§7.3 then immediately contradicts this:
> "the Redis blocklist key uses the session `id` (integer) as the discriminator:
> `SET admin:session:revoked:{sid} "1"`"

§11.1 reinforces the `{sid}` format:
```
admin:session:revoked:{sid}     → "1" (TTL = remaining JWT lifetime seconds)
```

§9.1 (the session middleware) uses:
```
GET admin:session:revoked:{req.user.sid}
```

The `{session_token_hash}` format in §7.2 is **incompatible with the middleware design**. The session middleware at validation time has `req.user.sid` (from the JWT payload) but does NOT have the `session_token_hash`. Using the hash as the Redis key would require a DB roundtrip before the Redis check — which defeats the entire purpose of the Redis fast path (avoiding DB hits).

The correct format is `{sid}` (the integer DB row ID), which is available from `req.user.sid` in the JWT. §7.2 must be corrected to use `admin:session:revoked:{sid}` throughout.

**Impact if unresolved:** During implementation, §7.2 and §9.1 give conflicting instructions. An implementer following §7.2 would write blocklist entries under `{session_token_hash}` keys, but the middleware would check `{sid}` keys — revocations would never be detected via Redis, silently bypassing forced logout.

**Required fix:** Correct §7.2 to use `admin:session:revoked:{sid}` (the integer row ID from `admin_sessions`). Add a note that the session_token_hash is never used as a cache key — only for DB lookups.

---

### B2 — `logAdminAction` Cannot Be Called From the Service Layer

**Sections:** §13.2 "Audit Log Integration Points", §5.1 "Session Creation Flow"

**Problem:**

§13.2 states:
> "`adminAuth.service.js` (modified, additive) calls `logAdminAction` after session creation"

and shows:
```javascript
logAdminAction({ adminId: admin.id, action: "session.created", ... req ... }).catch(() => {});
```

The `logAdminAction` function signature (per the Slice 4 implementation) requires a `req` Express request object to capture `req.ip`, `req.headers['user-agent']`, and `req.adminPermissionChecked`. `adminAuth.service.js` is a **service layer** — it does not receive an Express `req` object. The current `loginAdmin({ email, password })` signature has no request context.

§13.2 acknowledges this: "Note: `req` is not available inside `adminAuth.service.js` — it is a service layer, not a controller." It then proposes using "the service's `meta` parameter (same pattern as `issueRefreshToken(accountId, { userAgent, ip })`)."

But this does NOT resolve the problem: `logAdminAction` reads directly from `req.ip` and `req.headers` — it does not accept a `{ userAgent, ip }` meta object. Calling `logAdminAction` with a fake `req = { ip: meta.ip, headers: { 'user-agent': meta.userAgent } }` would work technically but requires constructing a synthetic request object — which is an undocumented requirement that will confuse implementers.

The cleanest architecturally correct approach is to call `logAdminAction` from the **controller**, not the service:

```
adminAuth.controller.js → loginAdmin() → service returns result
                       → if result.ok: logAdminAction({ ..., req }) [controller has req]
```

This maintains the separation of concerns:
- Service handles business logic (credential verification, session creation)
- Controller handles HTTP context (calling audit log with `req`)

**Required fix:** The design must specify that audit `logAdminAction` calls for session events are the responsibility of the **controller** (`adminAuth.controller.js`), not the service (`adminAuth.service.js`). §13.2 must be rewritten to reflect this. The `loginAdmin` service should return session data (session ID, refresh token) which the controller uses to call `logAdminAction`.

This also applies to `session.refresh` and `session.logout` audit calls — these handlers will be controllers with access to `req`.

---

## CORRECTIONS

### C1 — Concurrent Refresh Request Race Not Specified

**Section:** §6.1 "Pattern: Single-Use Rotation"

**Problem:**

The refresh rotation sequence is:
```
4. Revoke current session row (set revoked_at, revoked_reason = 'refresh_rotation')
5. Issue new session
```

Step 4 is `UPDATE admin_sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`. If two concurrent refresh requests arrive with the same refresh token simultaneously, both threads read the session as valid, both attempt the UPDATE. MySQL row-level locking ensures only one UPDATE succeeds (`affectedRows = 1`). The second thread gets `affectedRows = 0` — the session was already revoked.

The design does not specify what happens when `affectedRows = 0` in step 4. This case is semantically identical to presenting a revoked refresh token (reuse detection). Without explicit handling, an implementer may:
- Proceed to issue a new session anyway (severe security regression)
- Return a generic error (losing the security event log)
- Handle correctly as reuse detection (correct, but not specified)

**Required fix:** Add to §6.1: "If the session revocation UPDATE returns `affectedRows = 0` (session was already revoked — concurrent request or replay), treat identically to reuse detection: return 401, log `session.suspicious_refresh_reuse`."

---

### C2 — "Verify Admin is Active" Step Assumes Unconfirmed Schema

**Section:** §6.1 step 3

**Problem:**

Step 3 of the refresh sequence states:
> "Verify admin still exists and is active (SELECT from admin table)"

The current `admin` table query in `adminAuth.service.js` is:
```javascript
pool.query("SELECT * FROM admin WHERE email = ? LIMIT 1", [email])
```

There is no evidence from the codebase review that the `admin` table has an `is_active`, `status`, or equivalent column. The shop system checks `account.status !== "active"`, but the admin table schema is not confirmed to have this field. If the implementation attempts `WHERE id = ? AND status = 'active'` and no such column exists, the query throws a SQL error, breaking the refresh endpoint.

**Required fix:** Change step 3 to: "Verify admin still exists (`SELECT id FROM admin WHERE id = ?`). If no row is returned: return 401. Active-status enforcement requires verifying that the `admin` table has a status column before implementing this check; otherwise, existence check only."

---

### C3 — Redis Revocation TTL Should Use JWT Lifetime, Not Session Lifetime

**Section:** §11.2 "Redis Write: Session Revocation"

**Problem:**

The Redis blocklist TTL is specified as:
```javascript
const remainingTtlMs = Math.max(0, expiresAt.getTime() - Date.now());
// expiresAt = admin_sessions.expires_at (session lifetime, default 30d)
```

A session is revoked immediately, but its `expires_at` could be 30 days in the future. The Redis entry persists for 30 days. Meanwhile, the JWT issued for that session has an expiry of `AUTH_ADMIN_ACCESS_EXPIRES` (default 7d, potentially as short as 4h). Once all JWTs bearing that `sid` have expired, the Redis blocklist entry is no longer needed — JWTs with expired `exp` are rejected by `requireAuth` before reaching the session middleware.

Using session `expires_at` (30d) instead of JWT `exp` (up to 7d) results in Redis keys persisting for 23 extra days per revocation — a 4x Redis memory overhead vs. the minimum necessary.

**Required fix:** The TTL calculation should use the JWT's access token lifetime rather than the session lifetime:

```javascript
// Use the JWT access token TTL as the cap — Redis entry only needs to live
// until no valid JWT can carry this sid.
const SESSION_REMAINING_MS = Math.max(0, session.expires_at.getTime() - Date.now());
const JWT_TTL_MS = parseDurationMs(authConfig.adminAccessExpiresIn || authConfig.accessExpiresIn);
const remainingTtlMs = Math.min(SESSION_REMAINING_MS, JWT_TTL_MS);
```

This caps the Redis entry lifetime at the JWT's maximum possible age, regardless of how long the session itself is valid. For sessions revoked well within their lifetime, this reduces Redis memory usage significantly.

---

### C4 — Session-Disabled Login Flow Missing `admin` Field in Response

**Section:** §5.1 "Login Flow", session-disabled path

**Problem:**

The session-disabled (flag off) login path shows:
```
[NEW] if !ADMIN_SESSION_GOVERNANCE_ENABLED:
  INSERT INTO admin_sessions (..., refresh_token_hash: null)
  → return { token: original-JWT }   ← MISSING admin field
```

The existing `loginAdmin` response (which this path must preserve) returns:
```javascript
return { ok: true, token, admin: { id: admin.id, email: admin.email } };
```

The controller then responds with:
```javascript
res.json({ token: result.token, admin: result.admin });
```

If the session-disabled path returns only `{ token: original-JWT }` without the `admin` field, the controller response becomes `{ token: ..., admin: undefined }`, serialized as `{ "token": "..." }` — breaking any existing admin client that reads `response.admin.id` or `response.admin.email`.

**Required fix:** The session-disabled path must return the full original shape: `{ token: original-JWT, admin: { id: admin.id, email: admin.email } }`. The existing return value pattern must be preserved exactly.

---

### C5 — Refresh Rotation Expiration Strategy (Sliding vs Fixed) Not Specified

**Section:** §6.1 step 5, §17.1

**Problem:**

Step 5 says "Issue new session: new session token + new refresh token, new `expires_at`." §17.1 says:
```
Session expires_at = created_at + AUTH_ADMIN_REFRESH_EXPIRES (default: 30d)
```

If "new `expires_at`" means `now + AUTH_ADMIN_REFRESH_EXPIRES`, this is **sliding expiration**: every refresh resets the 30-day window. An admin who refreshes every 25 days maintains an active session indefinitely — the 30-day window never closes.

The shop session service uses fixed expiration: `issueRefreshToken` always computes `expiresAt = new Date(Date.now() + parseDurationMs(...))`. For shop sessions, since sessions are not reused across rotation (each rotation creates a new row), this is also effectively sliding — the shop pattern has the same gap.

For security-conscious admin sessions, **fixed expiration** (capped at the original session's `expires_at`) is the better choice:
- Prevents indefinite extension via refresh chain
- Forces re-authentication after the original session window closes
- Provides a hard limit on session lifetime regardless of activity

**Required fix:** §6.1 step 5 must specify the expiration strategy. Recommended: fixed expiration — the new session row inherits the ORIGINAL session's `expires_at` (not `now + 30d`). Add to §17.1: "On refresh rotation, the new session row's `expires_at` is copied from the original session, not recalculated from now."

---

### C6 — `admin-logout` Behavior When `sid` Is Absent Not Specified

**Section:** §8.1 "Forced Logout Endpoint"

**Problem:**

`POST /api/auth/admin-logout` is the self-logout endpoint. It revokes the admin's current session by reading `req.user.sid`. When governance is disabled (or during the transition period when admins have old JWTs without `sid`), `req.user.sid` is `undefined`.

The design does not specify what `admin-logout` should do in this case. Without guidance, an implementation might:
- Return 400 (Bad Request: "no session to revoke") — confusing to clients expecting 200
- Throw an uncaught error trying to operate on `undefined`
- Return 200 (correct, but undocumented)

**Required fix:** Add to §8.1: "`admin-logout` always returns 200 from the client's perspective, regardless of whether a session record was revoked. If `req.user.sid` is absent (governance-disabled JWT or legacy token), the handler performs no DB/Redis operations and returns 200. The client-side intent (discard token, clear local state) is honored regardless of server state. This matches the OIDC logout pattern where logout is unconditional from the UX perspective."

---

## SAFE AREAS

### S1 — Session Fixation Prevention

Session tokens are generated post-authentication (after credential verification) using `generateOpaqueToken()` (32 bytes, `crypto.randomBytes`, base64url). No pre-authentication session identifier exists. Session fixation attacks require a predictable or attacker-controlled session identifier to be established before authentication — neither condition is possible here.

### S2 — Token Hash Storage Security

The design correctly specifies storing only SHA-256 hashes of opaque tokens in the DB and Redis. The plaintext tokens are returned to the client only at issuance time. A DB compromise does not expose valid tokens (unlike storing plaintext). This matches the existing `shop_refresh_tokens` pattern.

### S3 — JWT Backward Compatibility

`requireAdminSession` checks `req.user.sid` before performing any Redis/DB lookups. When `sid` is absent (all pre-Slice 5 JWTs), the middleware calls `next()` immediately. This ensures zero disruption to existing admin sessions during deployment and the transition period before all old JWTs expire.

### S4 — `requireAuth`/`requireAdmin` Unchanged

Both middleware functions are on the "NEVER TOUCH" list. Zero regression risk to existing auth verification chain.

### S5 — `requireAdminSession` Fail-Closed Security Semantics

When governance is enabled and the DB is unavailable: returning 401 (fail-closed) is the correct behavior for a session validation middleware. If session validity cannot be confirmed, access must be denied. This is the appropriate security posture. The ENV fallback (`sessionGovernanceEnabled = false`) provides an operational escape valve.

### S6 — Hidden Deployment Guarantees

When `ADMIN_SESSION_GOVERNANCE_ENABLED = false`: admin login response is identical to current behavior, JWT shape is unchanged, `requireAdminSession` is a pure pass-through, no DB/Redis operations on requests. The session table accumulates records silently — correct and intentional for data readiness when governance is later enabled.

### S7 — Redis Namespace Isolation

`admin:session:*` is distinct from `admin:ff:*` (feature flags) and `admin:rbac:*` (RBAC cache). The `invalidateByLogicalPrefix("admin:ff:ADMIN_")` used in Slice 2 will not inadvertently clear session blocklist entries.

### S8 — Session Table Schema Correctness

The `admin_sessions` table design is sound:
- `BIGINT UNSIGNED` PK for scale
- `UNIQUE INDEX` on both token hashes (prevents collision, enables O(1) lookup)
- `NOT NULL` on `admin_id` (Slice 5 sessions are always human-initiated)
- No physical FKs (C4 pattern — survives admin deletion)
- `metadata_json` JSON column for zero-schema MFA extensibility
- `idx_as_admin_active (admin_id, revoked_at, expires_at)` — correctly supports the "list active sessions" query

### S9 — Migration Idempotency

`CREATE TABLE IF NOT EXISTS` for the table + `INSERT IGNORE INTO admin_feature_flags` for the flag seed. Both are safe to run twice. The runner whitelist addition is a 1-line array push — additive, non-destructive.

### S10 — Multi-Device Independence

One session per login, each session independently revocable. Revoking session A does not affect session B. `revokeAllSessionsForAdmin` is exported for future use. This model is correct for supporting concurrent admin logins from different devices.

### S11 — MFA Extensibility Via `metadata_json`

The session row's `metadata_json` column provides zero-schema-change MFA integration in a future slice. `req.adminSessionId` (set by `requireAdminSession`) provides the session handle that a future `requireMFA` middleware needs. The design path is clean.

### S12 — Rollback Strategy Completeness

Three independent rollback levels are correctly specified:
1. Feature flag deactivation (< 60s, no restart)
2. Code revert (additive changes only, PM2 restart)
3. Migration rollback (destructive — last resort)

The flag-deactivation path correctly restores all auth behavior to pre-Slice 5 state.

---

## HIGH-RISK FILES / FLOWS

### HR1 — `adminAuth.service.js` (Server-Wide Blast Radius)

This file is imported at server startup through the chain: `server.js` → `auth.routes.js` → `authController.js` → `adminAuth.controller.js` → `adminAuth.service.js`. A syntax error or unresolvable import in `adminAuth.service.js` **prevents `server.js` from starting entirely** — not just admin routes, but all routes including storefront, RFQ, and seller endpoints. This blast radius is significantly larger than any previous Slice 1–4 modification (all of which were isolated to the admin barrel). The implementation of Slice 5 changes to this file requires exceptional care and mandatory `node --check` + full server startup test before PM2 restart.

### HR2 — `auth.routes.js` (Server Startup Failure)

Any import error in the new handler files referenced by `auth.routes.js` prevents the route file from loading, causing `server.js` startup failure with the same total blast radius as HR1.

### HR3 — `requireAdminSession` Under DB Unavailability (Lockout Risk)

When `ADMIN_SESSION_GOVERNANCE_ENABLED = true` and the DB is unavailable, `requireAdminSession` returns 401 for all requests (fail-closed). This blocks all admin API access including RBAC routes, platform routes, and any future admin session management. The ENV fallback mechanism (setting `ADMIN_SESSION_GOVERNANCE_ENABLED=false` + PM2 restart) is the only recovery path that doesn't require DB access. This must be documented as a named operational procedure before governance is enabled.

### HR4 — Refresh Rotation Under Network Partition

During a DB network partition, a refresh request could:
1. Successfully write the revocation of the old session (first DB call)
2. Fail on the new session INSERT (DB partition)
3. Return 500 to the client

In this state, the admin's refresh token is permanently invalidated but no new session exists. The admin must re-login. This is an acceptable security tradeoff (fail-safe: revoke old before issuing new), but it must be documented as a known operational consequence of network partitions during the refresh window.

---

## Pre-Implementation Patch Requirements

Before creating the implementation plan, apply the following corrections to `phase-1b-slice5-session-governance-design.md`:

**B1:** Correct §7.2 to use `admin:session:revoked:{sid}` as the Redis key. Remove all references to `{session_token_hash}` as a Redis key format. Add note that `session_token_hash` is a DB-only lookup field.

**B2:** Revise §13.2 — `logAdminAction` calls for session events are the responsibility of the **controller** (`adminAuth.controller.js`), not the service. The service returns session data; the controller calls `logAdminAction(req)` using the HTTP context it owns. Remove the service-layer `logAdminAction` call from §5.1 login flow.

**C1:** Add to §6.1: concurrent refresh (UPDATE returns `affectedRows = 0`) must be treated as suspicious reuse: 401 + `session.suspicious_refresh_reuse` log.

**C2:** Revise §6.1 step 3 to verify admin **existence only** (not "active" status) unless the `admin` table schema confirms a status field.

**C3:** Add to §11.2: Redis TTL = `Math.min(session.expires_at - now, JWT_ACCESS_TTL_MS)` — capped at the JWT access token lifetime, not the full session lifetime.

**C4:** Correct §5.1 session-disabled response shape to `{ token, admin: { id, email } }` — must include the `admin` field.

**C5:** Specify in §6.1 and §17.1 that refresh rotation uses **fixed expiration** — new session inherits original session's `expires_at` (not recalculated from now).

**C6:** Add to §8.1: `admin-logout` always returns 200 regardless of whether a session was revoked; absent `sid` → no-op → 200.

---

*Document version: 1.0 — Pre-implementation review only. No implementation.*  
*Next step: Apply B1–B2 and C1–C6 patches to `phase-1b-slice5-session-governance-design.md`, then create implementation plan.*
