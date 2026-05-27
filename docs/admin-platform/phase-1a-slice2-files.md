# Phase 1A Slice 2 — Implementation File Contents

> **Document type:** Implementation artifact — exact file contents ready for disk  
> **Status:** All constraints applied + final-review patches B1 and C1 applied  
> **Production deploy:** NOT YET — no rollout until plan §8 is followed exactly

---

## File 1 — `backend/migrations/055_admin_feature_flags.sql`

> Rewrites the prematurely-created file. Adds `created_at` column (patch R6).

```sql
-- =====================================================================
-- Migration 055 — Admin platform feature flags table
-- =====================================================================
--
-- ADDITIVE ONLY. Creates one new table with 10 seed rows.
-- No existing tables are modified.
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE on all seeds.
--
-- No FK dependencies on migrations 052-054 (admin_accounts, admin_rbac,
-- admin_audit_log) — those tables are not yet deployed. The updated_by
-- column is a plain nullable INT, not a FK constraint.
--
-- Rollback: see 055_admin_feature_flags.rollback.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS admin_feature_flags (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  flag_key    VARCHAR(100)   NOT NULL,
  is_enabled  TINYINT(1)     NOT NULL DEFAULT 0,
  description VARCHAR(255)   NULL,
  updated_by  INT UNSIGNED   NULL     COMMENT 'admin_id who last toggled; NULL = system/seed',
  created_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                             ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_aff_flag_key (flag_key)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Runtime toggle table for admin platform feature flags';

INSERT IGNORE INTO admin_feature_flags (flag_key, is_enabled, description) VALUES
  ('ADMIN_PLATFORM_ENABLED',                 0, 'Master switch — admin platform module'),
  ('ADMIN_RBAC_ENABLED',                     0, 'RBAC roles and permission management'),
  ('ADMIN_AUDIT_LOG_ENABLED',                0, 'Admin action audit logging'),
  ('ADMIN_MODERATION_ENABLED',               0, 'Shop and product moderation queue'),
  ('ADMIN_BILLING_ENABLED',                  0, 'Billing plans and subscriptions'),
  ('ADMIN_ANALYTICS_ENABLED',                0, 'Admin operational analytics dashboards'),
  ('ADMIN_RISK_ENGINE_ENABLED',              0, 'Risk signals and fraud queue'),
  ('ADMIN_SELLER_CRM_ENABLED',               0, 'Seller CRM notes and tags'),
  ('ADMIN_PAYMENTS_ENABLED',                 0, 'Payment processing integration'),
  ('ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED', 0, 'Enforce subscription on storefront visibility');
```

---

## File 2 — `backend/migrations/055_admin_feature_flags.rollback.sql`

> Already on disk. Verify it matches this content exactly before running.

```sql
-- =====================================================================
-- Rollback for Migration 055 — admin_feature_flags
-- =====================================================================
--
-- Pre-flight check before running:
--   SELECT COUNT(*) FROM schema_migrations WHERE filename LIKE '05%';
--   -- Only 051 and 055 should appear (052-054 not yet deployed).
--   -- admin_feature_flags has no FK dependencies — safe to drop at any time.
--   -- updated_by is a plain nullable INT, not a FK constraint.
--
-- After dropping, remove the tracking row:
--   DELETE FROM schema_migrations WHERE filename = '055_admin_feature_flags.sql';
--
-- =====================================================================

DROP TABLE IF EXISTS admin_feature_flags;
```

---

## File 3 — `backend/modules/admin/config/adminPlatform.config.js`

> B1 in implementation sequence. No dotenv.config() — relies on server.js's import "dotenv/config".

```js
/**
 * Admin platform startup configuration.
 *
 * Read-only frozen object built from process.env at module load time.
 * server.js loads dotenv/config before this module is evaluated — process.env
 * is fully populated when this module runs.
 *
 * Change to any value requires a PM2 restart.
 * ENV values are never written to Redis (C1: only DB-resolved values are cached).
 */

/**
 * Redis TTL for feature flag cache entries.
 * Unit: milliseconds (setRaw accepts ms — see redisCache.service.js §3.5).
 * Using a named constant prevents the literal-60 bug (1-second TTL).
 */
export const FLAG_CACHE_TTL_MS = 60_000;

/**
 * Map from DB flag_key (uppercase ENV format) to camelCase config property.
 * This is the single source of truth for the key mapping.
 * Any new flag must be added here AND in the DB seed migration.
 * The camelCase values must match DEFAULT_FLAGS keys in AdminPlatformContext.js.
 */
export const FLAG_KEY_MAP = {
  ADMIN_PLATFORM_ENABLED:                 "platformEnabled",
  ADMIN_RBAC_ENABLED:                     "rbacEnabled",
  ADMIN_AUDIT_LOG_ENABLED:                "auditLogEnabled",
  ADMIN_MODERATION_ENABLED:               "moderationEnabled",
  ADMIN_BILLING_ENABLED:                  "billingEnabled",
  ADMIN_ANALYTICS_ENABLED:                "analyticsEnabled",
  ADMIN_RISK_ENGINE_ENABLED:              "riskEngineEnabled",
  ADMIN_SELLER_CRM_ENABLED:               "sellerCrmEnabled",
  ADMIN_PAYMENTS_ENABLED:                 "paymentsEnabled",
  ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED: "subscriptionEnforcementEnabled",
};

/**
 * Array of all managed flag keys in DB format.
 * Used for bulk SELECT queries and cache warming.
 * Cannot be empty — derived from FLAG_KEY_MAP which has 10 static entries.
 */
export const ALL_FLAG_KEYS = Object.keys(FLAG_KEY_MAP);

/**
 * Frozen ENV-based config object.
 * Properties use camelCase matching FLAG_KEY_MAP values.
 * All values default to false unless the ENV var is explicitly set to 'true'.
 * Changing a value requires PM2 restart (read once at module load time).
 */
export const adminPlatformConfig = Object.freeze({
  platformEnabled:              process.env.ADMIN_PLATFORM_ENABLED === "true",
  rbacEnabled:                  process.env.ADMIN_RBAC_ENABLED === "true",
  auditLogEnabled:              process.env.ADMIN_AUDIT_LOG_ENABLED === "true",
  moderationEnabled:            process.env.ADMIN_MODERATION_ENABLED === "true",
  billingEnabled:               process.env.ADMIN_BILLING_ENABLED === "true",
  analyticsEnabled:             process.env.ADMIN_ANALYTICS_ENABLED === "true",
  riskEngineEnabled:            process.env.ADMIN_RISK_ENGINE_ENABLED === "true",
  sellerCrmEnabled:             process.env.ADMIN_SELLER_CRM_ENABLED === "true",
  paymentsEnabled:              process.env.ADMIN_PAYMENTS_ENABLED === "true",
  subscriptionEnforcementEnabled: process.env.ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED === "true",
});
```

---

## File 4 — `backend/modules/admin/core/featureFlags/featureFlag.service.js`

> B2 in implementation sequence. Implements all three resolution layers per design §2.1 (C1 applied).

```js
/**
 * Feature flag resolution service.
 *
 * Resolution order per design §2.1:
 *   Layer 1: Redis cache (via redisCache.service.js)
 *   Layer 2: DB table admin_feature_flags
 *   Layer 3: ENV var via adminPlatformConfig (startup-time only)
 *   Layer 4: false (default for unknown keys)
 *
 * C1 constraint: ENV fallback values are NEVER written to Redis or in-memory LRU.
 * Only DB-resolved values populate the cache.
 *
 * C2 constraint: bulk invalidation uses prefix 'admin:ff:ADMIN_' (not 'admin:ff:').
 *
 * C3 constraint: getAllFlagStates includes a DB-only cache warming loop.
 *
 * R7 constraint: all setRaw calls use FLAG_CACHE_TTL_MS (60_000 ms), never literal 60.
 *
 * R5 constraint: mysql2 IN() queries use [ALL_FLAG_KEYS] double-nested array.
 */

import { getRaw, setRaw, invalidateByLogicalPrefix } from "../../../../services/redisCache.service.js";
import { pool } from "../../../../config/db.js";
import {
  adminPlatformConfig,
  FLAG_KEY_MAP,
  ALL_FLAG_KEYS,
  FLAG_CACHE_TTL_MS,
} from "../../config/adminPlatform.config.js";

/**
 * Resolve a single feature flag.
 *
 * @param {string} flagKey  DB/ENV format key, e.g. 'ADMIN_RBAC_ENABLED'
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(flagKey) {
  // Layer 1: Redis / in-memory LRU cache
  const cached = await getRaw(`admin:ff:${flagKey}`);
  if (cached !== null) {
    return cached === "1";
  }

  // Layer 2: DB
  try {
    const [rows] = await pool.query(
      "SELECT is_enabled FROM admin_feature_flags WHERE flag_key = ?",
      [flagKey],
    );
    if (rows.length > 0) {
      const dbValue = Boolean(rows[0].is_enabled);
      // Cache DB-sourced value — C1: ENV fallback is NOT cached
      setRaw(`admin:ff:${flagKey}`, dbValue ? "1" : "0", FLAG_CACHE_TTL_MS).catch(() => {});
      return dbValue;
    }
  } catch (err) {
    console.warn(`[featureFlag] isFeatureEnabled DB error for "${flagKey}":`, err.message);
  }

  // Layer 3: ENV fallback — NOT written to cache (C1)
  const camelKey = FLAG_KEY_MAP[flagKey];
  return adminPlatformConfig[camelKey] ?? false;
}

/**
 * Resolve all 10 managed feature flags in a single bulk DB query.
 *
 * Cache warming: after the DB query, each DB-resolved value is written to Redis
 * so that subsequent isFeatureEnabled(key) calls return Redis hits (C3).
 * ENV fallback values are NOT cached (C1).
 *
 * @returns {Promise<Record<string, boolean>>} camelCase key → boolean
 */
export async function getAllFlagStates() {
  // Phase 1: check Redis/LRU for each key individually
  const cacheHits = new Map();
  const cacheMisses = [];

  for (const flagKey of ALL_FLAG_KEYS) {
    const cached = await getRaw(`admin:ff:${flagKey}`);
    if (cached !== null) {
      cacheHits.set(flagKey, cached === "1");
    } else {
      cacheMisses.push(flagKey);
    }
  }

  // Phase 2: bulk DB query for cache misses only
  const dbMap = new Map();
  if (cacheMisses.length > 0) {
    try {
      // R5: double-nested array for mysql2 IN() expansion
      // [cacheMisses] passes cacheMisses as the first param; mysql2 expands the array
      const [rows] = await pool.query(
        "SELECT flag_key, is_enabled FROM admin_feature_flags WHERE flag_key IN (?)",
        [cacheMisses],
      );
      for (const row of rows) {
        const dbValue = Boolean(row.is_enabled);
        dbMap.set(row.flag_key, dbValue);
        // C3: DB-only cache warming loop — write each DB-resolved value to Redis
        // C1: ENV fallback values are NOT included here — only rows returned by DB
        setRaw(`admin:ff:${row.flag_key}`, dbValue ? "1" : "0", FLAG_CACHE_TTL_MS).catch(
          () => {},
        );
      }
    } catch (err) {
      console.warn("[featureFlag] getAllFlagStates DB error:", err.message);
      // dbMap remains empty — all misses fall through to ENV fallback (not cached)
    }
  }

  // Phase 3: build result object for all 10 flags
  const result = {};
  for (const flagKey of ALL_FLAG_KEYS) {
    const camelKey = FLAG_KEY_MAP[flagKey];
    if (cacheHits.has(flagKey)) {
      result[camelKey] = cacheHits.get(flagKey);
    } else if (dbMap.has(flagKey)) {
      result[camelKey] = dbMap.get(flagKey);
    } else {
      // ENV fallback — NOT cached (C1)
      result[camelKey] = adminPlatformConfig[camelKey] ?? false;
    }
  }
  return result;
}

/**
 * Invalidate feature flag cache entries.
 *
 * C2: bulk prefix is 'admin:ff:ADMIN_' (not 'admin:ff:') to avoid
 * invalidating unrelated keys in the admin:ff: namespace.
 *
 * @param {string|null} flagKey  null for all flags, or a specific DB key
 *                               e.g. 'ADMIN_RBAC_ENABLED'
 */
export async function invalidateFlagCache(flagKey) {
  if (!flagKey) {
    await invalidateByLogicalPrefix("admin:ff:ADMIN_");
  } else {
    await invalidateByLogicalPrefix(`admin:ff:${flagKey}`);
  }
}
```

---

## File 5 — `backend/modules/admin/platform/controllers/platform.admin.controller.js`

> B3 in implementation sequence. Named exports only (not default).

```js
/**
 * Admin platform controller — read-only feature flag state endpoint.
 *
 * GET /api/admin/platform/features
 * Auth: requireAuth + requireAdmin (admin JWT only)
 * Returns: camelCase flag key → boolean for all 10 managed flags.
 */

import { getAllFlagStates } from "../../core/featureFlags/featureFlag.service.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getFeatures(req, res) {
  try {
    const flags = await getAllFlagStates();
    return res.json(flags);
  } catch (err) {
    console.error("[admin:platform] getFeatures error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
```

---

## File 6 — `backend/modules/admin/platform/routes/platform.admin.routes.js`

> B4 in implementation sequence.
> MUST use `export default router`.
> /features MUST be registered before the platform-enabled gate.

```js
/**
 * Admin platform routes.
 *
 * Route registration order is mandatory (design §6.2 + B1 constraint):
 *   1. /features registered UNCONDITIONALLY before any gate
 *   2. Platform-enabled catch-all gate for all FUTURE routes (Slice 3+)
 *
 * This file uses `export default router` — required by admin/index.js barrel
 * which uses `export { default as platformRouter }`.
 */

import express from "express";
import { requireAuth, requireAdmin } from "../../../../middlewares/auth.js";
import { getFeatures } from "../controllers/platform.admin.controller.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";

const router = express.Router();

// Step 1 — /features is ALWAYS registered, regardless of platformEnabled state.
// This must remain the FIRST route registration in this file.
router.get("/features", requireAuth, requireAdmin, getFeatures);

// Step 2 — Platform-enabled gate for all future routes (Slice 3+).
// This catch-all does NOT affect /features registered above because Express
// matches routes in registration order and /features was already registered.
if (!adminPlatformConfig.platformEnabled) {
  router.use((req, res) =>
    res.status(404).json({ error: "not found" }),
  );
}

// Step 3 — Future gated routes go here (Slice 3+, not in Slice 2).

export default router;
```

---

## File 7 — `backend/modules/admin/index.js`

> B5 in implementation sequence. Barrel file — re-exports for server.js consumption.

```js
/**
 * Admin platform module barrel.
 *
 * Re-exports platformRouter using `{ default as platformRouter }` — requires
 * platform.admin.routes.js to use `export default router` (B2 constraint).
 *
 * server.js consumes: import { platformRouter } from "./modules/admin/index.js"
 */

export { default as platformRouter } from "./platform/routes/platform.admin.routes.js";
export {
  isFeatureEnabled,
  getAllFlagStates,
  invalidateFlagCache,
} from "./core/featureFlags/featureFlag.service.js";
export {
  adminPlatformConfig,
  FLAG_KEY_MAP,
  ALL_FLAG_KEYS,
  FLAG_CACHE_TTL_MS,
} from "./config/adminPlatform.config.js";
```

---

## File 8 — `backend/server.js` — additive changes only

> B6 in implementation sequence. Two lines added. No existing lines modified.

### 8a. Import line — add after line 53 (after `import pushRoutes from "./routes/push.routes.js"`)

```js
import { platformRouter } from "./modules/admin/index.js";
```

### 8b. Route mount — add after `mountRfqRoutes(app)` (line 211), before `const PORT`

```js
app.use("/api/admin/platform", platformRouter);
```

---

## File 9 — `backend/package.json` — additive changes only

> B7 in implementation sequence. Two scripts added to `"scripts"` block.

```json
"migrate:admin:ff":     "node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql",
"migrate:admin:ff:dry": "node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql --dry-run"
```

These go inside the existing `"scripts": { ... }` block alongside the existing `migrate:admin:foundation` entries. No existing script is modified.

---

## File 10 — `backend/.env` — additive changes only

> B8 in implementation sequence. Append these 10 lines to the end of the file.

```
ADMIN_PLATFORM_ENABLED=false
ADMIN_RBAC_ENABLED=false
ADMIN_AUDIT_LOG_ENABLED=false
ADMIN_MODERATION_ENABLED=false
ADMIN_BILLING_ENABLED=false
ADMIN_ANALYTICS_ENABLED=false
ADMIN_RISK_ENGINE_ENABLED=false
ADMIN_SELLER_CRM_ENABLED=false
ADMIN_PAYMENTS_ENABLED=false
ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED=false
```

---

## File 11 — `frontend/contexts/AdminPlatformContext.js`

> C1 in implementation sequence. New directory `frontend/contexts/` must be created first.
> DEFAULT_FLAGS camelCase keys must match FLAG_KEY_MAP values in File 3 (adminPlatform.config.js).

```js
"use client";

/**
 * Admin platform feature flag context scaffold.
 *
 * In Slice 2 this provider is NOT mounted anywhere — no component imports it.
 * It is scaffold-only, tree-shaken by the Next.js build.
 *
 * Usage in Slice 3+:
 *   A Server Component layout fetches flags from GET /api/admin/platform/features
 *   and passes them as initialFlags prop to AdminPlatformProvider.
 *
 * DEFAULT_FLAGS keys MUST match FLAG_KEY_MAP values in adminPlatform.config.js.
 * Any mismatch causes a silently-false flag with no build or runtime error.
 */

import { createContext, useContext, useState } from "react";

/**
 * Default flag values — all false.
 * Matches FLAG_KEY_MAP camelCase values in backend/modules/admin/config/adminPlatform.config.js.
 */
export const DEFAULT_FLAGS = {
  platformEnabled:              false,
  rbacEnabled:                  false,
  auditLogEnabled:              false,
  moderationEnabled:            false,
  billingEnabled:               false,
  analyticsEnabled:             false,
  riskEngineEnabled:            false,
  sellerCrmEnabled:             false,
  paymentsEnabled:              false,
  subscriptionEnforcementEnabled: false,
};

const AdminPlatformContext = createContext(DEFAULT_FLAGS);

/**
 * Provider scaffold for admin platform feature flags.
 *
 * @param {{ children: React.ReactNode, initialFlags?: Partial<typeof DEFAULT_FLAGS> }} props
 *   initialFlags — fetched server-side by a parent Server Component layout.
 *   If omitted, all flags default to false.
 */
export function AdminPlatformProvider({ children, initialFlags }) {
  const [flags] = useState(() => ({
    ...DEFAULT_FLAGS,
    ...(initialFlags ?? {}),
  }));

  return (
    <AdminPlatformContext.Provider value={flags}>
      {children}
    </AdminPlatformContext.Provider>
  );
}

/**
 * Internal context consumer — not the public API.
 * Use useAdminPlatform from frontend/hooks/useAdminPlatform.js instead.
 */
export function useAdminPlatformContext() {
  return useContext(AdminPlatformContext);
}
```

---

## File 12 — `frontend/hooks/useAdminPlatform.js`

> C2 in implementation sequence. frontend/hooks/ already exists.

```js
/**
 * Public hook for accessing admin platform feature flags.
 *
 * Wraps useAdminPlatformContext from AdminPlatformContext.
 * In Slice 2 this hook is not called by any component — scaffold only.
 *
 * Usage in Slice 3+:
 *   const { rbacEnabled } = useAdminPlatform();
 */

import { useAdminPlatformContext } from "../contexts/AdminPlatformContext.js";

export function useAdminPlatform() {
  return useAdminPlatformContext();
}
```

---

## Self-Review

### File Inventory vs Plan

| Plan item | File | Status |
|---|---|---|
| A1 — Rewrite 055 SQL with created_at | File 1 | ✓ created_at column present |
| A2 — Rollback SQL | File 2 | ✓ matches existing file |
| B1 — adminPlatform.config.js | File 3 | ✓ FLAG_KEY_MAP, ALL_FLAG_KEYS, FLAG_CACHE_TTL_MS=60_000 |
| B2 — featureFlag.service.js | File 4 | ✓ isFeatureEnabled, getAllFlagStates (warming), invalidateFlagCache |
| B3 — platform.admin.controller.js | File 5 | ✓ named exports, getFeatures |
| B4 — platform.admin.routes.js | File 6 | ✓ export default router; /features before gate |
| B5 — admin/index.js | File 7 | ✓ barrel with { default as platformRouter } |
| B6 — server.js changes | File 8 | ✓ +1 import +1 app.use, additive only |
| B7 — package.json scripts | File 9 | ✓ migrate:admin:ff and migrate:admin:ff:dry |
| B8 — .env additions | File 10 | ✓ 10 ADMIN_*=false lines |
| C1 — AdminPlatformContext.js | File 11 | ✓ 'use client', DEFAULT_FLAGS, provider scaffold |
| C2 — useAdminPlatform.js | File 12 | ✓ thin hook wrapping context |

### Constraint Verification

| Constraint | Applied |
|---|---|
| `export default router` in platform.admin.routes.js | ✓ File 6 last line |
| `/features` registered before platform-enabled gate | ✓ File 6 Step 1 before Step 2 |
| `router.use(handler)` — no path (Express 5, patch B1) | ✓ File 6 — `"*"` argument removed |
| `invalidateFlagCache` guard uses `!flagKey` (patch C1) | ✓ File 4 — handles null, undefined, and empty string |
| ENV fallback NOT written to Redis/LRU | ✓ File 4 — setRaw only called for dbValue, not adminPlatformConfig values |
| Bulk invalidation prefix `admin:ff:ADMIN_` | ✓ File 4 invalidateFlagCache `!flagKey` branch |
| DB-only cache warming loop in getAllFlagStates | ✓ File 4 Phase 2 loop |
| mysql2 IN() uses `[cacheMisses]` nested array | ✓ File 4 — `[cacheMisses]` as second arg |
| FLAG_CACHE_TTL_MS = 60_000 (not literal 60) | ✓ File 3 constant; File 4 all setRaw calls |
| No dotenv.config() in config file | ✓ File 3 — no dotenv import |
| DEFAULT_FLAGS keys match FLAG_KEY_MAP values | ✓ File 11 keys identical to File 3 values |
| No storefront/RFQ/SEO/wildcard files modified | ✓ Only files in plan §3.2 are touched |
| No auth rewrites | ✓ Uses existing requireAuth/requireAdmin shim |
| adminPlatformConfig is frozen | ✓ File 3 Object.freeze() |
| `'use client'` in context file | ✓ File 11 first line |
| Provider accepts initialFlags prop | ✓ File 11 AdminPlatformProvider signature |

### Unrelated Files Changed

None. Only the 9 new files and 3 modified files listed in implementation plan §3.2 are touched. Verified: no storefront, RFQ, SEO, wildcard, seller, or existing admin route file is referenced in any new file for write purposes.

---

## Deployment Instructions

**Do not deploy yet.** When ready, follow `phase-1a-slice2-implementation-plan.md` §8 exactly:

1. Verify `055_admin_feature_flags.sql` contains `created_at` column
2. Dry run: `npm run migrate:admin:ff:dry`
3. Live run: `npm run migrate:admin:ff`
4. Run validation queries from plan §7.3
5. Write all 9 backend/frontend files to disk
6. Run both pre-restart checks from plan §6.1
7. `pm2 restart otofine-backend`
8. Run smoke tests from plan §8.3
9. Deploy frontend files
10. `npm run build` in frontend/
11. `pm2 restart otofine-frontend`
12. Run full regression from plan §8.4
