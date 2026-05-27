# Phase 1A Slice 2 — Pre-Implementation Review

> **Document type:** Pre-implementation safety review  
> **Date:** 2026-05-26  
> **Scope:** Feature Flag Foundation — `phase-1a-slice2-design.md`  
> **Status:** REVIEW — sign-off required before implementation begins  
> **Source of truth:** `phase-1a-slice2-design.md`, all 5 audit docs, Slice 1 production state, live codebase

---

## Summary

| Severity | Count | Items |
|---|---|---|
| BLOCKER | 2 | B1, B2 |
| CORRECTION | 3 | C1, C2, C3 |
| RISK | 8 | R1–R8 |
| OBSERVATION | 8 | O1–O8 |

**No implementation may begin until blockers B1 and B2 are resolved and corrections C1–C3 are accepted or explicitly deferred.**

---

## Table of Contents

1. [Blockers](#1-blockers)
2. [Corrections Required](#2-corrections-required)
3. [Risks](#3-risks)
4. [Observations](#4-observations)
5. [Production Safety Verdict](#5-production-safety-verdict)
6. [Verification Checklist](#6-verification-checklist)

---

## 1. Blockers

### B1 — `/features` route registration order is unspecified, creating a gating hazard

**Category:** Admin route leakage / feature flag precedence correctness  
**Design location:** §6.2

The design states: *"The `/features` endpoint is the only route in Slice 2 that is never gated by `ADMIN_PLATFORM_ENABLED`."*

The design **does not specify** the order in which `platform.admin.routes.js` registers `/features` relative to any startup-time platform-enabled gate. If an implementer follows the natural pattern from the RFQ module:

```js
// Danger: natural but INCORRECT for /features
if (!adminPlatformConfig.platformEnabled) {
  router.use("*", (req, res) => res.status(404).json({ error: "not found" }));
  return; // <-- this return prevents /features from ever being registered
}
router.get("/features", requireAuth, requireAdmin, getFeatures); // never reached
```

The result: `/features` silently returns 404 even with a valid admin JWT. The frontend cannot distinguish "platform disabled" from "platform not deployed." The design's stated exception becomes void.

**Required fix before implementation:**  
The design document must explicitly state the required route registration order:

```
1. Register /features UNCONDITIONALLY (no platform-enabled gate)
2. THEN: if !platformEnabled → register catch-all 404 for all OTHER routes
```

Equivalently, the gate on future routes must be additive AFTER `/features` is registered, not a blanket early return.

---

### B2 — Export contract between `admin/index.js` and implementation files is unspecified

**Category:** Startup failure risks / runtime coupling  
**Design location:** §8.4 (Import Dependency Map)

The barrel `admin/index.js` design uses:

```js
export { default as platformRouter } from "./platform/routes/platform.admin.routes.js";
```

This `{ default as ... }` re-export syntax requires `platform.admin.routes.js` to use `export default router`. If the implementer uses a named export instead:

```js
export const router = express.Router(); // named export — WRONG
export default router;                  // default export — CORRECT
```

A named-only export silently sets `platformRouter` to `undefined` in the barrel. `server.js` then calls `app.use('/api/admin/platform', undefined)`, which causes Express to throw at startup, taking down the entire backend.

**Confirmed codebase pattern:** All existing route files use `export default router` (verified: `rfq.public.routes.js`, `rfq.admin.routes.js`). The design document must explicitly require this pattern for all new route files in `modules/admin/`.

**Required fix before implementation:**  
Add to the design's file inventory: *"All route files in `modules/admin/` must use `export default router`."* Controller files and service files must use named exports. The barrel file's re-export syntax must be tested against the actual export form before deployment.

---

## 2. Corrections Required

### C1 — ENV fallback values must NOT be written to Redis cache

**Category:** Feature flag precedence correctness / stale cache operational hazards  
**Design location:** §2.1, §2.2

The design §2.1 states: *"ENV values are also written to the Redis cache."*

This creates a correctness hazard in the following sequence (Slice 3+ operations):

1. Flag `ADMIN_RBAC_ENABLED` has no DB row (operator deleted it to "reset").
2. ENV has `ADMIN_RBAC_ENABLED=false`.
3. `isFeatureEnabled('ADMIN_RBAC_ENABLED')` is called → DB miss → ENV fallback → `false` written to Redis with 60s TTL.
4. Operator inserts a DB row with `is_enabled = 1`.
5. Next call within 60s window → Redis hit → returns **`false`** (stale ENV value) even though DB now has `is_enabled = 1`.

The stale window is 60 seconds. For a DB-first control plane, this violates the precedence model: the DB row that was just inserted should be authoritative, but the cached ENV fallback masks it.

**Correct behavior:** Only DB-sourced values should populate Redis. ENV fallback should return the value directly without writing to cache. The in-memory LRU (already handled by `setRaw` falling through to memory when Redis writes are slow) is acceptable for development environments without Redis; it is not a second cache layer that needs ENV values.

**Required change:**  
Update §2.1 and §3 to read: *"Only DB-resolved values are written to the Redis cache. ENV fallback values are returned directly without cache population."*

---

### C2 — `invalidateFlagCache(null)` uses an overly broad prefix

**Category:** Cache invalidation correctness  
**Design location:** §5.2

The design states: `invalidateFlagCache(null)` calls `invalidateByLogicalPrefix('admin:ff:')`.

The Redis SCAN pattern becomes: `{PREFIX}dv{VERSION}:admin:ff:*`

This invalidates any key that begins with `admin:ff:` — including hypothetical future keys like `admin:ff_config:X` or `admin:ff_history:X`. Any future service that naively namespaces under `admin:ff` would be silently wiped during a bulk flag invalidation.

The correct scope for bulk invalidation is exactly the 10 known flag keys, no more.

**Options (choose one):**
- Use the more specific prefix `admin:ff:ADMIN_` (all 10 seeded keys follow this exact pattern)
- OR iterate `ALL_FLAG_KEYS` and call `invalidateByLogicalPrefix('admin:ff:' + key)` per key

**Required change:**  
Update §5.2 to specify `invalidateByLogicalPrefix('admin:ff:ADMIN_')` for bulk invalidation, with a comment explaining that `ADMIN_` prefix scoping is intentional.

---

### C3 — `getAllFlagStates` cache warming loop is specified in §4.5 but absent from the service spec

**Category:** Cache consistency  
**Design location:** §4.5, §8.1

Section §4.5 states: *"First call to `getAllFlagStates()` after a cache miss: 1 DB query + 10 Redis writes."* This cache warming behavior — writing each individual flag key to Redis after a bulk DB read — is a critical design feature that prevents redundant per-flag DB queries after `getAllFlagStates` has already fetched all 10 rows.

However, the service function specification in §8.1 does not list this as part of `getAllFlagStates`'s defined behavior. It is described only in the cache TTL section. This creates a risk that an implementer writes `getAllFlagStates` without the warming loop, breaking the cache warming guarantee.

**Required change:**  
Add to the `getAllFlagStates` function specification in §8.1: *"After fetching all rows from the DB, the function writes each flag's resolved value (DB or ENV fallback per C1 above: only DB values) to Redis individually with a 60,000ms TTL. This warms the per-key cache so subsequent `isFeatureEnabled(key)` calls return Redis hits."*

---

## 3. Risks

### R1 — Startup failure blast radius is higher than for RFQ module

**Category:** Startup failure risks / blast radius  
**Design location:** §9.3

The design correctly notes: *"If `backend/modules/admin/index.js` throws an error during import, the entire `server.js` fails to start."*

What the design does not emphasize: the blast radius of an admin module startup failure is **total**. Unlike `mountRfqRoutes(app)` (a runtime function that does nothing when disabled), the new admin module is a static ESM import at the top of `server.js`. A syntax error, missing file, or bad import in any of the 7 files in the admin module chain would take down:

- All storefront SSR APIs
- All RFQ dispatch endpoints
- All seller dashboard APIs
- All existing admin routes

The `node --check server.js` gate in §11.1 Stage 4 is essential and **must not be skipped or deferred**. It must be run on the production machine after code deployment and before PM2 restart.

**Additional mitigation not in the design:** `node -e "import('./modules/admin/index.js').then(() => console.log('OK'))"` can validate the module in isolation before touching `server.js`.

---

### R2 — `app.use('/api/admin', adminRoutes)` receives `/api/admin/platform` requests first

**Category:** Existing admin route collisions  
**Design location:** §6.3

Confirmed from `server.js` line 166: `app.use("/api/admin", adminRoutes)`.

In Express, `app.use('/api/admin', adminRoutes)` prefix-matches `/api/admin/platform/features`. The stripped path `/platform/features` is passed to `adminRoutes`. Since `adminRoutes` defines only `/shops`, `/admin-login`, `/admin-forgot-password`, `/shops/:id/status`, `/shops/:id` — no wildcard, no catch-all — Express calls `next()` automatically and the request falls through to the subsequent mount.

This works correctly BUT introduces a constraint: **the new `app.use('/api/admin/platform', platformRouter)` mount must appear AFTER `app.use('/api/admin', adminRoutes)` in `server.js`.** The design specifies appending after `mountRfqRoutes(app)` (line 211), which is already after line 166. Correct.

**The risk:** An implementer who inserts the new mount before line 166 will observe correct behavior in testing (the route still works), but the insertion point violates the designed ordering contract and could cause issues if `adminRoutes` ever gains a catch-all in the future.

---

### R3 — `redisDisabled` state is process-global and shared with storefront caching

**Category:** Redis failure safety / runtime coupling  
**Design location:** §3.2

`redisCache.service.js` maintains `redisDisabled` as a module-level boolean. Once set to `true` (by any Redis error from any caller), **all** Redis operations in the process are disabled for its lifetime — including product caches, category caches, and feature flags.

Under high storefront load, a Redis error triggered by a product caching operation (e.g., large payload write timeout) would set `redisDisabled = true`. Feature flag reads would then fall through to in-memory LRU + DB for the remainder of the process lifetime, requiring a PM2 restart to re-enable Redis for feature flags.

This is safe (correct behavior, low DB load for 10 flag keys), but the operational implication should be understood: **a Redis failure in storefront caching can silently degrade feature flag caching without any admin-specific log message.** The only observable symptom is increased DB query frequency for feature flag reads, which is negligible.

---

### R4 — `FLAG_KEY_MAP` camelCase keys must exactly match frontend `DEFAULT_FLAGS` object keys

**Category:** Frontend/backend divergence risks  
**Design location:** §8.1

The backend `getAllFlagStates()` returns an object with camelCase keys derived from `FLAG_KEY_MAP` (e.g., `'ADMIN_RBAC_ENABLED' → 'rbacEnabled'`). The frontend `AdminPlatformContext.js` initializes from a `DEFAULT_FLAGS` constant with matching camelCase keys.

Any key mismatch — even a minor one like `auditLogEnabled` vs `auditlogEnabled` — results in that flag being permanently `false` in the frontend with **no error thrown, no console warning, no TypeScript type error** (the code is JS, not TS). The symptom only appears as a feature that never activates, which could be mistaken for a DB or Redis issue.

**Required action at implementation review:** The `FLAG_KEY_MAP` mapping and the `DEFAULT_FLAGS` object must be reviewed side-by-side and verified to be identical before deployment.

---

### R5 — `pool.query` IN() syntax requires the double-nested array form

**Category:** DB fallback correctness  
**Design location:** §10 (edge cases)

mysql2 v3 (confirmed: v3.20.0 in production) handles IN() expansion via double-nested array:

```js
// CORRECT: mysql2 expands inner array → WHERE flag_key IN ('val1', 'val2', ...)
const [rows] = await pool.query('SELECT ... WHERE flag_key IN (?)', [ALL_FLAG_KEYS]);
```

```js
// INCORRECT: spread → 10 separate params for a single ?, causes ER_WRONG_NUMBER_OF_PARAMETERS
const [rows] = await pool.query('SELECT ... WHERE flag_key IN (?)', ...ALL_FLAG_KEYS);
```

The design §2 and §8 describe this query without specifying the exact parameter binding form. This must be verified explicitly during implementation. An incorrect binding causes `getAllFlagStates` to throw on every call, triggering the DB-unavailable fallback (all-false result) with no obvious connection to the query syntax error.

---

### R6 — Missing `created_at` column in `admin_feature_flags`

**Category:** Dangerous operational assumptions  
**Design location:** §7.1

The `admin_feature_flags` table includes `updated_at` with `ON UPDATE CURRENT_TIMESTAMP(3)` but no `created_at` column. Once a flag row is first toggled, `updated_at` reflects the toggle timestamp, permanently losing the original seeding timestamp.

This is a minor design gap in Slice 2 (all flags are `false` and untouched). It becomes operational debt in Slice 3+ when audit questions arise: *"When was `ADMIN_BILLING_ENABLED` first added to the system?"* The answer cannot be recovered from the table alone; `schema_migrations.applied_at` provides the migration time but not the row-level seed time.

Adding the column later requires `ALTER TABLE admin_feature_flags ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER is_enabled;` — a DDL operation with a brief metadata lock.

**Recommendation:** Add `created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)` to the migration now, before the table is deployed. Cost is zero; retroactive addition requires a future migration.

---

### R7 — `setRaw` TTL unit verification must be explicit in implementation review

**Category:** Stale cache operational hazards  
**Design location:** §3.5

The design correctly documents the TTL unit discrepancy: `setRaw(key, value, ttlMs)` accepts milliseconds and internally converts: `ttlSec = Math.max(1, Math.ceil(ttlMs / 1000))`.

The design specifies using `60_000` (60 seconds × 1000). If an implementer writes `setRaw(key, value, 60)`, the minimum enforcement (`Math.max(1, Math.ceil(60 / 1000))` = `Math.max(1, 1)` = `1`) produces a **1-second TTL** rather than 60 seconds.

At a 1-second TTL, every admin request to `/features` hits the DB directly. At low admin traffic, this is safe but unintentional and difficult to detect without Redis monitoring.

**Required action:** The implementation review checklist must include: *"Verify all `setRaw` calls in `featureFlag.service.js` use `60_000` (not `60`)."*

---

### R8 — Frontend `AdminPlatformProvider` with `'use client'` in Next.js 15 App Router

**Category:** Frontend/backend divergence risks  
**Design location:** §8.1

`AdminPlatformContext.js` will be marked `'use client'` (required for React context). In Next.js 15 App Router, a `'use client'` boundary means the component tree rooted at the provider runs only on the client. If `AdminPlatformProvider` is ever wrapped around a Server Component, Next.js will produce a build error.

In Slice 2, the provider is unmounted everywhere — this risk is latent. For Slice 3+ when the provider is mounted in an admin layout, the pattern must be:

```
Server Component layout (async, fetches initialFlags from /features)
  └── AdminPlatformProvider initialFlags={flags}  ('use client')
        └── Admin page content
```

The design correctly specifies the `initialFlags` prop pattern (§9.1). No action required for Slice 2.

---

## 4. Observations

### O1 — `redisDisabled` has no automatic reconnect

The design documents this correctly (§3.2, §3.5). Once `redisDisabled = true`, only a PM2 restart re-enables Redis. Operationally, if Redis recovers after a transient failure, feature flags (and all caching) remain DB/memory-only until the next restart. No operational surprise — aligned with existing product caching behavior.

### O2 — No global 404 handler in server.js

Confirmed: `server.js` has no catch-all `app.use('*', 404handler)` before `app.listen`. Requests to unregistered paths fall through to Express's built-in handler. The new mount at `/api/admin/platform` will be properly reachable without interference.

### O3 — `requireAdmin` correctly checks `req.user.role === 'admin'`

Confirmed from `auth.middleware.js` line 20: `if (!req.user || req.user.role !== "admin")`. Admin JWTs carry `role: 'admin'` in their payload (same as all existing admin routes). No new auth logic required.

### O4 — `invalidateByLogicalPrefix` correctly covers both Redis and in-memory LRU

Confirmed from source: the function SCANs Redis with a key pattern AND iterates `memoryStore`/`memoryLru` with `startsWith`. A call to `invalidateFlagCache('ADMIN_RBAC_ENABLED')` removes the entry from both caching layers simultaneously. (Subject to C2: the prefix must be scoped correctly.)

### O5 — No route collision between `/api/admin` and `/api/admin/platform`

Confirmed: `admin.routes.js` defines only `/shops`, `/admin-login`, `/admin-forgot-password`, `/shops/:id/status`, `/shops/:id`. None match or intercept `/platform/features`. Express falls through correctly (see R2).

### O6 — `pool.query` pool defaults are appropriate for admin traffic

`config/db.js` uses mysql2 pool defaults: `connectionLimit=10`, `waitForConnections=true`, `queueLimit=0`. For a read-only admin endpoint with minimal concurrent traffic, these are appropriate. No configuration change required.

### O7 — Rollback SQL for 055 correctly follows Slice 1 pattern

`055_admin_feature_flags.rollback.sql` uses `DROP TABLE IF EXISTS admin_feature_flags` and documents the manual `DELETE FROM schema_migrations` as a commented instruction — consistent with `051_schema_migrations.rollback.sql`. The `schema_migrations` cleanup is not auto-executed to preserve the audit trail for deliberate rollbacks. Acceptable pattern.

### O8 — `ALL_FLAG_KEYS` hardcoded array prevents empty-array IN() query

mysql2 produces invalid SQL for `WHERE flag_key IN ()` (empty IN set). Since `ALL_FLAG_KEYS` is derived from the hardcoded `FLAG_KEY_MAP` (10 entries), this cannot be empty at runtime. The guard is implicit but effective. An explicit `if (ALL_FLAG_KEYS.length === 0) return {}` guard in `getAllFlagStates` would make the protection explicit but is not required for Slice 2.

---

## 5. Production Safety Verdict

### What is safe to proceed with as-is

- Migration 055 schema and seed data (§7) — correct, additive, no FK dependencies, idempotent
- Redis key isolation (`admin:ff:` namespace) — fully isolated from existing caches
- Auth middleware chain — reuses existing `requireAuth` + `requireAdmin`, no new logic
- Frontend scaffold — unmounted, tree-shaken, zero production impact in Slice 2
- `.env` additions — appending `ADMIN_*=false` lines, no existing var overwritten
- Rollback path (§12) — clean, zero-trace rollback confirmed

### What requires resolution before implementation

| Item | Blocking action |
|---|---|
| B1: `/features` gate ordering | Update design §6.2 with explicit route registration order requirement |
| B2: `export default` contract | Update design §8.1 with explicit export pattern requirement for all route files |
| C1: ENV fallback caching | Update design §2.1 and §3 to exclude ENV values from Redis writes |
| C2: Bulk invalidation prefix | Update design §5.2 to use `admin:ff:ADMIN_` prefix |
| C3: Cache warming in service spec | Update design §8.1 `getAllFlagStates` spec to include warming loop |

### What is flagged for implementation-time verification

| Item | Verification action |
|---|---|
| R4: camelCase key parity | Review FLAG_KEY_MAP and DEFAULT_FLAGS side-by-side |
| R5: mysql2 IN() syntax | Verify `[ALL_FLAG_KEYS]` double-nesting in featureFlag.service.js |
| R7: setRaw TTL unit | Verify `60_000` (not `60`) in all setRaw calls |
| R6: missing created_at | Decide before migration is written: add now or defer |

---

## 6. Verification Checklist

Use this checklist during implementation review, before PM2 restart:

### Pre-deploy
- [ ] `node --check backend/server.js` exits 0 after adding new import
- [ ] `node -e "import('./modules/admin/index.js').then(m => { if (!m.platformRouter) throw new Error('platformRouter undefined'); console.log('OK'); })"` exits 0
- [ ] `FLAG_KEY_MAP` keys and `DEFAULT_FLAGS` keys reviewed side-by-side — no mismatches
- [ ] All `setRaw` calls in `featureFlag.service.js` use `60_000` TTL, not `60`
- [ ] `platform.admin.routes.js` registers `/features` BEFORE any platform-enabled gate
- [ ] All route files in `modules/admin/` use `export default router`
- [ ] ENV fallback in `featureFlag.service.js` does NOT call `setRaw`
- [ ] Bulk invalidation in `invalidateFlagCache(null)` uses prefix `admin:ff:ADMIN_` (not `admin:ff:`)

### Post-migration
- [ ] `SELECT flag_key, is_enabled FROM admin_feature_flags ORDER BY flag_key;` returns 10 rows, all `is_enabled = 0`
- [ ] `SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at;` returns exactly 2 rows

### Post-deploy
- [ ] `curl -o /dev/null -w "%{http_code}" https://otofine.com/api/admin/platform/features` returns `401`
- [ ] Authenticated request returns `{"platformEnabled":false,"rbacEnabled":false,...}` — all 10 flags false
- [ ] `GET /api/admin/shops` returns `200` (existing route unaffected)
- [ ] `POST /api/auth/admin-login` returns `200`
- [ ] Storefront page load returns `200`
- [ ] RFQ endpoint returns `200`
