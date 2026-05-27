# Phase 1A Slice 2 — Feature Flag Foundation: Implementation Plan

> **Document type:** Implementation plan — no code generated  
> **Date:** 2026-05-26  
> **Scope:** Feature flags table, flag resolution service, read-only features API, minimal frontend context scaffold  
> **Status:** PLANNING — ready for implementation execution  
> **Source of truth:** `phase-1a-slice2-design.md` (patched) + `phase-1a-slice2-review.md` + all 5 audit docs + Slice 1 production state

---

## Table of Contents

1. [Pre-Implementation State Verification](#1-pre-implementation-state-verification)
2. [Implementation Sequence](#2-implementation-sequence)
3. [File Inventory and Dependency Graph](#3-file-inventory-and-dependency-graph)
4. [Runtime Flows](#4-runtime-flows)
5. [Route Registration Sequence](#5-route-registration-sequence)
6. [Startup Safety Procedure](#6-startup-safety-procedure)
7. [Migration Safety Checks](#7-migration-safety-checks)
8. [Rollout Procedure](#8-rollout-procedure)
9. [Hidden-State Guarantees](#9-hidden-state-guarantees)
10. [Edge-Case Handling Plan](#10-edge-case-handling-plan)
11. [Explicit Implementation Constraints](#11-explicit-implementation-constraints)
12. [Implementation Review Checklist](#12-implementation-review-checklist)

---

## 1. Pre-Implementation State Verification

Run these checks before writing any file. All must pass.

### 1.1 Slice 1 Production State

```sql
-- Confirm schema_migrations table exists and Slice 1 is recorded
SELECT filename, applied_at, checksum
FROM schema_migrations
ORDER BY applied_at;
-- Expected: exactly 1 row — 051_schema_migrations.sql
```

```bash
# Confirm backend is running
pm2 status otofine-backend
# Expected: status = online, restarts = same value as before Slice 1

# Confirm no admin platform routes exist yet
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/platform/features
# Expected: 404 (route not mounted)
```

### 1.2 Existing File Inventory

Confirm these files exist exactly as deployed in Slice 1:

- `backend/migrations/051_schema_migrations.sql` — present
- `backend/migrations/051_schema_migrations.rollback.sql` — present
- `backend/scripts/run-admin-migration.js` — present
- `backend/package.json` — contains `migrate:admin:foundation` and `migrate:admin:foundation:dry` scripts

### 1.3 Pre-Existing 055 SQL File — Requires Update

`backend/migrations/055_admin_feature_flags.sql` was created prematurely before the design review. It is **missing the `created_at` column** mandated by design patch R6. This file must be rewritten before use. Do not run the migration against the file in its current state.

Confirm the file needs the `created_at` column:

```bash
grep -c "created_at" backend/migrations/055_admin_feature_flags.sql
# Expected: 0 (column missing — must be added before migration runs)
```

### 1.4 `ADMIN_MIGRATION_FILES` in Runner

The migration runner already includes `055_admin_feature_flags.sql` in its file list (verified from source). No change to the runner is needed for Slice 2.

```bash
grep "055_admin_feature_flags" backend/scripts/run-admin-migration.js
# Expected: match found — runner already knows about this file
```

---

## 2. Implementation Sequence

### Phase A — Database (complete before any backend code is written)

```
A1. Rewrite backend/migrations/055_admin_feature_flags.sql
    - Add created_at column per design patch R6
    - Verify all 10 INSERT IGNORE seed rows are present

A2. Verify 055_admin_feature_flags.rollback.sql
    - Already present — confirm it references DROP TABLE IF EXISTS admin_feature_flags
    - No change needed if consistent with design §12.2
```

### Phase B — Backend (implement in this exact order)

```
B1. backend/modules/admin/config/adminPlatform.config.js
    - FLAG_KEY_MAP (10 entries, camelCase values)
    - ALL_FLAG_KEYS array (derived from FLAG_KEY_MAP keys)
    - FLAG_CACHE_TTL_MS = 60_000 constant
    - Frozen adminPlatformConfig object (reads process.env at module load time)
    - NO dotenv.config() call — relies on server.js's dotenv/config import

B2. backend/modules/admin/core/featureFlags/featureFlag.service.js
    - Depends on: adminPlatform.config.js (B1), redisCache.service.js (existing), db.js (existing)
    - Functions: isFeatureEnabled, getAllFlagStates (with warming loop), invalidateFlagCache
    - Uses FLAG_CACHE_TTL_MS from B1 for all setRaw calls

B3. backend/modules/admin/platform/controllers/platform.admin.controller.js
    - Depends on: featureFlag.service.js (B2)
    - Exports: named export getFeatures (not default export)

B4. backend/modules/admin/platform/routes/platform.admin.routes.js
    - Depends on: auth.js (existing), platform.admin.controller.js (B3)
    - MUST use: export default router
    - MUST register /features BEFORE platform-enabled gate (see §5)

B5. backend/modules/admin/index.js
    - Depends on: platform.admin.routes.js (B4), featureFlag.service.js (B2),
                  adminPlatform.config.js (B1)
    - Re-exports: platformRouter (via { default as platformRouter }), featureFlagService,
                  adminPlatformConfig

B6. backend/server.js — additive modification
    - Add 1 import line after existing imports (after line 53)
    - Add 1 app.use line after mountRfqRoutes(app) (after line 211)

B7. backend/package.json — additive modification
    - Add 2 new npm scripts in the "scripts" block

B8. backend/.env — additive modification
    - Append 10 ADMIN_*=false lines at the end of the file
```

### Phase C — Frontend (implement after backend is deployed and verified)

```
C1. frontend/contexts/AdminPlatformContext.js
    - Create frontend/contexts/ directory (does not exist yet)
    - 'use client' directive
    - DEFAULT_FLAGS object (camelCase keys — must match FLAG_KEY_MAP values in B1)
    - AdminPlatformProvider component (accepts initialFlags prop)
    - useAdminPlatformContext hook (internal — not the public API)

C2. frontend/hooks/useAdminPlatform.js
    - Depends on: AdminPlatformContext.js (C1)
    - frontend/hooks/ directory already exists
    - Thin public hook wrapping useAdminPlatformContext
    - Exports: named export useAdminPlatform
```

### Phase D — Rollout (after all files are written)

```
D1. Apply migration 055 (dry run then live)
D2. Validate migration
D3. Run startup safety checks
D4. PM2 restart backend
D5. Smoke test backend
D6. Deploy frontend files
D7. Build and restart frontend
D8. Full regression
```

---

## 3. File Inventory and Dependency Graph

### 3.1 New Files (9)

| # | Path | Phase | Export pattern |
|---|---|---|---|
| 1 | `backend/migrations/055_admin_feature_flags.sql` | A1 | SQL — no exports |
| 2 | `backend/migrations/055_admin_feature_flags.rollback.sql` | A2 | SQL — no exports |
| 3 | `backend/modules/admin/config/adminPlatform.config.js` | B1 | Named: `adminPlatformConfig`, `FLAG_KEY_MAP`, `ALL_FLAG_KEYS`, `FLAG_CACHE_TTL_MS` |
| 4 | `backend/modules/admin/core/featureFlags/featureFlag.service.js` | B2 | Named: `isFeatureEnabled`, `getAllFlagStates`, `invalidateFlagCache` |
| 5 | `backend/modules/admin/platform/controllers/platform.admin.controller.js` | B3 | Named: `getFeatures` |
| 6 | `backend/modules/admin/platform/routes/platform.admin.routes.js` | B4 | **Default: `router`** |
| 7 | `backend/modules/admin/index.js` | B5 | Named re-exports: `platformRouter`, `featureFlagService`, `adminPlatformConfig` |
| 8 | `frontend/contexts/AdminPlatformContext.js` | C1 | Named: `AdminPlatformProvider`, `useAdminPlatformContext`; `DEFAULT_FLAGS` |
| 9 | `frontend/hooks/useAdminPlatform.js` | C2 | Named: `useAdminPlatform` |

### 3.2 Modified Files (3)

| Path | Change | Constraint |
|---|---|---|
| `backend/server.js` | +1 import after line 53; +1 `app.use` after line 211 (after `mountRfqRoutes`) | Append only — no existing line modified |
| `backend/package.json` | +2 scripts in `"scripts"` block | Append only — no existing script modified |
| `backend/.env` | +10 `ADMIN_*=false` lines at end of file | Append only — no existing var touched |

### 3.3 Dependency Graph

```
server.js (entry point)
  └── import "dotenv/config"                    (line 4 — evaluates BEFORE all other imports)
  └── modules/admin/index.js  (B5)
        ├── platform/routes/platform.admin.routes.js  (B4)
        │     ├── middlewares/auth.js                  (existing — unchanged)
        │     └── platform/controllers/platform.admin.controller.js  (B3)
        │           └── core/featureFlags/featureFlag.service.js  (B2)
        │                 ├── services/redisCache.service.js  (existing — unchanged)
        │                 ├── config/db.js               (existing — unchanged)
        │                 └── config/adminPlatform.config.js  (B1)
        ├── core/featureFlags/featureFlag.service.js  (B2)  [re-exported]
        └── config/adminPlatform.config.js  (B1)  [re-exported]

frontend/hooks/useAdminPlatform.js  (C2)
  └── frontend/contexts/AdminPlatformContext.js  (C1)
        (no backend imports — client-side only)
```

**One-way dependency constraint:** No existing file imports from `backend/modules/admin/`. The dependency arrow points exclusively inward from `server.js`. A failure in any admin module file does not affect existing modules until `server.js` is restarted.

### 3.4 Directory Creation Required

```
backend/modules/admin/                          (new root)
backend/modules/admin/config/                   (new)
backend/modules/admin/core/                     (new)
backend/modules/admin/core/featureFlags/        (new)
backend/modules/admin/platform/                 (new)
backend/modules/admin/platform/routes/          (new)
backend/modules/admin/platform/controllers/     (new)
frontend/contexts/                              (new — does not exist)
```

`frontend/hooks/` already exists — no creation needed.

---

## 4. Runtime Flows

### 4.1 Flag Resolution Flow — `isFeatureEnabled(flagKey)`

```
isFeatureEnabled('ADMIN_RBAC_ENABLED')
  │
  ├─ 1. getRaw('admin:ff:ADMIN_RBAC_ENABLED')
  │       │
  │       ├─ Redis available + key present → return '1' or '0'
  │       │     └── parse to boolean → RETURN result
  │       │
  │       ├─ Redis available + key absent → return null → continue
  │       │
  │       ├─ Redis error (caught internally) → return null → continue
  │       │
  │       └─ Redis disabled / no Redis → LRU store
  │               ├─ LRU hit (not expired) → return cached value → RETURN result
  │               └─ LRU miss / expired → return null → continue
  │
  ├─ 2. pool.query('SELECT is_enabled FROM admin_feature_flags WHERE flag_key = ?', ['ADMIN_RBAC_ENABLED'])
  │       │
  │       ├─ Row found → dbValue = Boolean(row.is_enabled)
  │       │     └── setRaw('admin:ff:ADMIN_RBAC_ENABLED', dbValue ? '1' : '0', 60_000).catch(() => {})
  │       │     └── RETURN dbValue
  │       │
  │       ├─ No row found → continue to ENV fallback
  │       │
  │       └─ DB error (caught) → continue to ENV fallback (no cache write)
  │
  ├─ 3. adminPlatformConfig[FLAG_KEY_MAP['ADMIN_RBAC_ENABLED']]
  │       = adminPlatformConfig['rbacEnabled']
  │       │
  │       ├─ Value present → envValue = Boolean(value)
  │       │     → NOT cached (C1: ENV values never written to Redis or LRU)
  │       │     └── RETURN envValue
  │       │
  │       └─ Value absent or undefined → continue
  │
  └─ 4. RETURN false  (Layer 4 default)
```

### 4.2 Bulk Flag Resolution Flow — `getAllFlagStates()`

```
getAllFlagStates()
  │
  ├─ 1. getRaw for each of the 10 keys (ALL_FLAG_KEYS)
  │       → build cacheHits: Map<flagKey, boolean>
  │       → identify cacheMisses: flagKey[] (keys not in Redis/LRU)
  │
  ├─ 2. If cacheMisses.length > 0:
  │       pool.query(
  │         'SELECT flag_key, is_enabled FROM admin_feature_flags WHERE flag_key IN (?)',
  │         [cacheMisses]   ← double-nested array (mysql2 IN() expansion — §10.9)
  │       )
  │       → build dbMap: Map<flagKey, boolean>
  │       → DB-only cache warming loop:
  │           for each flagKey in dbMap:
  │             setRaw('admin:ff:' + flagKey, dbMap[flagKey] ? '1' : '0', FLAG_CACHE_TTL_MS)
  │             .catch(() => {})
  │
  ├─ 3. For each of the 10 keys, resolve final value:
  │       priority: cacheHits[key] → dbMap[key] → adminPlatformConfig[FLAG_KEY_MAP[key]] → false
  │       ENV fallback is NOT written to cache (C1)
  │
  └─ 4. Return Record<camelCaseKey, boolean> for all 10 flags
         e.g., { platformEnabled: false, rbacEnabled: false, ... }
```

### 4.3 ENV Fallback Flow

```
ENV fallback is consulted only when:
  - DB has no row for the flagKey (or DB query failed)
  - Redis/LRU has no cached value

adminPlatformConfig is a frozen object built at module load time:
  {
    platformEnabled:              Boolean(process.env.ADMIN_PLATFORM_ENABLED === 'true'),
    rbacEnabled:                  Boolean(process.env.ADMIN_RBAC_ENABLED === 'true'),
    auditLogEnabled:              Boolean(process.env.ADMIN_AUDIT_LOG_ENABLED === 'true'),
    moderationEnabled:            Boolean(process.env.ADMIN_MODERATION_ENABLED === 'true'),
    billingEnabled:               Boolean(process.env.ADMIN_BILLING_ENABLED === 'true'),
    analyticsEnabled:             Boolean(process.env.ADMIN_ANALYTICS_ENABLED === 'true'),
    riskEngineEnabled:            Boolean(process.env.ADMIN_RISK_ENGINE_ENABLED === 'true'),
    sellerCrmEnabled:             Boolean(process.env.ADMIN_SELLER_CRM_ENABLED === 'true'),
    paymentsEnabled:              Boolean(process.env.ADMIN_PAYMENTS_ENABLED === 'true'),
    subscriptionEnforcementEnabled: Boolean(process.env.ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED === 'true'),
  }

All 10 values are false when .env contains ADMIN_*=false.
ENV values are returned directly — never written to Redis or LRU cache.
Change requires PM2 restart.
```

### 4.4 Cache Warming Flow (inside `getAllFlagStates`)

```
After bulk SELECT returns dbRows:
  for each row in dbRows:
    flagKey = row.flag_key
    isEnabled = Boolean(row.is_enabled)
    await setRaw(
      'admin:ff:' + flagKey,          // logical key — prefix applied internally
      isEnabled ? '1' : '0',          // string value
      FLAG_CACHE_TTL_MS               // 60_000 (ms) — NOT 60
    ).catch(() => {})

Keys absent from dbRows (no DB row) are NOT warmed.
The next isFeatureEnabled call for such a key will DB-miss → ENV fallback.
If a DB row is later inserted, the warming loop will populate it on the next getAllFlagStates call.
```

### 4.5 Cache Invalidation Flow — `invalidateFlagCache(flagKey)`

```
invalidateFlagCache(flagKey)
  │
  ├─ flagKey is null → bulk invalidation
  │     invalidateByLogicalPrefix('admin:ff:ADMIN_')
  │     → Redis SCAN for pattern: {PREFIX}dv{VERSION}:admin:ff:ADMIN_*
  │     → Redis DEL all matched keys
  │     → LRU store: delete all keys starting with {PREFIX}dv{VERSION}:admin:ff:ADMIN_
  │
  └─ flagKey is a string (e.g., 'ADMIN_RBAC_ENABLED') → per-flag invalidation
        invalidateByLogicalPrefix('admin:ff:ADMIN_RBAC_ENABLED')
        → Redis SCAN for pattern: {PREFIX}dv{VERSION}:admin:ff:ADMIN_RBAC_ENABLED*
        → Redis DEL matched key(s)
        → LRU store: delete matching entries

Invalidation covers both Redis and in-memory LRU simultaneously.
After invalidation, next isFeatureEnabled call reads from DB.
invalidateFlagCache is exported but not called in Slice 2 (no flag toggle UI yet).
It is available for Slice 3+ flag management routes.
```

---

## 5. Route Registration Sequence

### 5.1 `platform.admin.routes.js` Internal Order

The following registration order is mandatory and must not be altered:

```
Step 1 (unconditional):
  router.get('/features', requireAuth, requireAdmin, getFeatures)
  ↑ This route is ALWAYS registered regardless of platformEnabled state.
  ↑ Registered BEFORE any gate check.

Step 2 (gate for all future routes):
  if (!adminPlatformConfig.platformEnabled) {
    router.use('*', (req, res) => res.status(404).json({ error: 'not found' }))
    // This catch-all blocks future routes added in Slice 3+
    // It does NOT block /features because /features was registered in Step 1
  }

Step 3 (future gated routes — Slice 3+, not implemented in Slice 2):
  // router.get('/flags', ...) etc.
  // These routes are registered here and will be blocked by the
  // Step 2 catch-all when platformEnabled = false
```

**Why this works in Express:** Once `router.get('/features', ...)` is registered, a GET /features request is handled by that route handler regardless of any catch-all registered afterward. Express matches routes in registration order and calls the first match.

### 5.2 Middleware Chain on `/features`

```
Request: GET /api/admin/platform/features
  │
  ├─ server.js: app.use('/api/admin', adminRoutes)        [line 166]
  │     adminRoutes has no /platform route → calls next()
  │
  ├─ server.js: app.use('/api/admin/platform', platformRouter) [new line, after 211]
  │     platformRouter matches prefix
  │     stripped path: /features
  │     │
  │     ├─ Step 1: router.get('/features', requireAuth, requireAdmin, getFeatures)
  │     │     requireAuth: validates JWT → populates req.user
  │     │     requireAdmin: checks req.user.role === 'admin'
  │     │     getFeatures: calls getAllFlagStates() → returns JSON
  │     └─
  │
  └─ (never reached: no further matching handlers)
```

### 5.3 `server.js` Modification — Exact Insertion Points

**Import insertion** — after the last existing import (line 53, `pushRoutes`):

```js
// Existing last import (line 53):
import pushRoutes from "./routes/push.routes.js";
// ADD after line 53:
import { platformRouter } from "./modules/admin/index.js";
```

**Route mount insertion** — after `mountRfqRoutes(app)` (line 211), before `app.listen` (line 214):

```js
mountRfqRoutes(app);  // existing line 211
// ADD after line 211:
app.use("/api/admin/platform", platformRouter);

const PORT = process.env.PORT || 5000;  // existing line 213
app.listen(PORT, () => {  // existing line 214
```

---

## 6. Startup Safety Procedure

### 6.1 Pre-Restart Checks — Both Must Pass

Run from `backend/` directory after all code is written, before `pm2 restart`:

```bash
# Check 1: Syntax validation (no execution — catches parse errors and bad static imports)
node --check server.js
# Exit 0 = pass. Any non-zero exit = syntax/import error — DO NOT restart PM2.

# Check 2: Barrel module resolution (validates export contract — catches undefined platformRouter)
node -e "
  import('./modules/admin/index.js').then(m => {
    if (!m.platformRouter) {
      console.error('[admin] FAIL: platformRouter is undefined — check export default in routes file');
      process.exit(1);
    }
    if (typeof m.platformRouter !== 'function') {
      console.error('[admin] FAIL: platformRouter is not an Express router');
      process.exit(1);
    }
    console.log('[admin] barrel OK — platformRouter resolved');
    process.exit(0);
  }).catch(e => {
    console.error('[admin] barrel FAILED:', e.message);
    process.exit(1);
  });
"
# Exit 0 = pass. Any non-zero exit = import chain failure — DO NOT restart PM2.
```

### 6.2 PM2 Restart Procedure

Only execute after both checks in §6.1 pass:

```bash
pm2 restart otofine-backend
# Wait for startup (~3 seconds)
pm2 status otofine-backend
# Expected: status = online, NOT errored

# Immediate post-restart health check
pm2 logs otofine-backend --lines 20 --nostream
# Expected: no ERROR lines, sees "[api] listening" log
```

### 6.3 Rollback Trigger Conditions

Trigger **immediate rollback** (§8.7) if any of the following occur after PM2 restart:

| Condition | Evidence | Action |
|---|---|---|
| Process crash | `pm2 status` shows `errored` or `stopped` | §8.7 code rollback |
| Process restart loop | restart count increments rapidly | §8.7 code rollback |
| Import error in logs | `Cannot find module`, `SyntaxError`, `undefined is not a function` | §8.7 code rollback |
| Storefront returns 500 | `curl https://otofine.com/` → non-200 | §8.7 code rollback |
| RFQ endpoint returns 500 | `curl /api/rfq/...` → non-200 | §8.7 code rollback |
| `/features` returns 500 | Unexpected — see §10.2; apply migration if missing | Apply 055, restart |
| Pre-restart check fails | `node --check` exits non-0 | Fix code error before attempting restart |

---

## 7. Migration Safety Checks

### 7.1 Pre-Migration Dry Run

```bash
# Dry run: prints what would be applied, no DB changes
node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql --dry-run

# Expected output:
# [admin-migration:dry-run] Starting — <timestamp>
# [admin-migration:dry-run] DRY-RUN mode: no SQL will be executed
# [admin-migration:dry-run] Single-file mode: 055_admin_feature_flags.sql
# [admin-migration:dry-run] WOULD APPLY: 055_admin_feature_flags.sql (sha256: ...)
# [admin-migration:dry-run] Dry run complete — 0 changes made

# If output shows SKIP (already applied): migration was already run.
# Verify the table has created_at column before proceeding:
mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "SHOW COLUMNS FROM admin_feature_flags;"
```

### 7.2 Migration Execution

```bash
node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql

# Expected output:
# [admin-migration] Starting — <timestamp>
# [admin-migration] Single-file mode: 055_admin_feature_flags.sql
# [admin-migration] APPLY: 055_admin_feature_flags.sql (sha256: ...)
# [admin-migration] OK: 055_admin_feature_flags.sql
# [admin-migration] Done — applied: 1, skipped: 0, drift warnings: 0
# Process exits with code 0
```

### 7.3 Post-Migration Validation Queries

Run all 4 queries. All must pass before proceeding to backend deploy.

```sql
-- V1: Table exists with correct schema (including created_at from patch R6)
SHOW COLUMNS FROM admin_feature_flags;
-- Expected columns: id, flag_key, is_enabled, description, updated_by,
--                   created_at, updated_at
-- If created_at is absent: migration was run from the old (pre-patch) file.
--   → Rollback migration, update SQL file, re-run.

-- V2: All 10 seed rows are present, all disabled
SELECT flag_key, is_enabled
FROM admin_feature_flags
ORDER BY flag_key;
-- Expected: 10 rows, all is_enabled = 0
-- Flag keys expected:
--   ADMIN_ANALYTICS_ENABLED
--   ADMIN_AUDIT_LOG_ENABLED
--   ADMIN_BILLING_ENABLED
--   ADMIN_MODERATION_ENABLED
--   ADMIN_PAYMENTS_ENABLED
--   ADMIN_PLATFORM_ENABLED
--   ADMIN_RBAC_ENABLED
--   ADMIN_RISK_ENGINE_ENABLED
--   ADMIN_SELLER_CRM_ENABLED
--   ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED

-- V3: schema_migrations now has exactly 2 rows
SELECT filename, applied_at
FROM schema_migrations
ORDER BY applied_at;
-- Expected: 2 rows
--   051_schema_migrations.sql   (Slice 1)
--   055_admin_feature_flags.sql  (Slice 2)
-- Rows 052, 053, 054 must NOT appear.

-- V4: Checksum is recorded
SELECT filename, checksum
FROM schema_migrations
WHERE filename = '055_admin_feature_flags.sql';
-- Expected: 1 row with non-null checksum (64-char hex)
```

### 7.4 Migration Rollback Queries

If any validation fails or a decision is made to roll back migration:

```bash
# Step 1: Drop the table
mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  < backend/migrations/055_admin_feature_flags.rollback.sql

# Step 2: Remove the tracking row
mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "DELETE FROM schema_migrations WHERE filename = '055_admin_feature_flags.sql';"

# Step 3: Verify rollback
mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "SELECT COUNT(*) FROM schema_migrations;"
# Expected: 1 (only Slice 1 row remains)

mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "SHOW TABLES LIKE 'admin_feature_flags';"
# Expected: empty result (table dropped)
```

### 7.5 Seed Verification

```sql
-- Confirm INSERT IGNORE idempotency: re-running migration is a no-op
-- After a successful first run, run migration again:
-- node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql
-- Expected: SKIP (already applied) — no rows modified, exit 0

-- Confirm an operator-set flag survives re-run (INSERT IGNORE protects manual changes)
UPDATE admin_feature_flags SET is_enabled = 1 WHERE flag_key = 'ADMIN_PLATFORM_ENABLED';
-- Re-run migration (would normally be done as a test — do NOT do in production):
-- node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql
-- SELECT is_enabled FROM admin_feature_flags WHERE flag_key = 'ADMIN_PLATFORM_ENABLED';
-- Expected: still 1 (INSERT IGNORE did not overwrite)
-- Reset: UPDATE admin_feature_flags SET is_enabled = 0 WHERE flag_key = 'ADMIN_PLATFORM_ENABLED';
```

### 7.6 Cache Key Namespace Verification

After backend is deployed and first `/features` request is made:

```bash
# Connect to Redis and verify feature flag keys are present under correct namespace
redis-cli KEYS "otofine:v1:dv*:admin:ff:ADMIN_*"
# Expected: up to 10 keys (one per flag that was resolved from DB)
# Key format: otofine:v1:dv1:admin:ff:ADMIN_RBAC_ENABLED

# Verify values are '0' for all flags
redis-cli GET "otofine:v1:dv1:admin:ff:ADMIN_PLATFORM_ENABLED"
# Expected: "0"

# Verify TTL is close to 60 seconds
redis-cli TTL "otofine:v1:dv1:admin:ff:ADMIN_PLATFORM_ENABLED"
# Expected: 1-60 (seconds remaining from first write)
```

---

## 8. Rollout Procedure

### 8.1 Complete Ordered Rollout

```
STAGE 1 — Migration dry run
  Command: node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql --dry-run
  Gate: exits 0 with WOULD APPLY message

STAGE 2 — Migration live run
  Command: node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql
  Gate: exits 0 with OK message, no drift warnings

STAGE 3 — Migration validation
  Commands: run all 4 validation queries from §7.3
  Gate: all 4 pass — 10 rows present, created_at column exists, 2 schema_migrations rows

STAGE 4 — Write all backend code (phases B1–B5 from §2)
  No gate here — code review instead

STAGE 5 — Write server.js and package.json changes (B6, B7)
  No gate — additive changes reviewed

STAGE 6 — Write .env additions (B8)
  Append 10 ADMIN_*=false lines

STAGE 7 — Pre-restart syntax and barrel checks (§6.1)
  Command 1: node --check server.js
  Command 2: node -e "import('./modules/admin/index.js').then(...)"
  Gate: BOTH exit 0 — DO NOT proceed to Stage 8 if either fails

STAGE 8 — PM2 restart
  Command: pm2 restart otofine-backend
  Gate: pm2 status shows online; logs show [api] listening; no ERROR lines

STAGE 9 — Backend smoke tests (§8.3)
  Gate: all smoke tests pass — DO NOT proceed to Stage 10 if any fail

STAGE 10 — Write frontend files (phases C1, C2 from §2)
  No gate — code review

STAGE 11 — Frontend build
  Command: npm run build (in frontend/)
  Gate: exits 0 with no TypeScript or compilation errors

STAGE 12 — PM2 restart frontend
  Command: pm2 restart otofine-frontend
  Gate: pm2 status shows online

STAGE 13 — Full regression (§8.4)
  Gate: all regression checks pass
```

### 8.2 Stage-by-Stage Gate Table

| Stage | Gate condition | On failure |
|---|---|---|
| After Stage 1 | Dry run exits 0 | Fix SQL file, re-run |
| After Stage 2 | Migration exits 0 | See §7.4 rollback |
| After Stage 3 | All 4 validation queries pass | See §7.4 rollback; fix SQL |
| After Stage 7 | Both node checks exit 0 | Fix code error — do NOT restart PM2 |
| After Stage 8 | Backend online, no errors in logs | §8.7 code rollback immediately |
| After Stage 9 | All smoke tests pass | §8.7 code rollback |
| After Stage 11 | Build exits 0 | Fix frontend code |
| After Stage 12 | Frontend online | Restart only; rollback if build broke |
| After Stage 13 | All regression passes | §8.7 code + migration rollback if storefront affected |

### 8.3 Backend Smoke Tests

```bash
# T1: /features endpoint requires auth (route is mounted and auth middleware is active)
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/platform/features
# Expected: 401

# T2: /features endpoint returns correct all-false payload with valid admin JWT
curl -s https://otofine.com/api/admin/platform/features \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
# Expected: 200 with JSON object containing 10 keys, all false values
# platformEnabled, rbacEnabled, auditLogEnabled, moderationEnabled, billingEnabled,
# analyticsEnabled, riskEngineEnabled, sellerCrmEnabled, paymentsEnabled,
# subscriptionEnforcementEnabled — all false

# T3: Existing admin routes unaffected
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/shops \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200

# T4: Admin login unaffected
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://otofine.com/api/admin/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}'
# Expected: 401 or 400 (not 500 — endpoint still functional)

# T5: No unauthorized access to /features
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/platform/features \
  -H "Authorization: Bearer $SELLER_TOKEN"
# Expected: 403 (valid JWT but not admin role)
```

### 8.4 Full Regression Checks

```bash
# R1: Storefront page load
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/
# Expected: 200

# R2: Wildcard subdomain
curl -s -o /dev/null -w "%{http_code}" https://testshop.otofine.com/
# Expected: 200

# R3: Product detail page
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/san-pham/[any-slug]
# Expected: 200

# R4: RFQ endpoint
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/api/rfq/[any-public-endpoint]
# Expected: 200 or 401/403 (not 500)

# R5: Seller dashboard API
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/shop/products \
  -H "Authorization: Bearer $SELLER_TOKEN"
# Expected: 200 or 401 (not 500)
```

### 8.5 `package.json` Script Additions

Two new scripts in the `"scripts"` block — exact values:

```json
"migrate:admin:ff":      "node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql",
"migrate:admin:ff:dry":  "node scripts/run-admin-migration.js --file 055_admin_feature_flags.sql --dry-run"
```

These mirror the naming pattern of `migrate:admin:foundation` and `migrate:admin:foundation:dry` from Slice 1.

### 8.6 `.env` Additions

Append exactly these 10 lines to `backend/.env`. Do not modify or reorder any existing lines:

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

### 8.7 Code Rollback Procedure

If backend startup fails or regressions are detected:

```bash
# Step 1: Revert all code changes
cd /var/www/otofine/backend
git checkout {LAST_STABLE_COMMIT} -- server.js package.json

# Step 2: Remove the new modules/admin directory
rm -rf backend/modules/admin/

# Step 3: Remove ADMIN_* lines from .env (do not touch other vars)
# Manually edit backend/.env and remove the 10 ADMIN_*=false lines added in §8.6

# Step 4: Restart
pm2 restart otofine-backend

# Step 5: Verify recovery
pm2 status otofine-backend
# Expected: online
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/api/admin/shops \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200

# Step 6: If migration rollback also needed (only if DB state caused the issue)
# See §7.4
```

---

## 9. Hidden-State Guarantees

### 9.1 All Flags False — Zero Behavior Change

When all 10 flags are `false` (Slice 2 initial state), the following surfaces are completely unaffected and unchanged:

| Surface | Guarantee |
|---|---|
| Storefront page rendering | No code path change — reads no admin tables, consults no admin service |
| Wildcard subdomain routing | Not touched — `middleware.js` is unchanged |
| SEO metadata generation | Not touched — all SEO routes are unchanged |
| RFQ dispatch | Not touched — RFQ module code is unchanged |
| Seller dashboard | Not touched — shop routes are unchanged |
| Existing admin routes | Not touched — `admin.routes.js` is unchanged |
| Product listing / search | Not touched — Typesense and product queries unchanged |
| Analytics / background jobs | Not touched — scheduler and workers unchanged |

### 9.2 No Production UI Changes

- `AdminPlatformProvider` is a new file but is imported by no existing page, layout, or component in Slice 2
- `useAdminPlatform` is a new file but is called by no existing component in Slice 2
- Next.js build tree-shakes both files if no component imports them
- No visible admin UI, sidebar, navigation item, or route is added to the frontend in Slice 2

### 9.3 No Route Leakage

- `GET /api/admin/platform/features` is the only new live API endpoint
- It returns `401` to all unauthenticated requests
- It returns `403` to requests with valid non-admin JWTs (seller tokens)
- It returns `200` only to requests with a valid admin JWT
- No storefront URL, no public API endpoint, and no seller endpoint is added

### 9.4 No Admin Platform Activation

- `ADMIN_PLATFORM_ENABLED = false` means the catch-all gate in `platform.admin.routes.js` blocks all future module routes (Slice 3+)
- The startup-time `adminPlatformConfig.platformEnabled = false` means no gated route handlers are installed at process start
- No admin UI feature, moderation queue, billing plan, or RBAC permission check is active
- The only observable effect of Slice 2 is that `GET /api/admin/platform/features` exists and returns all-false JSON

---

## 10. Edge-Case Handling Plan

### 10.1 Redis Unavailable at Startup

**Condition:** Redis is not configured or not reachable when `otofine-backend` starts.

**Behavior:**
- `redisCache.service.js` returns `null` from `createRedis()` — no crash
- All `getRaw` calls fall through to in-memory LRU store
- LRU miss on first call → DB query → LRU write
- Feature flag reads work correctly via LRU + DB path
- No startup failure, no log error for the feature flag service specifically

**Detection:** `pm2 logs otofine-backend` shows `[redisCache] ...` warnings. Feature flags still return correct values.

**Action required:** None — feature flag service is functional without Redis.

### 10.2 Redis Fails After Startup

**Condition:** Redis was available at startup but disconnects during operation.

**Behavior:**
- `redisDisabled = true` is set in `redisCache.service.js` (module-level state)
- All subsequent cache operations fall through to LRU + DB
- LRU entries from before the failure continue to serve until expiry
- After LRU expiry, DB is queried directly on every flag check
- `redisDisabled` remains `true` for the process lifetime — PM2 restart required to re-enable Redis

**Action required:** Investigate Redis failure. PM2 restart re-enables Redis after Redis recovers.

### 10.3 DB Unavailable When `/features` is Called

**Condition:** MySQL pool cannot connect or query times out.

**Behavior:**
1. `pool.query` throws inside `getAllFlagStates`
2. Caught by try/catch — `dbMap` = `{}`
3. All 10 flags fall back to `adminPlatformConfig` (ENV values, all `false`)
4. Nothing is written to cache (correct — no stale data)
5. Endpoint responds with 200 and all-false JSON
6. Warning logged: operator should check DB connectivity

**Admin impact:** Admin operator sees all features as disabled. Functionally correct for Slice 2 since all flags are `false` regardless.

**Storefront/seller impact:** None — DB pool is shared but the feature flag query is lightweight and read-only. A pool exhaustion scenario would affect all pool consumers, not just feature flags.

### 10.4 Stale Cache — Flag Changed in DB Within TTL Window

**Relevant for Slice 3+ only** (all flags are `false` in Slice 2).

**Scenario:** `ADMIN_RBAC_ENABLED` set to `1` in DB, then set back to `0` within 60 seconds.

**Behavior:** Redis continues serving `'1'` for up to 60 seconds remaining in the TTL. Maximum stale window = 60 seconds.

**Mitigation (Slice 3+):** Call `invalidateFlagCache('ADMIN_RBAC_ENABLED')` immediately after any DB UPDATE. This function is exported from `featureFlag.service.js` starting in Slice 2.

### 10.5 FLAG_KEY_MAP / DEFAULT_FLAGS Key Mismatch

**Condition:** Backend `FLAG_KEY_MAP` maps `'ADMIN_RBAC_ENABLED' → 'rbacEnabled'` but frontend `DEFAULT_FLAGS` uses `'rbac_enabled'` instead.

**Behavior:** The `rbacEnabled` property in the API response is not present in `DEFAULT_FLAGS`. The frontend context initializes with `rbac_enabled: false`. When the API response arrives, the `rbacEnabled` key is not recognized and the context remains at `rbac_enabled: false` regardless of the actual flag state.

**Detection:** Only detectable by manually comparing the backend response keys against the frontend DEFAULT_FLAGS keys. No build error, no runtime error.

**Prevention:** §12 item 7 — side-by-side review of `FLAG_KEY_MAP` and `DEFAULT_FLAGS` before deployment.

### 10.6 Unknown Flag Key Called at Runtime

**Condition:** A caller invokes `isFeatureEnabled('NONEXISTENT_FLAG')`.

**Behavior:**
1. Redis miss (never cached)
2. DB query returns no row
3. `FLAG_KEY_MAP['NONEXISTENT_FLAG']` = `undefined`
4. `adminPlatformConfig[undefined]` = `undefined`
5. `undefined ?? false` = `false`
6. Returns `false`

No error, no exception. Unknown keys always return `false`. Safe.

### 10.7 `055_admin_feature_flags.sql` Drift (File Modified After Application)

**Condition:** The SQL file is edited after being applied. Checksum stored in `schema_migrations` no longer matches.

**Behavior:** Next time `run-admin-migration.js` is run with this file, it detects drift:
```
[admin-migration] DRIFT WARNING: 055_admin_feature_flags.sql
  Recorded checksum : abc123...
  Current checksum  : def456...
```
Runner exits with code 2. No SQL is executed. Operator must investigate before proceeding.

**Action required:** Compare old and new file content. If the change is intentional (e.g., design patch R6 adding `created_at` was applied to the file after an earlier test run), the migration was applied without `created_at` — a new migration (`056_add_created_at_to_feature_flags.sql`) is needed to add the column via ALTER TABLE.

This is the primary reason the 055 SQL file must be rewritten BEFORE the first production run (see §1.3).

### 10.8 `setRaw` Called with `60` Instead of `60_000`

**Condition:** Implementation bug — TTL passed as seconds instead of milliseconds.

**Behavior:** `Math.max(1, Math.ceil(60 / 1000))` = `1`. Each flag cache entry expires after 1 second. Every admin request to `/features` hits the DB directly. No error, no warning.

**Detection:** Only detectable by monitoring Redis TTL values (`redis-cli TTL key`) or noticing unusually high DB query rates from the admin endpoint.

**Prevention:** §12 item 8 — verify `FLAG_CACHE_TTL_MS = 60_000` constant is defined and all `setRaw` calls reference it rather than using the literal `60`.

---

## 11. Explicit Implementation Constraints

### 11.1 Forbidden Modifications

These files must not be modified in Slice 2 (additive changes to `server.js`, `package.json`, and `.env` are permitted per §3.2):

| File | Reason |
|---|---|
| `backend/routes/admin.routes.js` | Existing admin routes — zero change |
| `backend/domains/auth/middlewares/auth.middleware.js` | Auth logic — zero change |
| `backend/middlewares/auth.js` | Auth shim — zero change |
| `backend/services/redisCache.service.js` | Redis service — consumed read-only |
| `backend/config/db.js` | DB pool — consumed read-only |
| `backend/scripts/run-admin-migration.js` | Migration runner — already contains 055 in ADMIN_MIGRATION_FILES |
| `backend/migrations/051_schema_migrations.sql` | Slice 1 deployed migration |
| `backend/migrations/051_schema_migrations.rollback.sql` | Slice 1 rollback |
| All `frontend/app/**` files | No admin layout/page changes in Slice 2 |
| All `frontend/middleware.js` | Wildcard routing — zero change |
| All storefront component files | Zero change |
| All RFQ module files | Zero change |
| All SEO route files | Zero change |

### 11.2 Forbidden Imports

New files under `backend/modules/admin/` must NOT import from:

| Forbidden import | Reason |
|---|---|
| Any storefront service | Admin module must not couple to storefront logic |
| Any RFQ module | Admin module must not couple to RFQ flows |
| Any SEO service | Admin module must not couple to SEO chains |
| Any seller-facing controller | Admin module must not couple to seller flows |
| `node_modules` packages not already in `package.json` | No new backend dependencies in Slice 2 |

New frontend files must NOT import from:

| Forbidden import | Reason |
|---|---|
| Any Next.js server-only API (`fs`, `path`, etc.) | Context file is `'use client'` |
| Any existing admin page component | Context is a scaffold — not mounted by anything |
| The backend API directly | Context accepts `initialFlags` prop — no fetch call inside context |

### 11.3 Forbidden Routing Changes

- Do not add any route under `/api/admin/platform/` other than `/features` in Slice 2
- Do not modify `app.use('/api/admin', adminRoutes)` or any existing route mount order
- Do not add any frontend page, layout, or route under `frontend/app/admin/` in Slice 2
- Do not add any Next.js middleware rule for admin routes in Slice 2

### 11.4 Forbidden Coupling

- `featureFlag.service.js` must not be imported by any existing service, controller, or route outside `modules/admin/`
- `adminPlatform.config.js` must not be imported by any existing service, controller, or route outside `modules/admin/`
- No admin flag state must be consulted in storefront rendering, SEO generation, wildcard subdomain logic, or RFQ dispatch in Slice 2

### 11.5 Required Constraints Summary

| Constraint | Where enforced |
|---|---|
| `export default router` in all route files | §3.1, §5.1 |
| `/features` registered before platform gate | §5.1 |
| `FLAG_CACHE_TTL_MS = 60_000` constant, not literal `60` | §4.4, §3.5 of design |
| ENV fallback values NOT cached | §4.1, §2.1 of design (C1) |
| Bulk invalidation uses prefix `admin:ff:ADMIN_` | §4.5, §5.2 of design (C2) |
| `getAllFlagStates` includes DB-only cache warming loop | §4.2, §4.5 of design (C3) |
| mysql2 IN() uses `[ALL_FLAG_KEYS]` double-nested array | §4.2, §10.9 of design |
| `created_at` column in 055 SQL before migration runs | §1.3, §7.1 |
| FLAG_KEY_MAP and DEFAULT_FLAGS reviewed side-by-side | §12 item 7 |
| `node --check` + barrel check before PM2 restart | §6.1 |

---

## 12. Implementation Review Checklist

Use this checklist before marking Slice 2 as complete and before triggering the PM2 restart gate.

### Database

- [ ] `055_admin_feature_flags.sql` contains `created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
- [ ] `055_admin_feature_flags.sql` contains all 10 `INSERT IGNORE` seed rows
- [ ] All 10 seed rows have `is_enabled = 0`
- [ ] No FK constraints exist in the migration (no `REFERENCES` keyword)
- [ ] Dry run executes without error

### `adminPlatform.config.js`

- [ ] `FLAG_CACHE_TTL_MS = 60_000` is defined as a named constant (not `60`)
- [ ] `FLAG_KEY_MAP` contains exactly 10 entries
- [ ] All camelCase values in `FLAG_KEY_MAP` exactly match keys in frontend `DEFAULT_FLAGS`
- [ ] `ALL_FLAG_KEYS` is derived from `Object.keys(FLAG_KEY_MAP)` (or equivalent)
- [ ] `adminPlatformConfig` is frozen (`Object.freeze(...)`)
- [ ] No `dotenv.config()` call in this file

### `featureFlag.service.js`

- [ ] All `setRaw` calls use `FLAG_CACHE_TTL_MS` (not the literal `60` or `60000`)
- [ ] ENV fallback values are NOT passed to `setRaw` (C1)
- [ ] `getAllFlagStates` DB warming loop iterates only DB-resolved values
- [ ] `getAllFlagStates` uses `pool.query(sql, [ALL_FLAG_KEYS])` — double-nested array for IN()
- [ ] `invalidateFlagCache(null)` calls `invalidateByLogicalPrefix('admin:ff:ADMIN_')`
- [ ] `invalidateFlagCache('ADMIN_X')` calls `invalidateByLogicalPrefix('admin:ff:ADMIN_X')`
- [ ] All async DB/Redis operations are wrapped in try/catch or `.catch(() => {})`
- [ ] No import of any storefront, RFQ, SEO, or seller service

### `platform.admin.routes.js`

- [ ] File uses `export default router` (not named export)
- [ ] `router.get('/features', ...)` is registered BEFORE any platform-enabled catch-all
- [ ] Auth middleware order: `requireAuth` then `requireAdmin` then `getFeatures`
- [ ] No other routes are registered in this file in Slice 2

### `admin/index.js`

- [ ] Re-exports `platformRouter` using `export { default as platformRouter } from '...'`
- [ ] `platformRouter` value is verified as non-undefined by barrel check (§6.1)

### `server.js`

- [ ] Import line added after existing last import
- [ ] `app.use('/api/admin/platform', platformRouter)` placed after `mountRfqRoutes(app)` and before `app.listen`
- [ ] No existing lines modified
- [ ] `node --check server.js` exits 0

### `package.json`

- [ ] `migrate:admin:ff` script targets `055_admin_feature_flags.sql`
- [ ] `migrate:admin:ff:dry` script targets `055_admin_feature_flags.sql --dry-run`
- [ ] No existing script modified

### `.env`

- [ ] All 10 `ADMIN_*=false` lines appended (not prepended, not inserted)
- [ ] No existing env var modified or removed

### Frontend `AdminPlatformContext.js`

- [ ] `'use client'` directive at top of file
- [ ] `DEFAULT_FLAGS` keys exactly match all 10 camelCase values in `FLAG_KEY_MAP`
- [ ] `AdminPlatformProvider` accepts `initialFlags` prop
- [ ] No `useEffect` fetch inside the provider — context is prop-initialized only
- [ ] File is not imported by any existing page, layout, or component

### Frontend `useAdminPlatform.js`

- [ ] Calls `useAdminPlatformContext` from `AdminPlatformContext.js`
- [ ] No direct API call inside the hook
- [ ] Not imported by any existing component

### Post-Deploy Verification

- [ ] Migration §7.3 validation queries: all 4 pass
- [ ] Backend smoke tests §8.3: all 5 pass (T1–T5)
- [ ] Full regression §8.4: all 5 pass (R1–R5)
- [ ] Redis key namespace verified (§7.6)
