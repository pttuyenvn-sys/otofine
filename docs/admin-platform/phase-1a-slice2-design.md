# Phase 1A Slice 2 — Feature Flag Foundation: Architecture & Design Review

> **Document type:** Architecture and design review — no implementation yet  
> **Date:** 2026-05-26  
> **Scope:** Feature flags table, flag resolution service, read-only features API, minimal frontend context scaffold  
> **Status:** DESIGN PATCHED — review findings applied (B1, B2, C1, C2, C3, R1, R4, R5, R6, R7) — ready for implementation sign-off  
> **Source of truth:** All 5 audit docs + `admin-platform-architecture.md` + `admin-foundation-implementation-plan.md` + `phase-1-execution-runbook.md` + `phase-1a-slice2-review.md`

---

## Table of Contents

1. [Overview and Scope Boundaries](#1-overview-and-scope-boundaries)
2. [Feature Flag Precedence Rules](#2-feature-flag-precedence-rules)
3. [Redis Fallback Behavior Analysis](#3-redis-fallback-behavior-analysis)
4. [Cache TTL Strategy and Stale Cache Hazards](#4-cache-ttl-strategy-and-stale-cache-hazards)
5. [Cache Invalidation Strategy](#5-cache-invalidation-strategy)
6. [Admin Route Gating Strategy](#6-admin-route-gating-strategy)
7. [Database Design](#7-database-design)
8. [File Inventory](#8-file-inventory)
9. [Production Safety Analysis](#9-production-safety-analysis)
10. [Edge Case Analysis](#10-edge-case-analysis)
11. [Rollout Strategy](#11-rollout-strategy)
12. [Rollback Strategy](#12-rollback-strategy)

---

## 1. Overview and Scope Boundaries

### 1.1 What Slice 2 Provides

Slice 2 delivers the infrastructure for runtime feature flag evaluation. When Slice 2 is deployed:

- A `admin_feature_flags` table exists in MySQL with 10 rows, all `is_enabled = 0`
- A flag resolution service can answer `isFeatureEnabled("ADMIN_RBAC_ENABLED")` → `false`
- A read-only `GET /api/admin/platform/features` endpoint returns all 10 flag states as JSON
- A React context scaffold exists in the frontend for future admin layout usage
- **All 10 flags are false. No admin platform feature activates.**

### 1.2 What Slice 2 Does NOT Activate

| Feature | Flag | Activates in |
|---|---|---|
| RBAC management | `ADMIN_RBAC_ENABLED` | Slice 3 |
| Audit logging | `ADMIN_AUDIT_LOG_ENABLED` | Slice 4 |
| Shop/product moderation | `ADMIN_MODERATION_ENABLED` | Phase 2 |
| Billing | `ADMIN_BILLING_ENABLED` | Phase 5 |
| Analytics | `ADMIN_ANALYTICS_ENABLED` | Phase 4 |
| Risk engine | `ADMIN_RISK_ENGINE_ENABLED` | Phase 7 |
| Seller CRM | `ADMIN_SELLER_CRM_ENABLED` | Phase 6 |
| Payments | `ADMIN_PAYMENTS_ENABLED` | Phase 5+ |
| Subscription enforcement | `ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED` | Phase 5+ |

The master switch (`ADMIN_PLATFORM_ENABLED`) is also `false` in Slice 2. Its purpose is documented in §6 below.

### 1.3 Production Coupling Constraints

Slice 2 introduces zero coupling to:
- Storefront rendering pipeline
- Wildcard subdomain logic
- SEO metadata generation
- RFQ dispatch flows
- Seller dashboard
- Existing admin routes (`/api/admin/shops`, `/api/admin/part-knowledge`, `/api/admin/rfq`)

The only new live code path is `GET /api/admin/platform/features`, which requires a valid admin JWT and reads only the new `admin_feature_flags` table.

---

## 2. Feature Flag Precedence Rules

### 2.1 Evaluation Order

For any given `flagKey`, resolution proceeds through three layers in strict priority order:

```
Layer 1 (highest): Redis cache
Layer 2:           DB table admin_feature_flags
Layer 3:           ENV var (process startup value)
Layer 4 (default): false
```

**Layer 1 — Redis cache** is consulted first. If a cached value exists (either `'1'` or `'0'`), it is returned immediately without consulting the DB or ENV. The cache TTL controls how long Layer 1 is authoritative.

**Layer 2 — DB table** is consulted on a cache miss. If a row exists for the `flag_key`, its `is_enabled` value is used and the result is written back to the Redis cache with TTL. This means an operator can change a flag's state in the DB and it will take effect within one TTL window without a PM2 restart.

**Layer 3 — ENV var** is used when the DB has no row for the key. The `adminPlatformConfig` object is initialized once at process startup from `process.env`. ENV values require a PM2 restart to change. **ENV values are NOT written to the Redis cache or in-memory LRU store.** Only DB-resolved values are cached. If an ENV fallback value were cached and an operator later inserted a DB row with a different value, the DB change would be masked by the cached ENV value until TTL expiry, violating the DB-as-runtime-control-plane contract.

**Layer 4 — false** is the default when the flag key is unknown (not in the DB and not in `adminPlatformConfig`).

### 2.2 Precedence Interaction Table

| Scenario | DB row | ENV var | Result |
|---|---|---|---|
| Normal production (all false) | `is_enabled = 0` | `ADMIN_X=false` | `false` |
| DB-enabled, ENV-disabled | `is_enabled = 1` | `ADMIN_X=false` | `true` (DB wins) |
| DB-disabled, ENV-enabled | `is_enabled = 0` | `ADMIN_X=true` | `false` (DB wins) |
| No DB row, ENV-enabled | (none) | `ADMIN_X=true` | `true` |
| No DB row, no ENV | (none) | (absent) | `false` |
| DB row, Redis cached | Any | Any | Redis cached value |

**The DB always overrides ENV** when a row is present. This is the correct behavior: the DB is the runtime control plane, ENV is the fallback for initial state before the DB is populated.

### 2.3 Startup-Time vs Runtime Resolution

There are two distinct resolution mechanisms with different semantics:

| Mechanism | When evaluated | Change requires |
|---|---|---|
| `adminPlatformConfig` (frozen object) | Process startup | PM2 restart |
| `isFeatureEnabled(key)` (async function) | Per-call, with cache | TTL expiry (60s max) |
| `getAllFlagStates()` (async function) | Per-request | TTL expiry (60s max) |

**Route-level gating uses `adminPlatformConfig`** — routes for disabled modules are not registered at startup. This is an architectural choice to avoid per-request overhead. The trade-off: enabling a route-gated module requires a PM2 restart even if the DB row changes. Acceptable for Slice 2 since no gated routes exist yet in this slice.

**The `/features` endpoint uses `getAllFlagStates()`** — always reflects current DB state (within TTL), not startup ENV state. This is the canonical source of truth for the frontend.

### 2.4 Flag Key Naming Contract

All DB `flag_key` values follow the pattern `ADMIN_{MODULE}_ENABLED`. This matches ENV var names exactly. The `FLAG_KEY_MAP` in `adminPlatform.config.js` is the single source of truth for the `flag_key → camelCase property` mapping. Any new flag must be added to both the DB seed (migration) and `FLAG_KEY_MAP`.

---

## 3. Redis Fallback Behavior Analysis

### 3.1 Redis Availability Matrix

| Redis state | `getRaw` return | Action taken |
|---|---|---|
| Available, key present | `'1'` or `'0'` | Return cached value immediately |
| Available, key absent | `null` | Fall through to DB |
| Connection error | `null` (error caught internally) | Fall through to DB |
| Redis disabled (`redisDisabled = true`) | `null` | Fall through to DB |
| In-memory fallback hit | Value from LRU map | Return cached value |
| In-memory fallback miss | `null` | Fall through to DB |

### 3.2 How `redisCache.service.js` Handles Failure

The existing `redisCache.service.js` (used by product/category caching) implements the following failure model:

1. Redis client is initialized lazily — no crash at startup if Redis is unavailable
2. On any Redis operation error, `redisDisabled = true` is set and the client disconnects
3. All subsequent calls skip Redis and fall through to the in-memory LRU store
4. The in-memory LRU store is bounded by `CACHE_MEMORY_MAX_KEYS` (default: 5,000 keys)
5. There is no automatic Redis reconnection after `redisDisabled = true` is set

**Implication for feature flags:** If Redis becomes unavailable during runtime (e.g., Redis restart), all feature flag reads fall through to the in-memory LRU first, then DB. The in-memory store preserves the last-known flag values from before Redis went down, until those entries expire. After expiry, the DB is consulted directly on every call — which is safe but increases DB load.

**DB query rate under Redis outage:** With 10 flags and a single admin session, at most 10 extra DB queries per 60 seconds (one per flag key as each expires from memory). This is negligible load on any MySQL instance.

### 3.3 Redis Key Format

The feature flag service uses `getRaw` and `setRaw` from `redisCache.service.js`. These functions apply the global key prefix:

```
Logical key:  admin:ff:ADMIN_RBAC_ENABLED
Stored key:   {CACHE_KEY_PREFIX}dv{CACHE_DATA_VERSION}:admin:ff:ADMIN_RBAC_ENABLED
Default:      otofine:v1:dv1:admin:ff:ADMIN_RBAC_ENABLED
```

The `dv{version}` component is derived from `CACHE_DATA_VERSION` env var (defaulting to `"1"` when absent). Feature flag keys are completely isolated from product/category cache keys (which use prefixes like `card:`, `list:`, `cat:`).

### 3.4 Redis Not Configured

If no Redis URL is available (`REDIS_URL`, `REDISCLOUD_URL`, `REDIS_HOST` all absent), `createRedis()` in `redisCache.service.js` returns `null` immediately. All cache operations fall through to the in-memory LRU store. The feature flag service works correctly without Redis — it reads from memory LRU (which misses on first call) then DB, then populates memory LRU. This is the expected behavior in development environments without Redis.

### 3.5 `setRaw` TTL Unit — Implementation Constraint

`setRaw(key, value, ttlMs)` accepts TTL in **milliseconds**, not seconds. This differs from raw Redis `SET EX` which uses seconds. The conversion is done inside `redisCache.service.js`:

```
const ttlSec = Math.max(1, Math.ceil((ttlMs || 15_000) / 1000));
```

**Correct usage for 60-second TTL:** `setRaw(key, value, 60_000)`  
**Incorrect usage:** `setRaw(key, value, 60)` — `Math.max(1, Math.ceil(60 / 1000))` = `Math.max(1, 1)` = `1`. This silently produces a **1-second TTL**, making every admin request hit the DB directly with no observable error.

**Implementation constraint:** Every `setRaw` call in `featureFlag.service.js` must use `60_000`. This must be an explicit item on the implementation review checklist. The value should be defined as a named constant `const FLAG_CACHE_TTL_MS = 60_000` and referenced rather than inlined, to prevent the literal `60` mistake.

---

## 4. Cache TTL Strategy and Stale Cache Hazards

### 4.1 Chosen TTL: 60 Seconds

A 60-second TTL was chosen for feature flag cache entries. Rationale:

- **Low enough** that an operator toggling a flag in the DB sees effect within 1 minute without a PM2 restart
- **High enough** that a busy admin session does not hammer the DB on every page load or API call
- **Consistent** with the TTL planned in `admin-foundation-implementation-plan.md` §6.4

In Slice 2, no UI exists to toggle flags. All flags are `false`. The TTL matters more for Slice 3+ when flags begin to be enabled/disabled at runtime.

### 4.2 Stale Cache Hazard: Flag Enabled, Then Disabled

**Scenario:** An operator sets `ADMIN_RBAC_ENABLED = 1` in the DB (future Slice 3 operation). The Redis cache for that key is populated with `'1'` (TTL 60s). The operator then disables it (`= 0`) within the same 60s window.

**Result:** Any admin request within the remaining TTL window will still see the flag as `true` even though the DB shows `false`.

**Severity:** Low for Slice 2 (no flags are enabled). For Slice 3+, the maximum delay is 60 seconds. Acceptable for admin-only features with low toggle frequency.

**Mitigation (Slice 3+):** When the flag management UI toggles a flag, it must call `invalidateFlagCache(flagKey)` immediately after the DB UPDATE. This reduces the stale window to near-zero. The `invalidateFlagCache` function is exported from the feature flag service from Slice 2 onward.

### 4.3 Stale Cache Hazard: `CACHE_DATA_VERSION` Change on Deploy

**Scenario:** A new deploy sets a different `GIT_SHA` or `CACHE_DATA_VERSION` env var. The Redis key changes from `otofine:v1:dv1:admin:ff:X` to `otofine:v1:dvABC123:admin:ff:X`. All existing cache entries are unreachable.

**Result:** First request after deploy hits DB → rehydrates cache under new key → works correctly. Old keys are orphaned until TTL expiry (max 60 seconds for feature flags, longer for product caches).

**Severity:** None. This is by design in `redisCache.service.js` — version-keyed cache busting on deploy prevents stale data across code changes.

**Note for Slice 2:** The `.env` file does not currently set `CACHE_DATA_VERSION`, `APP_RELEASE`, or `GIT_SHA`. The version defaults to `"1"` and will not change unless an operator explicitly sets one of those vars.

### 4.4 Stale Cache Hazard: In-Memory LRU Divergence

**Scenario:** Multiple PM2 worker processes (if cluster mode is used) each maintain their own in-memory LRU store. One process updates the in-memory store; others do not see the update.

**Current production state:** The backend runs as a single process (`otofine-backend`) with no cluster mode. This hazard does not apply.

**Future consideration:** If PM2 cluster mode is ever enabled, per-process in-memory caches will diverge. Feature flags would show inconsistent state across requests within the same TTL window. Redis would be the authoritative cache; in-memory would only matter if Redis is unavailable.

### 4.5 Cache Warming Strategy

The `getAllFlagStates()` function performs a single bulk `SELECT` for all 10 flag keys, then writes each DB-resolved result to Redis individually. This cache-warming approach means:

- First call to `getAllFlagStates()` after a cache miss: 1 DB query + up to 10 Redis writes (one per DB-resolved flag)
- Subsequent calls to `isFeatureEnabled(key)` for any of the 10 flags: Redis hit (no DB)
- Next `getAllFlagStates()` call within TTL: 10 Redis hits (no DB)

Without cache warming in `getAllFlagStates`, a subsequent `isFeatureEnabled('ADMIN_RBAC_ENABLED')` call would still hit the DB even though `getAllFlagStates` just ran. The warming loop prevents this.

**Implementation constraint — warming loop must be explicit:** After the bulk DB `SELECT`, `getAllFlagStates` must iterate every resolved result and call `setRaw('admin:ff:' + flagKey, is_enabled ? '1' : '0', FLAG_CACHE_TTL_MS)` for each flag whose value was sourced from the DB (per C1: ENV fallback values are not cached). This loop is a required part of `getAllFlagStates`'s contract, not an optional optimization. An implementation that omits it breaks the per-flag cache guarantees described above.

**Warming applies only to DB-sourced values.** If a flag is absent from the DB and falls back to ENV, that value is returned but NOT written to the cache. The next call for that key will re-consult the DB (miss → ENV fallback again). This is intentional: once a DB row is later inserted, the first DB read after insertion will populate the cache with the authoritative DB value.

---

## 5. Cache Invalidation Strategy

### 5.1 Automatic Expiry (Slice 2 — Primary Mechanism)

In Slice 2, there is no UI to toggle feature flags. Cache entries expire naturally at the 60-second TTL. No explicit invalidation is needed during normal Slice 2 operation.

### 5.2 Manual Invalidation (Slice 3+ — Flag Toggle UI)

When a future admin flag management endpoint changes a flag's `is_enabled` value in the DB, it must immediately invalidate the cache:

```
After UPDATE admin_feature_flags SET is_enabled = ? WHERE flag_key = ?:
  → invalidateFlagCache(flagKey)   // invalidates specific key
```

The `invalidateFlagCache` function uses `invalidateByLogicalPrefix` from `redisCache.service.js`, which performs:
1. Redis SCAN for keys matching the prefix pattern
2. Redis DEL on matched keys
3. In-memory LRU store cleanup for matching prefix

**Bulk invalidation** (invalidate all 10 flags): `invalidateFlagCache(null)` — calls `invalidateByLogicalPrefix('admin:ff:ADMIN_')`.

The prefix `admin:ff:ADMIN_` is intentionally more specific than `admin:ff:`. All 10 seeded flag keys follow the `ADMIN_{MODULE}_ENABLED` pattern, so `admin:ff:ADMIN_` exactly covers them. Using the broader `admin:ff:` prefix would also invalidate any future key in the `admin:ff:` namespace that does not follow this pattern (e.g., `admin:ff_config:X`), causing unintended side effects.

**Per-flag invalidation** (specific key): `invalidateFlagCache('ADMIN_RBAC_ENABLED')` — calls `invalidateByLogicalPrefix('admin:ff:ADMIN_RBAC_ENABLED')`.

The per-flag form is already correct and narrow — the trailing `*` in the Redis SCAN pattern only matches keys longer than the full key string, of which there are none.

### 5.3 PM2 Restart as Implicit Invalidation

A PM2 restart of `otofine-backend`:
- Clears the in-memory LRU store (process memory reset)
- Does NOT clear Redis entries — they persist until TTL expiry
- Reloads `adminPlatformConfig` from current `.env` values

After a PM2 restart, the first feature flag check will consult Redis (if still within TTL of the last write), then DB, then ENV. This is correct — no stale state risk from a restart.

### 5.4 No Cache Stampede Risk

Feature flags are low-cardinality (10 keys) and low-traffic (admin sessions only). Multiple concurrent reads on a cache miss will each independently query the DB and write to the cache. The `ON DUPLICATE KEY UPDATE`-equivalent behavior from multiple concurrent Redis writes for the same key is safe — the last write wins, and any value written is correct (all DB reads see the same row).

---

## 6. Admin Route Gating Strategy

### 6.1 Two Gating Mechanisms

| Mechanism | When evaluated | Granularity | Requires restart to change |
|---|---|---|---|
| Startup config gate | Process start | Entire module's routes | Yes |
| Per-request gate | Every request | Individual handlers | No (TTL-based) |

**Startup config gate:** A module's router is conditionally constructed at process startup. If the flag is `false` in `adminPlatformConfig`, the router registers a single catch-all `404` handler and no actual route handlers. This pattern is copied directly from the existing RFQ module:

```js
// from backend/modules/rfq/index.js (existing pattern)
if (!rfqFlags.RFQ_MODULE_ENABLED) {
  console.info("[RFQ] RFQ_MODULE_ENABLED=false — routes not mounted.");
  return;
}
```

**Per-request gate:** Used inside individual handlers when fine-grained control is needed (e.g., a handler available at all times that returns different content based on flag state). The `/features` endpoint is this type — always mounted, always responds.

### 6.2 The `/features` Endpoint — Always-On Exception

The `GET /api/admin/platform/features` endpoint is the **only route in Slice 2 that is never gated** by `ADMIN_PLATFORM_ENABLED`. Rationale:

- If the features endpoint were gated by the master switch, a `false` master switch would return 404
- The frontend cannot distinguish "platform disabled" from "platform not deployed" via a 404
- Returning `{ platformEnabled: false, ... }` is semantically correct and operationally clear
- This endpoint requires a valid admin JWT — it is not public

All other future routes under `/api/admin/platform/*` (flag management UI, RBAC management, audit log viewer) will be gated by the master switch. The `/features` endpoint is the diagnostic exception.

**Implementation constraint — route registration order:** The `/features` route handler must be registered in `platform.admin.routes.js` BEFORE any platform-enabled gate that returns a 404 catch-all. The following pattern is INCORRECT and must not be used:

```js
// INCORRECT — early return gates /features along with everything else
if (!adminPlatformConfig.platformEnabled) {
  router.use("*", (req, res) => res.status(404).json({ error: "not found" }));
  return; // /features is never registered — returns 404 even with valid admin JWT
}
router.get("/features", requireAuth, requireAdmin, getFeatures); // unreachable
```

The required pattern is:

```js
// CORRECT — /features registered unconditionally before any gate
router.get("/features", requireAuth, requireAdmin, getFeatures);

// Gate for all future module routes (does not affect /features above)
if (!adminPlatformConfig.platformEnabled) {
  router.use("*", (req, res) => res.status(404).json({ error: "not found" }));
}
// Future gated routes registered here (Slice 3+)
```

This ordering ensures `/features` is always reachable regardless of `ADMIN_PLATFORM_ENABLED` state, while all future module routes remain disabled until the master switch is enabled.

### 6.3 Existing Admin Routes — Zero Change

The existing admin routes mounted in `server.js` are completely unaffected:

| Existing mount | Change |
|---|---|
| `app.use('/api/admin', adminRoutes)` | None |
| `app.use('/api/admin/part-knowledge', ...)` | None |
| `app.use('/api/admin/rfq', ...)` | None |

The new mount `app.use('/api/admin/platform', platformRouter)` is appended after all existing mounts, after `mountRfqRoutes(app)`.

**No route collision exists.** `admin.routes.js` defines specific sub-paths (`/shops`, `/admin-login`, `/admin-forgot-password`, `/shops/:id/status`, `/shops/:id`). None match `/platform`. Confirmed by reading `admin.routes.js` source.

### 6.4 Auth Middleware on New Routes

The new `/features` endpoint uses `requireAuth` and `requireAdmin` from `backend/middlewares/auth.js` (the same shim used by all existing admin routes). This shim re-exports from `backend/domains/auth/middlewares/auth.middleware.js`. No new auth logic is introduced.

The middleware chain is: `requireAuth` (validates JWT, attaches `req.user`) → `requireAdmin` (checks `req.user.role === 'admin'`) → `getFeatures` handler. Identical to all other existing admin API routes.

---

## 7. Database Design

### 7.1 `admin_feature_flags` Table

```sql
CREATE TABLE IF NOT EXISTS admin_feature_flags (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  flag_key    VARCHAR(100)   NOT NULL,
  is_enabled  TINYINT(1)     NOT NULL DEFAULT 0,
  description VARCHAR(255)   NULL,
  updated_by  INT UNSIGNED   NULL,     -- plain INT, NOT a FK
  created_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                             ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_aff_flag_key (flag_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
```

**Design decisions:**

- `updated_by` is a plain `INT UNSIGNED NULL`, **not a FK** to `admin_accounts` (which is table 052, not yet deployed). This avoids a cross-migration dependency. A FK can be added later when `admin_accounts` exists.
- `created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)` records the original row insertion timestamp. Once a flag is seeded, `created_at` is immutable — no `ON UPDATE` clause. Adding this column now costs nothing; adding it retroactively requires an `ALTER TABLE` DDL operation.
- `ON UPDATE CURRENT_TIMESTAMP(3)` on `updated_at` means the toggle timestamp is auto-maintained by MySQL — no application-level timestamp management required.
- `UNIQUE KEY` on `flag_key` ensures idempotency of `INSERT IGNORE` seed statements and prevents duplicate flag keys.
- `TINYINT(1)` for `is_enabled` matches the MySQL boolean convention used throughout the codebase.

### 7.2 Seed Data

10 rows, all `is_enabled = 0`. `INSERT IGNORE` is used so re-running the migration on a DB that already has these rows is a safe no-op. An operator who has manually set a flag to `1` will not have it overwritten by a re-run.

### 7.3 Migration Number

Migration `055` is used, consistent with the plan. Migrations `052`, `053`, `054` are reserved for `admin_accounts`, `admin_rbac`, and `admin_audit_log` respectively (to be deployed in later slices). Skipping to `055` for feature flags is intentional — `admin_feature_flags` has no FK dependency on `052–054`.

### 7.4 `schema_migrations` Integration

The migration runner (`run-admin-migration.js`) records `055_admin_feature_flags.sql` in the `schema_migrations` table after successful application. Post-migration state:

```
schema_migrations rows: 2
  - 051_schema_migrations.sql  (from Slice 1)
  - 055_admin_feature_flags.sql  (from Slice 2)
```

Rows `052`, `053`, `054` are absent. This is correct and expected for the current deployment stage.

---

## 8. File Inventory

### 8.1 New Files (9)

| Path | Description |
|---|---|
| `backend/migrations/055_admin_feature_flags.sql` | CREATE TABLE + INSERT IGNORE 10-row seed |
| `backend/migrations/055_admin_feature_flags.rollback.sql` | DROP TABLE + cleanup instructions |
| `backend/modules/admin/index.js` | Barrel: exports platformRouter, featureFlag service, config |
| `backend/modules/admin/config/adminPlatform.config.js` | Frozen ENV config object + FLAG_KEY_MAP + ALL_FLAG_KEYS |
| `backend/modules/admin/core/featureFlags/featureFlag.service.js` | `isFeatureEnabled` / `getAllFlagStates` (with DB-only cache warming loop per §4.5) / `invalidateFlagCache` |
| `backend/modules/admin/platform/routes/platform.admin.routes.js` | GET /features route — must use `export default router` (see §8.4 constraint) |
| `backend/modules/admin/platform/controllers/platform.admin.controller.js` | `getFeatures` handler — named exports |
| `frontend/contexts/AdminPlatformContext.js` | React context + AdminPlatformProvider + useAdminPlatformContext |
| `frontend/hooks/useAdminPlatform.js` | Thin public hook wrapping the context |

### 8.2 Modified Files (3)

| Path | Change | Volume |
|---|---|---|
| `backend/server.js` | 1 import line + 1 `app.use` line, appended to route section | +2 lines |
| `backend/package.json` | 2 npm scripts in `"scripts"` block | +2 lines |
| `backend/.env` | 10 `ADMIN_*=false` lines appended | +10 lines |

### 8.3 Explicitly Untouched Files

All storefront, SEO, wildcard, RFQ, and seller files. All existing admin routes. Slice 1 files (`051_schema_migrations.sql`, `run-admin-migration.js`). Frontend admin pages, layouts, and existing components.

### 8.4 Import Dependency Map

```
backend/modules/admin/core/featureFlags/featureFlag.service.js
  imports:
    ../../../../services/redisCache.service.js    (existing — read-only)
    ../../../../config/db.js                      (existing — read-only, pool only)
    ../../config/adminPlatform.config.js          (new, Slice 2)

backend/modules/admin/platform/routes/platform.admin.routes.js
  imports:
    ../../../../middlewares/auth.js               (existing — read-only)
    ../controllers/platform.admin.controller.js  (new, Slice 2)

backend/modules/admin/platform/controllers/platform.admin.controller.js
  imports:
    ../../core/featureFlags/featureFlag.service.js  (new, Slice 2)

backend/modules/admin/index.js
  imports:
    ./platform/routes/platform.admin.routes.js   (new, Slice 2)
    ./core/featureFlags/featureFlag.service.js   (new, Slice 2)
    ./config/adminPlatform.config.js             (new, Slice 2)

backend/server.js (additive)
  imports:
    ./modules/admin/index.js                     (new, Slice 2)
```

No existing file imports from the new `backend/modules/admin/` tree. The dependency is one-way: `server.js` → new module. Existing code is unaffected if the new module has a bug.

**Implementation constraint — `export default router`:** The barrel `admin/index.js` re-exports the platform router using:

```js
export { default as platformRouter } from "./platform/routes/platform.admin.routes.js";
```

This `{ default as ... }` syntax requires `platform.admin.routes.js` to use `export default router`. If a named export is used instead (`export const router = ...` without a default export), `platformRouter` resolves to `undefined` in the barrel. `server.js` then calls `app.use('/api/admin/platform', undefined)`, which causes Express 5 to throw at startup, taking down the entire backend.

**Requirement:** All route files under `backend/modules/admin/` that are re-exported by the barrel must use `export default router`. This matches the existing codebase convention confirmed across all RFQ route files. Controller and service files use named exports.

**Implementation constraint — FLAG_KEY_MAP / DEFAULT_FLAGS key parity:** `getAllFlagStates()` returns an object with camelCase keys derived from `FLAG_KEY_MAP` (e.g., `'ADMIN_RBAC_ENABLED' → 'rbacEnabled'`). The frontend `AdminPlatformContext.js` initializes from a `DEFAULT_FLAGS` object using matching camelCase keys. Any mismatch between these two mappings produces a permanently-`false` flag in the frontend with no error thrown, no console warning, and no build failure. The `FLAG_KEY_MAP` in `adminPlatform.config.js` and the `DEFAULT_FLAGS` constant in `AdminPlatformContext.js` must be reviewed side-by-side during implementation review and confirmed identical before deployment.

---

## 9. Production Safety Analysis

### 9.1 All Flags False — Zero Behavior Change

When all 10 flags are `false` (the Slice 2 initial state):

- The only new live code path is `GET /api/admin/platform/features`
- This endpoint is read-only (no writes to any table except potential Redis writes)
- It is accessible only with a valid admin JWT
- It returns a JSON object with 10 `false` values
- No storefront, RFQ, SEO, seller, or existing admin route is affected

The frontend context and hook files exist on disk but are imported by nothing. No React component mounts `AdminPlatformProvider` in Slice 2.

### 9.2 PM2 Restart Impact

`pm2 restart otofine-backend` is required after deploying the backend code and updating `.env`. Impact:

- Brief unavailability (~1–3 seconds) during restart
- This affects internal admin tool only — not storefront or API routes used by sellers/buyers
- All new routes return 401/403 (no unintended public exposure) or 404 (future gated routes)

### 9.3 `server.js` Change Safety

The two additive lines in `server.js` are:

```js
import { platformRouter } from "./modules/admin/index.js";
// ... (at end of routes section)
app.use("/api/admin/platform", platformRouter);
```

**Startup blast radius — total backend failure:** Unlike `mountRfqRoutes(app)` (a runtime function that silently does nothing when its flag is disabled), the new admin module is a static ESM import evaluated at process start. A syntax error, missing file, or invalid export anywhere in the 7-file admin module chain causes `server.js` to fail during import resolution — before `app.listen` is reached. This takes down:

- All storefront SSR APIs
- All RFQ dispatch endpoints
- All seller dashboard APIs
- All existing admin routes (`/api/admin/shops`, `/api/admin/part-knowledge`, `/api/admin/rfq`)

**Mitigation — mandatory pre-restart syntax check:**

```bash
# Step 1: syntax-only check (no execution, catches parse errors and bad imports)
node --check backend/server.js

# Step 2: verify the admin barrel resolves correctly and platformRouter is not undefined
node -e "
  import('./modules/admin/index.js').then(m => {
    if (!m.platformRouter) throw new Error('platformRouter is undefined — check export default in route file');
    console.log('[admin] barrel OK');
  }).catch(e => { console.error('[admin] barrel FAILED:', e.message); process.exit(1); });
" 

# Only proceed to pm2 restart if both commands exit 0
pm2 restart otofine-backend
```

Both checks must be run from `backend/` and both must exit 0 before PM2 is restarted. These are non-optional gates in the rollout (§11.1 Stage 4).

### 9.4 Database Impact

Migration 055 creates one new table with no FK constraints on existing tables. MySQL `CREATE TABLE IF NOT EXISTS` acquires a metadata lock briefly, but does not lock, block, or affect any existing tables.

The seed `INSERT IGNORE` statements write 10 rows to the new table only. They touch no existing data.

### 9.5 Redis Impact

Slice 2 introduces feature flag cache entries under the `admin:ff:` logical prefix. These entries:
- Are completely isolated from existing product/category cache keys
- Total at most 10 keys (one per flag)
- Each occupies ~50 bytes (key + value)
- Expire within 60 seconds of first write

No risk of Redis memory pressure or key collisions.

### 9.6 Frontend Build Safety

Two new files are added under `frontend/contexts/` (new directory) and `frontend/hooks/`. Neither is imported by any existing page, layout, or component. The `npm run build` will compile them but they are tree-shaken if unused. No existing bundle is affected.

---

## 10. Edge Case Analysis

### 10.1 `flagKey` Not in `ADMIN_MIGRATION_FILES` (Unknown Key)

If `isFeatureEnabled('UNKNOWN_KEY')` is called:

1. Redis miss (key never cached)
2. DB query finds no row (key not seeded)
3. `FLAG_KEY_MAP['UNKNOWN_KEY']` = `undefined`
4. `adminPlatformConfig[undefined]` = `undefined`
5. `undefined ?? false` = `false`
6. Returns `false`

Unknown keys always return `false`. No error, no exception, no DB impact. This is safe default behavior.

### 10.2 `getAllFlagStates` with DB Unavailable

If the DB connection fails during `getAllFlagStates()`:

1. `pool.query` throws
2. Caught by try/catch — `dbMap` remains `{}`
3. All 10 flags fall back to `adminPlatformConfig` values (ENV)
4. All ENV values are `false` (Slice 2 `.env` state)
5. Returns all-false object
6. Nothing is cached (correct — no stale data written)

Result: correct all-false response without crashing. The admin operator sees all features as disabled, which matches the intended Slice 2 state.

### 10.3 `setRaw` Failure During Cache Population

`setRaw` is called with `.catch(() => {})` after every DB/ENV resolution. If `setRaw` fails (Redis write error after a Redis reconnect attempt, in-memory LRU full), the error is silently swallowed. The flag value is returned correctly regardless. On the next call, the cache miss repeats and the DB is consulted again — correct behavior, slightly higher DB load.

### 10.4 Concurrent Requests on Cache Miss

Two concurrent admin requests both call `getAllFlagStates()` simultaneously on a cold cache:

1. Both see cache miss
2. Both issue the same bulk `SELECT` against the DB
3. Both receive identical results
4. Both attempt to write to Redis — last write wins (identical values, no corruption)
5. Both return correct all-false results

No race condition, no data corruption. The only cost is a duplicate DB query, which is acceptable.

### 10.5 `admin_feature_flags` Table Missing (Migration Not Applied)

If `server.js` starts but migration 055 has not been applied:

1. `getAllFlagStates()` is called
2. `pool.query('SELECT ... FROM admin_feature_flags ...')` throws `ER_NO_SUCH_TABLE`
3. Caught by try/catch — `dbMap` = `{}`
4. Falls back to `adminPlatformConfig` (all false)
5. Returns all-false, logs a warning

The endpoint responds correctly with all-false values. The log warning alerts the operator to apply the migration. This is safe — no crash, no incorrect flag states.

### 10.6 `flagKey` with Mixed-Case or Spaces

`FLAG_KEY_MAP` uses uppercase keys with underscores (e.g., `'ADMIN_RBAC_ENABLED'`). If a caller passes a differently-cased key (e.g., `'admin_rbac_enabled'`), the map lookup fails and the function returns `false`. No normalization is applied — callers must use the exact case from `ALL_FLAG_KEYS`.

### 10.7 `adminPlatformConfig` Read Before `dotenv.config()`

`server.js` uses `import "dotenv/config"` as the first statement before all other imports. ESM hoists imports, which means all imported modules run after `dotenv/config` is evaluated — `process.env` is populated before `adminPlatform.config.js` runs. No race condition.

### 10.8 Redis `CACHE_DATA_VERSION` = `""` (Invalid Version String)

The version string is sanitized: `.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) || "1"`. If the sanitized result is empty, it defaults to `"1"`. Edge case: if `CACHE_DATA_VERSION=""` is set, the resulting version is `"1"` (the `|| "1"` fallback). Feature flag keys remain valid.

### 10.9 `getAllFlagStates` — mysql2 IN() Parameter Binding

**Implementation constraint:** mysql2 v3 (production: v3.20.0) handles `IN (?)` expansion via double-nested array. The bulk SELECT in `getAllFlagStates` must use this exact form:

```js
// CORRECT — mysql2 expands inner array: IN ('ADMIN_PLATFORM_ENABLED', 'ADMIN_RBAC_ENABLED', ...)
const [rows] = await pool.query(
  'SELECT flag_key, is_enabled FROM admin_feature_flags WHERE flag_key IN (?)',
  [ALL_FLAG_KEYS]  // outer brackets make ALL_FLAG_KEYS the first param; mysql2 expands it
);
```

```js
// INCORRECT — spread passes each key as a separate positional param for a single ?
const [rows] = await pool.query(
  'SELECT flag_key, is_enabled FROM admin_feature_flags WHERE flag_key IN (?)',
  ...ALL_FLAG_KEYS  // causes ER_WRONG_NUMBER_OF_PARAMETERS at runtime
);
```

The error from the incorrect form does not fail at import time — it throws on the first request to `/features`, triggering the DB-unavailable fallback path (all-false result, log warning). The failure symptom is indistinguishable from a missing table without reading the error message. This binding form must be an explicit item on the implementation review checklist.

---

## 11. Rollout Strategy

### 11.1 Execution Order

```
Stage 1:  Apply migration 055 only
          node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql --dry-run
          node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql

Stage 2:  Validate migration
          SELECT flag_key, is_enabled FROM admin_feature_flags ORDER BY flag_key;
          SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at;

Stage 3:  Deploy backend code (9 new files + server.js + package.json)

Stage 4:  Run pre-restart checks (see §9.3 — both must exit 0):
          node --check backend/server.js
          node -e "import('./modules/admin/index.js').then(m => { if (!m.platformRouter) throw new Error('platformRouter undefined'); console.log('OK'); })"

Stage 5:  Append 10 ADMIN_*=false lines to backend/.env

Stage 6:  pm2 restart otofine-backend

Stage 7:  Verify /features endpoint
          curl -s -o /dev/null -w "%{http_code}" \
            https://otofine.com/api/admin/platform/features
          # Expected: 401 (route mounted, auth required)

          curl -s https://otofine.com/api/admin/platform/features \
            -H "Authorization: Bearer $ADMIN_TOKEN"
          # Expected: 200 with all 10 flags as false

Stage 8:  Regression: existing admin routes
          GET /api/admin/shops  →  200
          POST /api/auth/admin-login  →  200
          GET /api/admin/part-knowledge  →  200

Stage 9:  Deploy frontend 2 new files (contexts/ and hooks/)

Stage 10: npm run build  (in frontend/)

Stage 11: pm2 restart otofine-frontend

Stage 12: Regression: storefront / wildcard / RFQ / seller
```

### 11.2 Gate Criteria

Each stage has a hard gate. If any gate fails, **stop and do not proceed to the next stage**.

| Stage | Gate criteria |
|---|---|
| After Stage 2 | 10 rows in admin_feature_flags, all is_enabled=0; schema_migrations has 2 rows |
| After Stage 4 | `node --check server.js` exits 0 AND barrel module check exits 0 (see §9.3) |
| After Stage 7 | /features returns 401 unauth; 200 + all-false authenticated |
| After Stage 8 | All 3 existing admin routes return 200 |
| After Stage 10 | `npm run build` exits 0 with no errors |
| After Stage 12 | Storefront 200; wildcard 200; RFQ 200; seller 200 |

---

## 12. Rollback Strategy

### 12.1 Code Rollback

If backend fails to start (Stage 6 → process crashes):

```bash
cd /var/www/otofine/backend
git checkout {LAST_STABLE_COMMIT}
# Remove 10 ADMIN_* lines from .env (do not touch other vars)
pm2 restart otofine-backend
```

No existing code depends on `backend/modules/admin/`. The previous `server.js` does not import from it. Full recovery to pre-Slice-2 state.

### 12.2 Migration Rollback

```bash
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} \
  < backend/migrations/055_admin_feature_flags.rollback.sql

mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} \
  -e "DELETE FROM schema_migrations WHERE filename = '055_admin_feature_flags.sql';"
```

`admin_feature_flags` has no FK dependencies. The DROP is safe at any time after Slice 2 (before 052-054 are deployed, the table has no foreign key referees).

### 12.3 Feature-Only Rollback (Without Code Revert)

If the backend starts but `/features` returns unexpected data:

```bash
# Set all flags false in DB
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} \
  -e "UPDATE admin_feature_flags SET is_enabled = 0;"

# Invalidate Redis cache (wait 60s or restart backend to clear in-memory cache)
pm2 restart otofine-backend
```

### 12.4 Rollback Decision Tree

```
Problem detected
  │
  ├─ Backend won't start (process crash)?
  │    → §12.1 code rollback immediately
  │
  ├─ /features returns 500?
  │    → Check pm2 logs. Likely admin_feature_flags table missing.
  │    → Apply migration 055, restart — OR — §12.1 code rollback
  │
  ├─ /features returns 404?
  │    → app.use not deployed or server.js not restarted.
  │    → Verify code deployed; pm2 restart
  │
  ├─ Storefront/RFQ/seller returns 500?
  │    → §12.1 frontend or backend rollback depending on which fails
  │    → These surfaces have no dependency on Slice 2 code
  │
  └─ All flags unexpectedly true?
       → §12.3 DB reset + pm2 restart
       → Investigate how flags were enabled (audit log if available)
```

### 12.5 Zero-Trace Rollback Guarantee

A complete Slice 2 rollback (code + migration) returns the system to the exact pre-Slice-2 state:
- `schema_migrations`: 1 row (Slice 1 only)
- No `admin_feature_flags` table
- No `backend/modules/admin/` directory
- No new npm scripts
- No `ADMIN_*` env vars
- No new frontend files

Storefront, RFQ, SEO, seller, and wildcard infrastructure are unaffected throughout.
