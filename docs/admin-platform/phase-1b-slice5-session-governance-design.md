# Otofine Admin Platform — Phase 1B Slice 5: Admin Session Governance Foundation
## Design + Architecture Document

**Status:** DESIGN ONLY — no implementation  
**Date:** 2026-05-27  
**Source of truth:** All system audit docs, Slice 1–4 implementation state, existing auth domain code  
**Deployed baseline:** Slice 1 (schema_migrations), Slice 2 (feature flags), Slice 3 (RBAC), Slice 4 (audit log)

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Design Goals](#2-design-goals)
3. [Admin Session Table Design](#3-admin-session-table-design)
4. [JWT Compatibility Strategy](#4-jwt-compatibility-strategy)
5. [Session Creation Flow](#5-session-creation-flow)
6. [Refresh Token Rotation Strategy](#6-refresh-token-rotation-strategy)
7. [Session Revocation Model](#7-session-revocation-model)
8. [Forced Logout Semantics](#8-forced-logout-semantics)
9. [Session Validation Middleware](#9-session-validation-middleware)
10. [Device/Session Metadata Capture](#10-devicesession-metadata-capture)
11. [Redis/Session Interaction](#11-redissession-interaction)
12. [Feature Flag Integration](#12-feature-flag-integration)
13. [Audit Integration](#13-audit-integration)
14. [Hidden Deployment Strategy](#14-hidden-deployment-strategy)
15. [Security Event Logging](#15-security-event-logging)
16. [Multi-Device Semantics](#16-multi-device-semantics)
17. [Expiration Strategy](#17-expiration-strategy)
18. [PM2 Startup Safety](#18-pm2-startup-safety)
19. [Migration Plan](#19-migration-plan)
20. [Module Structure](#20-module-structure)
21. [Runtime Blast-Radius Analysis](#21-runtime-blast-radius-analysis)
22. [Rollback Strategy](#22-rollback-strategy)
23. [Operational Recovery Procedures](#23-operational-recovery-procedures)
24. [Future MFA Compatibility](#24-future-mfa-compatibility)
25. [Regression-Risk Analysis](#25-regression-risk-analysis)
26. [Slice 5 Scope Constraints](#26-slice-5-scope-constraints)
27. [Dangerous Coupling Analysis](#27-dangerous-coupling-analysis)
28. [Implementation Phases](#28-implementation-phases)

---

## 1. Current State Analysis

### 1.1 Existing Admin Auth Architecture

| Component | Current State | Gap |
|---|---|---|
| Admin login | `POST /api/auth/admin-login` → returns JWT only | No session record, no refresh token |
| JWT payload | `{ id, role: "admin", email, iat, exp }` | No session ID (`sid`) |
| JWT TTL | `AUTH_ACCESS_EXPIRES` (default `"7d"`) — shared with shop | Admin-specific TTL not available |
| Token storage | Client-side only (localStorage/header) | No server-side session record |
| Token revocation | **Impossible** — no server-side state | Compromised JWTs remain valid until natural expiry |
| Admin logout | **No endpoint** — `/api/auth` has no `admin-logout` | Client can only discard the token locally |
| Admin refresh | **No endpoint** — no admin refresh token issued | 7-day JWT must be fully trusted for its lifetime |
| Session tracking | None | Cannot enumerate active admin sessions |
| Device tracking | None | Cannot identify suspicious concurrent sessions |
| Forced logout | **Impossible** | Security incident response is blocked |

### 1.2 Shop Session Infrastructure (Reference)

The shop auth domain already implements a refresh token pattern via `shop_refresh_tokens` table:
- `account_id, token_hash (SHA-256), expires_at, user_agent, ip, revoked_at`
- `issueRefreshToken`, `refreshShopSession`, `logoutShop` in `session.service.js`
- `crypto.util.js` provides `generateOpaqueToken()` and `hashToken()` utilities

Slice 5 follows this established pattern for admin sessions.

### 1.3 Token Service (Shared)

`token.service.js` exports `signAdminAccessToken(admin)` which signs `{ id, role: "admin", email }`. This file is in the forbidden modification category — Slice 5 will NOT modify it. Instead, the session governance layer adds a wrapper that optionally includes `sid` in the token.

### 1.4 Migration Whitelist Gap

The runner whitelist in `run-admin-migration.js` currently contains files 051–056. `056_admin_job_queue.sql` is reserved but not yet implemented. Slice 5 requires `057_admin_sessions.sql`, which is **not** in the whitelist. The runner whitelist must be extended with this one additive entry.

This is the only modification to `run-admin-migration.js` in Slice 5.

### 1.5 Feature Flag Infrastructure

`ADMIN_SESSION_GOVERNANCE_ENABLED` is not yet seeded. It must be added to:
- `admin_feature_flags` table (seeded in `057_admin_sessions.sql`)
- `adminPlatform.config.js` (additive key addition)
- `FLAG_KEY_MAP` and `ALL_FLAG_KEYS` arrays
- `backend/.env` (`ADMIN_SESSION_GOVERNANCE_ENABLED=false`)

---

## 2. Design Goals

1. **Server-side session tracking** — every admin login creates a durable session record
2. **Session revocation** — forced logout possible within 60 seconds of flag activation
3. **Refresh token rotation** — short-lived admin JWTs (configurable) with rotating refresh tokens
4. **Device metadata capture** — IP, user-agent, derived device hint per session
5. **JWT backward compatibility** — existing admin JWTs continue to work during transition
6. **Hidden deployment** — session records created but not validated until flag enabled
7. **Audit-integrated** — session create/revoke/force-revoke written to `admin_audit_log`
8. **Additive only** — no modifications to `requireAuth`, `requireAdmin`, JWT payload (initially)
9. **MFA-ready** — session `metadata_json` reserved for future MFA state
10. **PM2 safe** — no startup side effects

---

## 3. Admin Session Table Design

### 3.1 Table: `admin_sessions`

**Migration file:** `057_admin_sessions.sql` (requires runner whitelist addition)

```sql
CREATE TABLE IF NOT EXISTS admin_sessions (
  id                    BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,

  -- Actor
  admin_id              INT UNSIGNED      NOT NULL,
  -- Logical reference to admin.id; no physical FK (C4 pattern).

  -- Token hashes (SHA-256 of opaque tokens — never store plaintext)
  session_token_hash    VARCHAR(64)       NOT NULL,
  -- SHA-256 hex of the opaque session token issued at login.
  -- Used for session validation lookups.
  refresh_token_hash    VARCHAR(64)       NULL,
  -- SHA-256 hex of the admin refresh token. NULL if no refresh token issued.
  -- NULL is valid: token-only sessions (backward-compat mode, no refresh).

  -- Device/request context
  ip_address            VARCHAR(45)       NULL,
  user_agent            VARCHAR(512)      NULL,
  device_hint           VARCHAR(255)      NULL,
  -- Derived from user_agent: e.g. "Chrome 124 on Windows" — best-effort extraction.
  -- Never trust for security decisions; informational only.

  -- Lifecycle fields
  created_at            DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at          DATETIME(3)       NULL,
  -- Updated on successful refresh. NULL = never refreshed (access-token-only session).
  expires_at            DATETIME(3)       NOT NULL,
  -- Hard expiry: session is invalid regardless of revocation state.
  revoked_at            DATETIME(3)       NULL,
  -- NULL = active (unless expired). Non-NULL = revoked.
  revoked_by            INT UNSIGNED      NULL,
  -- NULL = self-logout or system expiry. Non-NULL = admin_id of the revoker.
  revoked_reason        VARCHAR(100)      NULL,
  -- 'logout', 'force_logout', 'security_event', 'password_change', 'all_sessions'

  -- Extensible context
  metadata_json         JSON              NULL,
  -- Reserved: { mfa_verified, mfa_method, mfa_verified_at, client_hint }
  -- MFA fields populated in a future slice.

  PRIMARY KEY (id),

  -- Validation lookup (must be unique — one session per token hash)
  UNIQUE INDEX uq_as_session_token  (session_token_hash),
  UNIQUE INDEX uq_as_refresh_token  (refresh_token_hash),

  -- Per-admin session management: "list active sessions for admin 7"
  INDEX idx_as_admin_active         (admin_id, revoked_at, expires_at),

  -- Expiry cleanup sweep
  INDEX idx_as_expires              (expires_at),

  -- Creation time for audit queries
  INDEX idx_as_admin_created        (admin_id, created_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 Column Rationale

| Column | Type | Rationale |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | Audit log scale; used as `sid` in JWT payload (Phase 1B) |
| `admin_id` | `INT UNSIGNED NOT NULL` | Matches `admin` table PK; NOT NULL (system sessions out of scope for Slice 5) |
| `session_token_hash` | `VARCHAR(64)` | SHA-256 hex (64 chars); unique index for O(1) lookup |
| `refresh_token_hash` | `VARCHAR(64) NULL` | NULL for token-only sessions (backward compat) |
| `device_hint` | `VARCHAR(255)` | Informational; extracted from UA at session creation |
| `last_used_at` | `DATETIME(3) NULL` | Updated on refresh; NULL = never refreshed |
| `expires_at` | `DATETIME(3)` | Hard expiry; checked independently of `revoked_at` |
| `revoked_at` | `DATETIME(3) NULL` | Soft delete pattern; NULL = active |
| `revoked_by` | `INT UNSIGNED NULL` | Distinguishes self-logout from forced revocation |
| `revoked_reason` | `VARCHAR(100)` | Operational context for audit queries |
| `metadata_json` | `JSON NULL` | Future MFA state; zero-schema-change extensibility |

---

## 4. JWT Compatibility Strategy

### 4.1 Phase 1B Approach: Additive `sid` Field

The current JWT payload: `{ id, role: "admin", email, iat, exp }` — **unchanged for existing sessions**.

In Slice 5, newly issued JWTs gain an optional `sid` field when `ADMIN_SESSION_GOVERNANCE_ENABLED` is true:

```javascript
// Phase 1B JWT (new logins when governance enabled):
{ id, role: "admin", email, sid: <session_db_id>, iat, exp }

// Phase 0 JWT (existing sessions, or governance disabled):
{ id, role: "admin", email, iat, exp }
```

`requireAuth` (NEVER modified) validates the JWT signature regardless. The `sid` field is optional — `requireAuth` does not fail on its presence or absence.

The new `requireAdminSession` middleware reads `req.user.sid`:
- **Present:** performs session blocklist check via Redis → DB
- **Absent (legacy JWT):** passes through — backward compatible

### 4.2 `signAdminAccessToken` Wrapper

`token.service.js` exports `signAdminAccessToken(admin)` — **never modified**. Slice 5 introduces a wrapper function in `adminSession.service.js`:

```javascript
// New function in adminSession.service.js:
function signAdminSessionToken(admin, sessionId) {
  // Calls the ORIGINAL signAdminAccessToken plus sid
  // Does NOT import from token.service.js directly — uses the shared jwt.sign pattern
  // with authConfig.jwtSecret and authConfig.adminAccessExpiresIn (new env)
}
```

Alternatively — the cleanest approach is to extend `adminAuth.service.js` to call `signAdminSessionToken` from the session service when governance is enabled. When disabled, it falls back to the original `tokenService.signAdminAccessToken(admin)`.

### 4.3 JWT TTL Strategy

Current: `AUTH_ACCESS_EXPIRES` (default `"7d"`) — **shared with shop tokens**.

Phase 1B adds admin-specific TTL (additive env, no existing behavior changed):
- `AUTH_ADMIN_ACCESS_EXPIRES` (default: `"7d"` — preserves current behavior)
- `AUTH_ADMIN_REFRESH_EXPIRES` (default: `"30d"` — mirrors shop pattern)

When `AUTH_ADMIN_ACCESS_EXPIRES` is not set, falls back to `AUTH_ACCESS_EXPIRES` for backward compatibility. Reducing the admin JWT TTL (e.g., to `"4h"`) is an operational decision made at activation time, not a deployment requirement.

---

## 5. Session Creation Flow

### 5.1 Login Flow (Additive Changes to `adminAuth.service.js`)

```
POST /api/auth/admin-login
  │
  └── loginAdmin({ email, password })
        [existing] verify credentials
        [existing] rehash if needed
        [existing] signAdminAccessToken → JWT
        │
        [NEW] if ADMIN_SESSION_GOVERNANCE_ENABLED:
          generate opaque session token (32 bytes, base64url)
          hash session token → session_token_hash
          generate opaque refresh token
          hash refresh token → refresh_token_hash
          INSERT INTO admin_sessions (...)
          return { token: JWT-with-sid, sessionToken, refreshToken,
                   admin: { id: admin.id, email: admin.email } }
        [NEW] if !ADMIN_SESSION_GOVERNANCE_ENABLED:
          INSERT INTO admin_sessions (..., refresh_token_hash: null)  [best-effort]
          → session record created silently; no refresh token issued
          → JWT is the original shape (no sid)
          return { token: original-JWT, admin: { id: admin.id, email: admin.email } }

NOTE: logAdminAction is NOT called from the service layer. The controller
(adminAuth.controller.js) calls logAdminAction after loginAdmin() returns,
using the HTTP request context (req) that the controller owns. See §13.2.
```

**Session creation is best-effort on login failure path:** If the `INSERT INTO admin_sessions` fails:
- Log error with `console.error("[admin:session] session create failed:", err.message)`
- Continue — do NOT block the login response
- The admin receives a valid JWT; session governance is degraded but login succeeds

### 5.2 What the Client Receives

When governance is disabled (Phase 1B default):
```json
{ "token": "<jwt>", "admin": { "id": 1, "email": "..." } }
```
Identical to current behavior.

When governance is enabled (post-activation):
```json
{
  "token": "<jwt-with-sid>",
  "refreshToken": "<opaque-refresh-token>",
  "admin": { "id": 1, "email": "..." }
}
```

**Backward compatibility:** The client can ignore `refreshToken` if it doesn't support it. The JWT continues to function for `AUTH_ADMIN_ACCESS_EXPIRES` duration without refresh.

---

## 6. Refresh Token Rotation Strategy

### 6.1 Pattern: Single-Use Rotation

Admin refresh tokens use the same single-use rotation pattern as shop refresh tokens:

```
POST /api/auth/admin-refresh
  Body: { refreshToken: "<opaque>" }
  │
  1. Hash provided refresh token → lookup admin_sessions by refresh_token_hash
  2. Verify session: NOT revoked, expires_at > NOW()
  3. Verify admin still exists (SELECT id FROM admin WHERE id = ?)
     → if no row: return 401 { error: "Admin not found" }
     NOTE: "active status" check is intentionally omitted — the admin table
     schema does not have a confirmed status/is_active column. If a status
     column is added in a future slice, this step should be extended to verify it.
  4. Revoke current session row (set revoked_at, revoked_reason = 'refresh_rotation')
  5. Issue new session: new session token + new refresh token
     expires_at = ORIGINAL session's expires_at (fixed expiration — NOT recalculated from now)
     Rationale: sliding expiration (now + 30d on every refresh) allows indefinite session
     extension via refresh chain. Fixed expiration enforces a hard session lifetime from
     initial login regardless of refresh activity.
  6. Sign new JWT (with new sid)
  7. Update last_used_at on new session
  8. Return { token: newJWT, refreshToken: newRefreshToken }
```

**On token reuse detection (security):** If a refresh token that has already been revoked (used once) is presented again, this indicates token theft or replay:
- Return 401 immediately
- Log `logAdminAction("session.suspicious_refresh_reuse")` — security event
- Optionally: revoke ALL active sessions for this admin (configurable via `revoke_all_on_reuse` setting in `metadata_json`)

**Concurrent refresh race condition (C1):** Two simultaneous requests presenting the same refresh token: both read the session as valid, both attempt step 4's UPDATE. MySQL row-level locking ensures only one UPDATE succeeds (`affectedRows = 1`). The second gets `affectedRows = 0` — this case is semantically identical to presenting a revoked token. The implementation must explicitly check `affectedRows` from the revocation UPDATE:
- `affectedRows = 1` → revocation succeeded → continue to step 5 (issue new session)
- `affectedRows = 0` → session was already revoked (raced or replayed) → treat as reuse detection: return 401, log `session.suspicious_refresh_reuse`

**Never proceed to issue a new session when the revocation UPDATE returns `affectedRows = 0`.**

### 6.2 Refresh Endpoint

New: `POST /api/auth/admin-refresh` — additive to `auth.routes.js`

Rate-limited by existing `shopLoginRateLimit` (reused — same limiter is appropriate for admin refresh).

### 6.3 No Auto-Refresh on Every Request

The session middleware does NOT auto-refresh the access token on every request. Refresh is explicit (client-initiated via `/admin-refresh`). This avoids server-side token rotation overhead on every API call.

---

## 7. Session Revocation Model

### 7.1 Three Revocation Paths

| Path | Trigger | Who | Effect |
|---|---|---|---|
| Self-logout | `POST /api/auth/admin-logout` | Admin themselves | Revokes their current session |
| Forced logout (specific) | Admin platform API (future slice) | Superadmin | Revokes a specific admin session by session ID |
| Forced logout (all) | Admin platform API (future slice) | Superadmin | Revokes all active sessions for an admin |

All three paths write to `admin_sessions.revoked_at` + `revoked_reason` and publish to Redis blocklist.

### 7.2 Redis Blocklist Pattern

On session revocation:
```
SET admin:session:revoked:{sid} "1"
EXPIRE admin:session:revoked:{sid} <remaining_jwt_access_ttl_ms>
```

Key rationale:
- Key uses `sid` (the integer `admin_sessions.id`) — available directly from `req.user.sid` in the JWT, enabling O(1) Redis lookup with no prior DB access
- Using `session_token_hash` as the key would require a DB roundtrip before the Redis check, defeating the fast-path purpose
- `sid` is a non-sensitive integer DB row ID — no security risk in exposing it as a Redis key
- TTL is capped at the JWT access token lifetime (not the session lifetime) — once all JWTs bearing this `sid` have expired, the Redis entry is no longer needed (see §11.2 for TTL calculation)
- Key namespace `admin:session:revoked:` is distinct from `admin:ff:` and `admin:rbac:`

**`session_token_hash` is a DB-only field.** It is used exclusively for DB lookups during session creation and is never used as a Redis cache key.

On session validation in `requireAdminSession`:
```
GET admin:session:revoked:{req.user.sid}
  → "1": return 401 (session revoked)
  → null (miss): check DB admin_sessions WHERE id = req.user.sid AND admin_id = req.user.id
    → not found: return 401 { error: "Session not found" }
    → revoked_at IS NOT NULL: set Redis blocklist + return 401
    → expires_at <= NOW(): return 401 { error: "Session expired" }
    → valid: set req.adminSessionId = row.id; return next()
```

### 7.3 Session Token vs JWT

The session token (opaque, stored as `session_token_hash` in the DB) is separate from the JWT:
- The JWT is sent in `Authorization: Bearer <jwt>` on every request — no separate session token header
- The `sid` field in the JWT payload is the `admin_sessions.id` (integer) — the session is identified by the JWT itself
- `requireAdminSession` looks up `admin_sessions WHERE id = req.user.sid AND admin_id = req.user.id`
- The `session_token_hash` column exists for DB integrity and future server-side verification paths; it is not used in the per-request validation flow

---

## 8. Forced Logout Semantics

### 8.1 Forced Logout Endpoint (Phase 1B Scope)

Slice 5 provides the **infrastructure** for forced logout (session revocation). The admin-facing API endpoint to force-logout another admin is deferred to a future slice (requires RBAC permission `sessions:manage`).

What Slice 5 provides:
- `POST /api/auth/admin-logout` — self-logout (revokes own session)
- `adminSession.service.js` exports `revokeSession(sessionId, { revokedBy, reason })` — callable from future forced logout controller
- `adminSession.service.js` exports `revokeAllSessionsForAdmin(adminId, { revokedBy, reason })` — callable from future controller

**`admin-logout` always returns 200.** The logout endpoint must never return an error status for a missing or absent `req.user.sid`. Specifically:
- If `ADMIN_SESSION_GOVERNANCE_ENABLED` is false → no-op, return 200 `{ message: "Logged out" }`
- If `req.user.sid` is absent (legacy JWT issued before Slice 5 was deployed) → no-op, return 200 `{ message: "Logged out" }`
- If the session row is already revoked or not found → no-op, return 200 `{ message: "Logged out" }` (idempotent)
- Only return an error (500) if an unexpected DB/Redis write failure occurs, not for logical absence

Rationale: the logout endpoint represents client intent to end a session. Returning 4xx because no revocable session exists creates a confusing client failure for a benign logout-twice or legacy-token scenario.

### 8.2 Forced Logout Propagation Timing

When a session is revoked in the DB + Redis blocklist set:
- The admin's current access token remains valid until it is presented to an API endpoint
- On the next API request: `requireAdminSession` checks Redis → finds blocklist entry → returns 401
- Maximum propagation delay: ~1 Redis round-trip (~1ms)
- Edge case: If Redis is down, the DB check is the fallback. DB check adds ~3-5ms but catches the revocation.

### 8.3 No JWT Blacklist (By Design)

Slice 5 does NOT implement a JWT-level blacklist (blocking specific JWT `jti` values). Reasons:
- JWT blacklisting requires storing every issued JWT token or its fingerprint
- The session model (blocklist by `sid`) achieves the same result with far less Redis memory
- Every JWT will eventually expire naturally; the session blocklist entry TTL matches JWT lifetime

---

## 9. Session Validation Middleware

### 9.1 `requireAdminSession` — Design

New file: `backend/modules/admin/core/adminSession/adminSession.middleware.js`

```
requireAdminSession(req, res, next):

  Step 1: Check ADMIN_SESSION_GOVERNANCE_ENABLED
    → false (default): return next() immediately
      (Backward compat: governance disabled, no session lookup)
    → error on flag check: fall back to adminPlatformConfig.sessionGovernanceEnabled (ENV = false)

  Step 2: Check req.user.sid
    → absent (legacy JWT without sid): return next()
      (Pre-Slice 5 tokens issued before sid was added to payload)
    → present: continue to session lookup

  Step 3: Redis blocklist check
    GET admin:session:revoked:{req.user.sid}
    → "1": return 401 { error: "Session revoked" }
    → null (miss): continue to DB check

  Step 4: DB session lookup
    SELECT id, revoked_at, expires_at FROM admin_sessions
    WHERE id = req.user.sid AND admin_id = req.user.id
    → not found: return 401 { error: "Session not found" }
    → revoked_at IS NOT NULL: set Redis blocklist + return 401
    → expires_at <= NOW(): return 401 { error: "Session expired" }
    → valid: set req.adminSessionId = row.id; return next()

  Step 5: (Optional) update last_used_at
    Fire-and-forget: UPDATE admin_sessions SET last_used_at = NOW() WHERE id = req.user.sid
    → Not awaited — does not block request processing
```

### 9.2 Middleware Chain Position

```
requireAuth → requireAdmin → requireAdminSession → requirePermission → handler
```

`requireAdminSession` is placed AFTER `requireAdmin` so that `req.user` is guaranteed to be populated. It is placed BEFORE `requirePermission` so that a revoked session is rejected before RBAC resolution (avoids a Redis/DB hit for RBAC on a revoked session).

### 9.3 Session Middleware Failure Modes

| Failure | Behavior | Impact |
|---|---|---|
| `isFeatureEnabled` throws | Falls back to ENV (false) → next() | Pass-through |
| Redis unavailable | Falls back to DB check | ~3-5ms extra per request |
| DB unavailable | Return 401 (fail-closed) | **Blocks request** — see note |
| `req.user.sid` absent | next() (legacy compat) | Pass-through |

**Note on DB unavailability:** When governance is enabled and the DB is unavailable, `requireAdminSession` returns 401 rather than next(). This is **fail-closed** behavior — the correct choice for a security middleware. If the system cannot verify session validity, it denies access. This is the opposite of `logAdminAction` which is fail-open (best-effort). The security/governance distinction justifies different failure semantics.

---

## 10. Device/Session Metadata Capture

### 10.1 Captured at Session Creation

| Field | Source | Storage |
|---|---|---|
| `ip_address` | `req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip` | `admin_sessions.ip_address` |
| `user_agent` | `req.headers['user-agent']` (truncated 512) | `admin_sessions.user_agent` |
| `device_hint` | Parsed from user_agent (see §10.2) | `admin_sessions.device_hint` |

### 10.2 `device_hint` Extraction

`device_hint` is a best-effort, informational-only string derived from `user_agent`:

```
user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
device_hint: "Chrome 124 on Windows"
```

Extraction rules (simple, no library dependency):
- Browser: match `/Chrome\/(\d+)/`, `/Firefox\/(\d+)/`, `/Safari\/(\d+)/`, `/Edge\/(\d+)/`
- OS: match `/Windows NT/`, `/Mac OS X/`, `/Linux/`, `/Android/`, `/iPhone OS/`
- Constructed as: `"{browser} {major} on {os}"` — max 255 chars, truncated if longer

If no match: `device_hint = null`. This is a visual hint for the session list UI (future slice), never used for security decisions.

### 10.3 Trust Proxy Prerequisite

Same as Slice 4 (C3): `app.set('trust proxy', 1)` must be set in `server.js` for `req.ip` to return the real client IP. Session IP capture degrades to `null` (not `127.0.0.1`) if neither source yields a real IP.

---

## 11. Redis/Session Interaction

### 11.1 Key Namespace

```
admin:session:revoked:{sid}     → "1" (TTL = remaining JWT lifetime seconds)
```

This namespace is distinct from existing admin keys:
- `admin:ff:*` — feature flags (Slice 2)
- `admin:rbac:*` — RBAC permission cache (Slice 3)
- `admin:session:*` — **new (Slice 5)**

### 11.2 Redis Write: Session Revocation

Written when a session is revoked (self-logout, forced, or security event):
```javascript
// TTL is capped at the JWT access token lifetime, not the session lifetime.
// Rationale: the blocklist entry only needs to persist until all JWTs bearing
// this sid have expired. The JWT exp is always <= session expires_at.
// Using session expires_at (30d) wastes Redis memory when the JWT TTL is 4h–7d.
const JWT_ACCESS_TTL_MS = parseDurationMs(
  process.env.AUTH_ADMIN_ACCESS_EXPIRES || process.env.AUTH_ACCESS_EXPIRES || "7d"
);
const sessionRemainingMs  = Math.max(0, session.expires_at.getTime() - Date.now());
const remainingTtlMs      = Math.min(sessionRemainingMs, JWT_ACCESS_TTL_MS);
if (remainingTtlMs > 0) {
  setRaw(`admin:session:revoked:${sid}`, "1", remainingTtlMs);
}
```

`setRaw` from `redisCache.service.js` accepts TTL in milliseconds. If Redis is unavailable, `setRaw` silently fails (the existing service pattern) — the DB revocation record is still written and remains the source of truth.

**TTL accounting:** For a 30d session with a 7d JWT, the blocklist TTL is 7d (JWT lifetime cap). For a 30d session with a 4h JWT, TTL is 4h. This bounds Redis memory to at most one JWT-lifetime per revoked session, regardless of session duration.

### 11.3 Redis Read: Session Validation

```javascript
const revoked = await getRaw(`admin:session:revoked:${sid}`);
if (revoked === "1") return 401;
// null → proceed to DB check (cache miss)
```

### 11.4 No Session Cache Warming

Unlike RBAC (which caches permission sets), sessions are validated per-request without caching the "valid" state. The blocklist pattern only caches the negative result (revoked). Caching valid sessions would require invalidating the cache on revocation — more complexity for marginal gain given the low request frequency of admin APIs.

### 11.5 Redis Failure Behavior Summary

| Operation | Redis unavailable | Fallback |
|---|---|---|
| Session revocation (write) | Silent miss — `setRaw` absorbs | DB revocation written (source of truth) |
| Session validation (read) | `getRaw` returns null | Falls through to DB lookup |
| DB unavailable + Redis unavailable (governance on) | Both fail | `requireAdminSession` returns 401 (fail-closed) |

---

## 12. Feature Flag Integration

### 12.1 New Flag: `ADMIN_SESSION_GOVERNANCE_ENABLED`

| Layer | Value | Notes |
|---|---|---|
| DB (`admin_feature_flags`) | `is_enabled = 0` | Seeded in `057_admin_sessions.sql` |
| ENV (`backend/.env`) | `ADMIN_SESSION_GOVERNANCE_ENABLED=false` | Additive line |
| `adminPlatformConfig` | `sessionGovernanceEnabled: false` | New key in config |
| `FLAG_KEY_MAP` | `ADMIN_SESSION_GOVERNANCE_ENABLED → sessionGovernanceEnabled` | Additive entry |
| `ALL_FLAG_KEYS` | Array extended with new key | Additive entry |

### 12.2 Affected Code Paths

`ADMIN_SESSION_GOVERNANCE_ENABLED` is checked at:
1. **Session creation in `loginAdmin`** — determines whether to issue refresh token and include `sid` in JWT
2. **`requireAdminSession` middleware** — determines whether to perform session lookup

### 12.3 `adminPlatform.config.js` Additive Changes

The config file adds:
```javascript
get sessionGovernanceEnabled() {
  return process.env.ADMIN_SESSION_GOVERNANCE_ENABLED === "true";
},
```
And extends `FLAG_KEY_MAP` and `ALL_FLAG_KEYS`. These are purely additive changes — no existing entries modified.

---

## 13. Audit Integration

### 13.1 Actions Logged in Slice 5

All `logAdminAction` calls are best-effort (never block auth operations):

| Action | Trigger | `target_type` | `before` | `after` |
|---|---|---|---|---|
| `session.created` | Successful admin login | `admin_sessions` | `null` | `{ session_id, admin_id, ip, device_hint, expires_at }` |
| `session.logout` | `POST /api/auth/admin-logout` | `admin_sessions` | `{ session_id, created_at, ip }` | `null` |
| `session.refresh` | `POST /api/auth/admin-refresh` | `admin_sessions` | `{ old_session_id }` | `{ new_session_id, expires_at }` |
| `session.suspicious_refresh_reuse` | Revoked refresh token presented | `admin_sessions` | `{ session_id, admin_id }` | `null` |

### 13.2 Audit Log Integration Points

**`logAdminAction` is called from the controller layer, not the service layer.**

`adminAuth.service.js` is a business-logic layer with no access to the Express `req` object. `logAdminAction` requires `req` to capture `req.ip`, `req.headers['user-agent']`, and `req.adminPermissionChecked`. Calling it from the service would require constructing a synthetic `req`-like object — an anti-pattern.

The correct integration is in `adminAuth.controller.js`:

```javascript
// adminAuth.controller.js — adminLogin handler (additive Slice 5 change)
export async function adminLogin(req, res) {
  try {
    const result = await adminAuthService.loginAdmin({ email, password, req });
    if (!result.ok) return res.status(result.status).json(...);

    // Slice 5: audit log called here — controller owns req
    logAdminAction({
      adminId:    result.admin.id,
      action:     "session.created",
      targetType: "admin_sessions",
      targetId:   result.sessionId ?? null,
      before:     null,
      after:      { session_id: result.sessionId, admin_id: result.admin.id,
                    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip,
                    device_hint: result.deviceHint ?? null,
                    expires_at: result.sessionExpiresAt ?? null },
      req,
    }).catch(() => {});   // best-effort — never blocks login response

    res.json({ token: result.token, admin: result.admin,
               ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}) });
  } catch (err) { ... }
}
```

The same controller-owns-audit pattern applies to:
- `adminRefresh` handler → logs `session.refresh`
- `adminLogout` handler → logs `session.logout`
- `adminRefresh` on reuse detection → logs `session.suspicious_refresh_reuse`

`permission_checked` is `null` for all session events (session actions do not go through `requirePermission`).

### 13.3 `logAdminAction` Availability

`logAdminAction` is exported from the barrel `admin/index.js`. The `adminAuth.controller.js` imports it:
```javascript
import { logAdminAction } from "../../modules/admin/index.js";
```

Path from `backend/domains/auth/controllers/` to `backend/modules/admin/`:
- `../..` = `backend/`
- `modules/admin/index.js`

**Circular import check:** `adminAuth.controller.js` → `admin/index.js` → `auditLog.service.js` → `featureFlag.service.js` → `pool`. None of these import from `adminAuth.controller.js` or the auth domain. No circular dependency.

---

## 14. Hidden Deployment Strategy

### 14.1 Three-State Deployment Model

| State | Session records | Refresh tokens | Validation | Forced logout |
|---|---|---|---|---|
| Deployed, flag disabled (default) | Created on login (always) | NOT issued | Disabled (pass-through) | Not possible |
| Deployed, flag enabled for testing | Created on login | Issued | Enabled | Works |
| Deployed, flag enabled (production) | Created on login | Issued | Enforced | Works |

**Session records are always created on login regardless of flag state.** This is intentional: the table accumulates data from day 1 of deploy, so activating governance reveals existing sessions rather than starting a cold log.

### 14.2 Hidden Deployment Guarantees (Flag Disabled)

- Admin login response shape: identical to current (`{ token, admin }`)
- No `refreshToken` in response
- JWT payload: `{ id, role, email }` — original shape (no `sid`)
- `requireAdminSession` is a pass-through (no DB/Redis lookups)
- Session records created silently — no client-visible change
- Storefront, RFQ, seller flows: completely unaffected

### 14.3 Activation Sequence

```
1. Run migration: npm run migrate:admin:sessions
2. Deploy code (all additive changes)
3. PM2 restart
4. Verify: admin login still works (returns { token, admin })
5. Verify: admin_sessions has 1 row after login test (session record created)
6. Verify: Slice 3 RBAC routes still work
7. Verify: Slice 4 audit log unchanged
8. Enable flag: UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_SESSION_GOVERNANCE_ENABLED'
9. Wait 60s (Redis TTL flush) or invalidate flag cache
10. Verify: admin login now returns { token, refreshToken, admin }
11. Verify: JWT payload includes sid
12. Verify: POST /api/auth/admin-logout revokes session
13. Verify: Using old JWT after logout → requireAdminSession returns 401
```

---

## 15. Security Event Logging

### 15.1 Events That Trigger Security Logging

| Event | Condition | Action |
|---|---|---|
| Suspicious refresh reuse | Revoked refresh token presented | Log `session.suspicious_refresh_reuse` + return 401 |
| Session not found | `sid` in JWT but no matching DB record | Log `session.not_found` + return 401 |
| Expired session presented | `expires_at < NOW()` on DB lookup | Return 401 (no special log — expected expiry) |
| Revoked session presented | DB confirms revoked | Log `session.revoked_access_attempt` (best-effort) + return 401 |

### 15.2 Security Event Log Entry Shape

```javascript
logAdminAction({
  adminId:    req.user.id,
  action:     "session.suspicious_refresh_reuse",
  targetType: "admin_sessions",
  targetId:   null,  // token hash not logged — security
  before:     null,
  after:      null,
  req,        // captures ip, user_agent for forensics
});
```

Sensitive fields (token hashes) are NEVER included in audit snapshots.

---

## 16. Multi-Device Semantics

### 16.1 One Session Per Login

Each `POST /api/auth/admin-login` creates exactly one `admin_sessions` row. An admin logging in from two different browsers/devices has two active session rows with different `session_token_hash` and `id` values.

### 16.2 Independent Session Lifecycle

Sessions are independent:
- Logging out from Browser A (`session_id = 5`) does NOT affect Browser B's session (`session_id = 6`)
- Forced logout of ALL sessions (future slice: `revokeAllSessionsForAdmin`) revokes all rows for the admin

### 16.3 No Active Session Limit (Slice 5)

Slice 5 does not enforce a maximum concurrent session count. This is deferred to a future policy slice. Operational teams can observe the session table to audit concurrent sessions.

### 16.4 Session List (Future Slice)

A `GET /api/admin/sessions/admins/:adminId` endpoint (future slice) will list active sessions for an admin. The `idx_as_admin_active` index (`admin_id, revoked_at, expires_at`) is designed for this query.

---

## 17. Expiration Strategy

### 17.1 Session Lifetime

```
Initial session: expires_at = created_at + AUTH_ADMIN_REFRESH_EXPIRES (default: 30d)
After refresh:   expires_at = ORIGINAL session's expires_at (fixed — not reset)
```

Session is considered invalid when ANY of these is true:
1. `revoked_at IS NOT NULL`
2. `expires_at <= NOW()`

The `requireAdminSession` middleware checks both conditions.

**Fixed vs sliding expiration:** Slice 5 uses **fixed expiration**. On refresh token rotation (§6.1), the new session row inherits the original session's `expires_at` — it is NOT recalculated as `now + AUTH_ADMIN_REFRESH_EXPIRES`. This ensures:
- A 30-day session window is absolute from initial login
- An admin cannot maintain access indefinitely by refreshing every 25 days
- After 30 days, re-authentication is required regardless of activity

The `last_used_at` column records activity within the session window without extending it.

### 17.2 Access Token Lifetime

```
JWT exp = iat + AUTH_ADMIN_ACCESS_EXPIRES (default: "7d" — backward compat)
```

New env `AUTH_ADMIN_ACCESS_EXPIRES` allows admin-specific TTL. Falls back to `AUTH_ACCESS_EXPIRES`.

For strong session governance, operators should reduce `AUTH_ADMIN_ACCESS_EXPIRES` to `"4h"` or less. This is a day-2 operational tuning, not a deployment requirement.

### 17.3 Expired Session Cleanup (Future Slice)

Expired sessions accumulate indefinitely in Slice 5. A future maintenance job can DELETE rows where `expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY)` (a grace period after expiry). This is analogous to the Slice 4 audit log retention design.

At the expected scale (< 10 admin logins/day), the table reaches ~3,650 rows/year — well within single-table performance range.

---

## 18. PM2 Startup Safety

### 18.1 `adminSession.service.js` — No Startup Side Effects

- No DB connections at module load
- No Redis connections at module load
- No feature flag evaluations at module load
- No scheduled jobs

### 18.2 `adminSession.middleware.js` — No Startup Side Effects

The middleware factory returns a function. The function is not called during module load.

### 18.3 Import Chain (New Additions)

```
adminAuth.service.js
  → adminSession.service.js   [NEW]
      → redisCache.service.js [Slice 2, stable]
      → pool                  [stable]
      → crypto                [built-in]
      → adminPlatformConfig   [Slice 2, stable]
      → isFeatureEnabled      [Slice 2, stable]
      → logAdminAction        [Slice 4, stable]

adminSession.middleware.js
  → adminSession.service.js   [NEW]
  → isFeatureEnabled          [Slice 2, stable]
  → adminPlatformConfig       [Slice 2, stable]
```

No circular imports. All imports resolve to stable, deployed modules or Node built-ins.

### 18.4 Barrel Blast Radius

`admin/index.js` gains one new export: `requireAdminSession`. If `adminSession.middleware.js` has a startup error, the barrel fails — breaking `platformRouter` and `rbacRouter`. Pre-restart `node --check` + barrel import verification remain mandatory.

---

## 19. Migration Plan

### 19.1 Files

| File | Type | Notes |
|---|---|---|
| `057_admin_sessions.sql` | New | Table creation + flag seed |
| `057_admin_sessions.rollback.sql` | New | DROP TABLE + flag cleanup |

### 19.2 `057_admin_sessions.sql` Content Summary

1. `CREATE TABLE IF NOT EXISTS admin_sessions` (§3.1 schema)
2. `INSERT IGNORE INTO admin_feature_flags (flag_key, description, is_enabled) VALUES ('ADMIN_SESSION_GOVERNANCE_ENABLED', 'Admin session revocation and refresh governance', 0)` — seeds the flag idempotently
3. No other DML

### 19.3 Runner Whitelist Addition

`run-admin-migration.js` `ADMIN_MIGRATION_FILES` array gains one entry:
```javascript
const ADMIN_MIGRATION_FILES = [
  "051_schema_migrations.sql",
  "052_admin_accounts.sql",
  "053_admin_rbac.sql",
  "054_admin_audit_log.sql",
  "055_admin_feature_flags.sql",
  "056_admin_job_queue.sql",
  "057_admin_sessions.sql",   // ← NEW
];
```

This is the ONLY change to `run-admin-migration.js`. It is additive.

### 19.4 npm Scripts to Add

```json
"migrate:admin:sessions":     "node scripts/run-admin-migration.js --file 057_admin_sessions.sql",
"migrate:admin:sessions:dry": "node scripts/run-admin-migration.js --file 057_admin_sessions.sql --dry-run"
```

---

## 20. Module Structure

### 20.1 New Files in Slice 5 (4)

```
backend/migrations/057_admin_sessions.sql
backend/migrations/057_admin_sessions.rollback.sql
backend/modules/admin/core/adminSession/adminSession.service.js
backend/modules/admin/core/adminSession/adminSession.middleware.js
```

### 20.2 Modified Files in Slice 5 (8 — all additive)

```
backend/domains/auth/services/adminAuth.service.js
  ← add: session record creation on login (best-effort)
  ← add: signAdminSessionToken wrapper (with/without sid)
  ← add: admin refresh logic
  ← add: admin logout logic
  ← add: import logAdminAction (audit)
  ← PRESERVE: loginAdmin existing logic unchanged

backend/domains/auth/controllers/adminAuth.controller.js
  ← add: adminRefresh handler
  ← add: adminLogout handler
  ← PRESERVE: existing adminLogin, adminForgotPassword unchanged

backend/routes/auth.routes.js
  ← add: POST /admin-refresh route
  ← add: POST /admin-logout route
  ← PRESERVE: all existing routes unchanged

backend/modules/admin/config/adminPlatform.config.js
  ← add: sessionGovernanceEnabled getter
  ← add: ADMIN_SESSION_GOVERNANCE_ENABLED to FLAG_KEY_MAP
  ← add: ADMIN_SESSION_GOVERNANCE_ENABLED to ALL_FLAG_KEYS
  ← PRESERVE: all existing config entries unchanged

backend/modules/admin/index.js
  ← add: export { requireAdminSession } from adminSession.middleware.js
  ← PRESERVE: all Slice 2–4 exports unchanged

backend/scripts/run-admin-migration.js
  ← add: "057_admin_sessions.sql" to ADMIN_MIGRATION_FILES array (1 line)
  ← PRESERVE: all existing logic unchanged

backend/package.json
  ← add: migrate:admin:sessions and migrate:admin:sessions:dry scripts

backend/.env
  ← add: ADMIN_SESSION_GOVERNANCE_ENABLED=false
```

### 20.3 Explicitly Unchanged Files

```
backend/domains/auth/middlewares/auth.middleware.js    ← NEVER TOUCH
backend/domains/auth/services/token.service.js         ← NEVER TOUCH
backend/domains/auth/services/session.service.js       ← NEVER TOUCH (shop sessions)
backend/domains/auth/repositories/refreshToken.repository.js  ← NEVER TOUCH
backend/modules/admin/core/rbac/                       ← NEVER TOUCH
backend/modules/admin/core/featureFlags/               ← NEVER TOUCH
backend/modules/admin/core/auditLog/                   ← NEVER TOUCH
backend/routes/admin.routes.js                         ← NEVER TOUCH
backend/controllers/adminController.js                 ← NEVER TOUCH
backend/server.js                                      ← NEVER TOUCH
frontend/                                              ← NEVER TOUCH in Slice 5
```

---

## 21. Runtime Blast-Radius Analysis

### 21.1 Blast Radius: Session Record Creation Failure

`loginAdmin` creates a session record as best-effort. If `INSERT INTO admin_sessions` fails:
- `console.error` logged
- Login response is still returned normally
- Admin receives a valid JWT
- No session governance until next successful login (which will create a record)

**Impact:** Audit gap for that login event. No functional disruption.

### 21.2 Blast Radius: `requireAdminSession` Redis Failure

When governance is enabled and Redis is down:
- Session validation falls through to DB check (~3-5ms extra)
- Valid sessions pass through normally
- Revoked sessions are caught by DB (source of truth)

**Impact:** Slight performance degradation. No functional disruption.

### 21.3 Blast Radius: `requireAdminSession` DB + Redis Failure

When governance is enabled and BOTH are down:
- Middleware returns 401 (fail-closed)
- All admin API requests blocked until infrastructure recovers

**Mitigation:** Feature flag deactivation (`is_enabled = 0`) restores pass-through behavior. Takes effect within 60s (Redis cache TTL for feature flags). If Redis is also down, the ENV fallback (`sessionGovernanceEnabled = false`) allows the flag check in `requireAdminSession` to fall back to disabled. This means fail-closed only when governance is explicitly enabled AND the ENV also says `true`.

### 21.4 Blast Radius: `adminPlatform.config.js` Modification

The config file gains 3 additive entries. A syntax error breaks the barrel import chain — same blast radius as all previous slices. Pre-restart `node --check` mandatory.

### 21.5 Storefront / RFQ Impact

None. Session governance middleware is only applied to admin platform routes. Storefront, RFQ, and seller routes are completely unaffected.

---

## 22. Rollback Strategy

### 22.1 Feature Flag Deactivation (First Response)

```sql
UPDATE admin_feature_flags SET is_enabled = 0
WHERE flag_key = 'ADMIN_SESSION_GOVERNANCE_ENABLED';
-- Takes effect within 60s via Redis cache TTL
```

Immediately restores:
- Login response to original shape (no `refreshToken`)
- `requireAdminSession` to pass-through
- All admin API routes to pre-Slice 5 behavior

### 22.2 Code Rollback

```bash
git revert <slice5-commit-sha> --no-edit
node --check backend/modules/admin/index.js
node --check backend/domains/auth/services/adminAuth.service.js
pm2 restart api --update-env
```

Code rollback removes all additive changes. The `admin_sessions` table and its rows survive code rollback (no harm — unused table).

### 22.3 Migration Rollback (Destructive)

```sql
-- 057_admin_sessions.rollback.sql
DROP TABLE IF EXISTS admin_sessions;
DELETE FROM admin_feature_flags WHERE flag_key = 'ADMIN_SESSION_GOVERNANCE_ENABLED';
DELETE FROM schema_migrations WHERE filename = '057_admin_sessions.sql';
```

All session records permanently lost. Only execute if the table itself causes a production incident.

---

## 23. Operational Recovery Procedures

### 23.1 All Admins Locked Out (Governance Enabled, DB Down)

1. Disable governance flag via DB (if DB recovers) — takes effect within 60s
2. If DB is still down: set ENV `ADMIN_SESSION_GOVERNANCE_ENABLED=false` → PM2 restart
3. Admin APIs restore immediately after restart (ENV fallback kicks in)

### 23.2 Refresh Token Reuse Storm (Token Theft)

If suspicious refresh reuse is detected:
1. `revokeAllSessionsForAdmin(adminId)` — immediately blocks all sessions in Redis
2. Force admin password reset
3. Review audit log entries for `session.suspicious_refresh_reuse` to determine affected time range

### 23.3 Session Table Accidentally Dropped

```bash
npm run migrate:admin:sessions
# Recreates empty table; all session records permanently lost
# Governance still works but all existing sessions fail validation (logged as not_found)
# Admins must re-login
```

After table recreate with governance enabled, all existing JWTs with `sid` will fail `requireAdminSession` (session not found in DB). This forces all admins to re-login — acceptable as a recovery action.

---

## 24. Future MFA Compatibility

### 24.1 `metadata_json` Reserved Fields

The `metadata_json` column in `admin_sessions` is designed to hold MFA state in a future slice:

```json
{
  "mfa_verified":    true,
  "mfa_method":      "totp",
  "mfa_verified_at": "2026-05-27T02:00:00.000Z",
  "mfa_attempts":    0
}
```

### 24.2 MFA Integration Path

A future `requireMFA` middleware reads `req.adminSessionId` (set by `requireAdminSession`) and checks:
```sql
SELECT metadata_json->>'$.mfa_verified' FROM admin_sessions WHERE id = ?
```

If `mfa_verified = false` AND the route requires MFA: redirect to MFA challenge endpoint.

This requires no schema changes — the `metadata_json` column is already present. The `requireAdminSession` middleware already sets `req.adminSessionId` which the MFA middleware can consume.

### 24.3 Session Token as MFA Context Anchor

The session model anchors MFA to a specific session (not just an admin ID). This means MFA verification is per-device — once verified on Browser A, it does NOT automatically verify on Browser B. This is the correct security model.

---

## 25. Regression-Risk Analysis

### 25.1 Admin Login

**Current flow:** `POST /api/auth/admin-login` → `{ token, admin }`

**Post-Slice 5 (flag disabled):** Identical. The additive session INSERT is best-effort; failure doesn't change response shape.

**Post-Slice 5 (flag enabled):** `{ token, refreshToken, admin }`. Existing admin clients that ignore extra fields continue to work. The `token` field shape is unchanged (same JWT format, with optional `sid` added to payload).

**Regression risk:** LOW. Any client that strictly validates response shape and rejects unknown fields would break. In practice, admin clients are internal tools that don't enforce strict response schemas.

### 25.2 `requireAuth` / `requireAdmin`

Both are NEVER modified. Zero regression risk.

### 25.3 Existing Admin Routes (`/api/admin/shops`, `/api/admin/rfq`, etc.)

`requireAdminSession` is NOT added to existing admin routes. These routes continue using `requireAuth → requireAdmin` only. Session governance applies only to new admin platform routes (RBAC, audit) and future routes that explicitly include `requireAdminSession`.

### 25.4 RBAC Behavior

`requirePermission` chain is unchanged. Adding `requireAdminSession` to the chain (before `requirePermission`) is additive and only applies to routes where it is explicitly included.

### 25.5 Audit Log (Slice 4)

The Slice 4 audit log continues to work unchanged. Session governance adds NEW action types (`session.created`, `session.logout`, etc.) — no changes to existing RBAC audit entries.

---

## 26. Slice 5 Scope Constraints

### 26.1 In Scope

- `admin_sessions` table and migration
- `adminSession.service.js` (session CRUD, blocklist, revocation)
- `adminSession.middleware.js` (pass-through or validate, gated by flag)
- `adminAuth.service.js` additive changes (session recording, refresh, logout)
- New auth endpoints (admin-refresh, admin-logout)
- Feature flag `ADMIN_SESSION_GOVERNANCE_ENABLED`
- Audit log integration for session events
- `run-admin-migration.js` whitelist addition

### 26.2 Explicitly Out of Scope

- Admin session list endpoint (`GET /api/admin/sessions/...`) — future slice
- Forced logout of another admin — future slice (requires RBAC `sessions:manage`)
- Maximum concurrent session limit — future policy slice
- MFA enforcement — future slice
- Session cleanup/archival job — future slice
- `actor_type = 'superadmin'` in audit log — future slice
- Admin password change triggering session revocation — future slice
- Admin account lock triggering session revocation — future slice

---

## 27. Dangerous Coupling Analysis

### 27.1 New Coupling Introduced

| Coupling | Risk | Mitigation |
|---|---|---|
| `adminAuth.service.js` → `adminSession.service.js` | Login failure if service has syntax error | `node --check` before deploy |
| `adminAuth.service.js` → `admin/index.js` (for `logAdminAction`) | Import chain increases auth service deps | No circular risk; pre-deploy barrel verification |
| `requireAdminSession` → DB pool | Auth blocked if DB unavailable AND governance enabled | Feature flag deactivation via ENV fallback |
| `admin/index.js` → `adminSession.middleware.js` | Barrel blast radius includes new file | `node --check` + barrel import verification |
| `auth.routes.js` → new controller handlers | New routes break if handler import fails | `node --check` on controller file |

### 27.2 Dangerous File List

Files where a mistake causes a production incident:

| File | Risk | Why |
|---|---|---|
| `adminAuth.service.js` | CRITICAL | Login for ALL admins; any bug blocks admin login |
| `auth.routes.js` | HIGH | Server startup fails if route registration errors |
| `adminPlatform.config.js` | HIGH | Barrel chain breaks if syntax error |
| `adminSession.middleware.js` | MEDIUM | Session validation fail-closed when governance enabled |
| `adminSession.service.js` | MEDIUM | Session creation failure is best-effort (not critical) |
| `run-admin-migration.js` | LOW | One-character array addition |

---

## 28. Implementation Phases

### 28.1 Slice 5 Implementation Sequence

```
Phase A — Migration:
  1. Write 057_admin_sessions.sql
  2. Write 057_admin_sessions.rollback.sql
  3. Add 057 to run-admin-migration.js whitelist
  4. Add migrate:admin:sessions scripts to package.json
  5. Dry-run: npm run migrate:admin:sessions:dry
  6. Apply: npm run migrate:admin:sessions
  7. Validate table + flag seed

Phase B — Session Service + Middleware:
  8. Write adminSession.service.js
  9. Write adminSession.middleware.js
  10. node --check both files
  11. Modify admin/index.js (additive export: requireAdminSession)
  12. Barrel import verification

Phase C — Auth Domain Extension:
  13. Modify adminPlatform.config.js (additive: new flag key)
  14. Modify adminAuth.service.js (additive: session recording, refresh, logout)
  15. Modify adminAuth.controller.js (additive: new handlers)
  16. Modify auth.routes.js (additive: new routes)
  17. node --check all modified auth files

Phase D — PM2 Restart + Smoke Tests:
  18. pm2 restart api --update-env
  19. Verify admin login: POST /api/auth/admin-login → { token, admin } (unchanged shape)
  20. Verify admin_sessions: SELECT COUNT(*) → 1 row after test login
  21. Verify RBAC routes unaffected: GET /api/admin/rbac/roles → 200
  22. Verify Slice 4 audit unchanged: assignRole still logs to admin_audit_log

Phase E — Activation:
  23. Enable flag: UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_SESSION_GOVERNANCE_ENABLED'
  24. Wait 60s for Redis cache flush
  25. Verify: POST /api/auth/admin-login now returns { token, refreshToken, admin }
  26. Verify: JWT payload includes sid
  27. Verify: POST /api/auth/admin-refresh rotates tokens
  28. Verify: POST /api/auth/admin-logout revokes session
  29. Verify: Using JWT after logout → 401 on RBAC route (requireAdminSession fires)
  30. Verify: ip_address in session record is real client IP (not 127.0.0.1)
```

### 28.2 Pre-Implementation Review Required

Before implementation, a pre-implementation review should cover:
- `adminAuth.service.js` additive changes — no existing logic altered
- `loginAdmin` fallback path when session INSERT fails (best-effort confirmed)
- `requireAdminSession` fail-closed vs fail-open at each failure mode
- `auth.routes.js` route ordering (new routes do not shadow existing routes)
- `adminPlatform.config.js` extension — no key collisions with existing 10 flags
- Token hash storage — no plaintext ever reaches DB
- Redis key namespace collision check (`admin:session:*` vs existing namespaces)

---

*Document version: 1.0 — Design only. No implementation.*  
*Next step: Pre-implementation review, then implementation plan, then file specification, then final review.*
