# Otofine — Phase 1 Admin Foundation Execution Runbook

> **Document type:** Operational execution runbook  
> **Phase:** Phase 1 — Admin Foundation (RBAC + Audit Log + Feature Flags)  
> **Date created:** 2026-05-26  
> **Sources:** All 5 system-audit documents + `admin-platform-architecture.md` + `admin-foundation-implementation-plan.md`  
> **Execution mode:** Manual shell operations. No CI/CD pipeline. Single server.

---

## RUNBOOK STATUS TRACKER

Copy this block to a separate working doc before starting. Check each item as completed.

```
[ ] STAGE 0: Pre-deploy checklist complete — cleared for execution
[ ] STAGE 1: Migrations applied — all 6 tables created
[ ] STAGE 2: Backend code deployed — module on disk
[ ] STAGE 3: Backend .env updated — all new vars added
[ ] STAGE 4: Backend restarted — flags ALL FALSE
[ ] STAGE 5: Backend smoke test — existing routes pass
[ ] STAGE 6: Frontend code deployed
[ ] STAGE 7: Frontend build completed
[ ] STAGE 8: Frontend restarted
[ ] STAGE 9: Frontend regression test — storefront passes
[ ] STAGE 10: RBAC flag enabled + verified
[ ] STAGE 11: Audit log flag enabled + verified
[ ] STAGE 12: Permissions seeded
[ ] STAGE 13: Full success criteria met
```

---

## QUICK REFERENCE

| Item | Value |
|---|---|
| Backend path | `/var/www/otofine/backend` |
| Frontend path | `/var/www/otofine/frontend` |
| Backend port | `5000` |
| Frontend port | `3000` |
| Backend PM2 name | `otofine-backend` |
| Frontend PM2 name | `otofine-frontend` |
| Backend .env | `/var/www/otofine/backend/.env` |
| Frontend .env | `/var/www/otofine/frontend/.env.local` |
| Admin login URL | `https://otofine.com/admin/login` |
| Admin API base | `https://otofine.com/api/admin` |
| Migrations dir | `/var/www/otofine/backend/migrations/` |
| Migration runner | `node scripts/run-admin-migration.js` |

---

## Table of Contents

1. [Pre-Deploy Checklist](#1-pre-deploy-checklist)
2. [Migration Execution Procedure](#2-migration-execution-procedure)
3. [Backend Rollout Procedure](#3-backend-rollout-procedure)
4. [Frontend Rollout Procedure](#4-frontend-rollout-procedure)
5. [RBAC Rollout Verification](#5-rbac-rollout-verification)
6. [Smoke Test Procedures](#6-smoke-test-procedures)
7. [Rollback Triggers](#7-rollback-triggers)
8. [Rollback Procedure](#8-rollback-procedure)
9. [Feature Flag Activation Sequence](#9-feature-flag-activation-sequence)
10. [Production Safety Constraints](#10-production-safety-constraints)
11. [Success Criteria](#11-success-criteria)

---

## 1. Pre-Deploy Checklist

> **GATE:** All items in §1 must be confirmed before any Stage proceeds.  
> If any item cannot be confirmed, **STOP** and resolve before continuing.

### 1.1 Timing and Coordination

```
[ ] Choose a low-traffic window (weekday, non-peak hours — recommend 22:00–02:00 ICT)
[ ] Confirm no active RFQ dispatch runs expected during the window
[ ] Confirm no external integrations scheduled (Zalo OA, OneSignal) during the window
[ ] Notify team that admin panel will be briefly unavailable during PM2 restarts (~3s each)
```

### 1.2 Backup Verification

```
[ ] Confirm a recent DB backup exists (within 24 hours)

    Check existing backup directories:
    ls -la /var/www/otofine/backend_backup_*/
    
    Expected: At least one directory with today's or yesterday's timestamp.
    Existing snapshots confirmed: backend_backup_20260519/, backend_backup_20260524_0811/
    
    If no recent backup: take a fresh DB dump before proceeding:
    mysqldump -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} > /tmp/otofine_pre_admin_foundation_$(date +%Y%m%d_%H%M).sql
    
    Verify dump is non-empty:
    ls -lh /tmp/otofine_pre_admin_foundation_*.sql
    # Expected: file size > 0 bytes

[ ] Note current PM2 restart counts for baseline comparison:
    pm2 jlist | grep -E '"name"|"restart_time"'
    
    Record values:
      otofine-frontend restart_time: ___
      otofine-backend  restart_time: ___
    
    (At audit time: frontend=127, backend=141 — values may differ now)
```

### 1.3 PM2 State Verification

```
[ ] List all running PM2 processes:
    pm2 list
    
    Expected status: otofine-frontend (online), otofine-backend (online)
    Record current state including restart counts.

[ ] Confirm critical workers are online:
    pm2 list | grep -E "rfq|otofine"
    
    Expected: rfq-buyer-reminder-worker (online), rfq-escalation-worker (online)
    Note: rfq-auto-wave-worker-prod and backend-rfq-dev have known stale cwd issues.
    Do NOT attempt to fix these during Phase 1 — document state only.

[ ] Confirm no process is in an errored restart loop:
    pm2 list | grep -v "online"
    
    If stale processes appear: document but do not modify.
    Phase 1 does NOT touch existing PM2 configuration.
```

### 1.4 Redis Verification

```
[ ] Confirm Redis is responding:
    redis-cli ping
    # Expected: PONG

[ ] Check Redis memory usage:
    redis-cli info memory | grep used_memory_human
    # Record value. Verify not near maxmemory limit.

[ ] Check existing cache key count:
    redis-cli dbsize
    # Record count (e.g. "1247"). Used for regression check after deploy.
```

### 1.5 Database Verification

```
[ ] Confirm MySQL is reachable:
    mysql -u{DB_USER} -p{DB_PASSWORD} -e "SELECT 1;" {DB_NAME}
    # Expected: returns 1

[ ] Record baseline table counts (for post-migration regression):
    mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} -e "
      SELECT 'products'    AS tbl, COUNT(*) AS cnt FROM products    UNION ALL
      SELECT 'shops',              COUNT(*)          FROM shops       UNION ALL
      SELECT 'rfq_requests',       COUNT(*)          FROM rfq_requests UNION ALL
      SELECT 'shop_accounts',      COUNT(*)          FROM shop_accounts;
    "
    
    Record results:
      products:     ___
      shops:        ___
      rfq_requests: ___
      shop_accounts: ___

[ ] Confirm NO admin-platform tables exist yet (clean state):
    mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} -e "
      SHOW TABLES LIKE 'admin_%';
      SHOW TABLES LIKE 'schema_migrations';
    "
    # Expected: 0 rows for both queries.
    # If rows ARE returned: stop — investigate before proceeding.

[ ] Record index count on products table (regression baseline):
    mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} -e "
      SELECT COUNT(*) AS index_count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products';
    "
    Record: products index_count = ___
```

### 1.6 Typesense Verification

```
[ ] Confirm Typesense is reachable (if configured):
    curl -s "http://${TYPESENSE_HOST:-localhost}:${TYPESENSE_PORT:-8108}/health" \
      -H "X-TYPESENSE-API-KEY: ${TYPESENSE_API_KEY}"
    # Expected: {"ok":true}
    # If Typesense is unreachable: Phase 1 can still proceed (search falls back to MySQL).
    # Document status — do not attempt to fix.

[ ] Confirm product collection document count (baseline):
    curl -s "http://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${TYPESENSE_PRODUCT_COLLECTION:-otofine_products}" \
      -H "X-TYPESENSE-API-KEY: ${TYPESENSE_API_KEY}" | python3 -m json.tool | grep num_documents
    Record: Typesense product count = ___
```

### 1.7 Branch and Code Verification

```
[ ] Confirm current git branch and clean state:
    cd /var/www/otofine
    git status
    git log --oneline -5
    
    Expected: on the correct deployment branch, no unexpected uncommitted changes.

[ ] Confirm Phase 1 code is present (new module directory exists):
    ls /var/www/otofine/backend/modules/admin/
    # Expected: index.js, config/, core/, platform/, shared/ (or equivalent)
    # If NOT present: code has not been deployed yet — proceed to Stage 2 after this checklist.

[ ] Confirm new migration files are present:
    ls /var/www/otofine/backend/migrations/05*.sql
    # Expected: 6 files: 051_schema_migrations.sql through 056_admin_job_queue.sql
    # If files are missing: do NOT proceed — code is incomplete.

[ ] Verify NO changes to protected files:
    cd /var/www/otofine
    git diff HEAD -- \
      frontend/middleware.js \
      frontend/lib/shopHost.js \
      frontend/next.config.mjs \
      backend/domains/auth/middlewares/auth.middleware.js \
      backend/domains/shopPublic/ \
      backend/modules/rfq/ \
      backend/routes/admin.routes.js \
      backend/services/product.service.js
    # Expected: EMPTY output (zero diff on all protected files).
    # If ANY diff appears: STOP — do not deploy until resolved.

[ ] Verify server.js change is ONLY the additive append:
    git diff HEAD -- backend/server.js
    # Expected: only additions at end of file (import + 3 app.use() lines).
    # If deletions or modifications to existing lines appear: STOP.
```

### 1.8 Pre-Deploy Decision Gate

```
ALL checklist items above must be:
  ✓ Confirmed (pass)   → Proceed to Stage 1: Migrations
  ✗ Any item fails     → STOP. Resolve issue before continuing.
  ? Any item unclear   → STOP. Clarify before continuing.

Time estimate for §1: 15–20 minutes.
```

---

## 2. Migration Execution Procedure

> **GATE:** §1 Pre-deploy checklist must be fully cleared before running migrations.  
> Migrations modify the database. Once applied, rollback requires explicit down-migration SQL.

### 2.1 Pre-Migration State Snapshot

```bash
# Save complete list of current tables to a file for rollback comparison
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} \
  -e "SHOW TABLES;" > /tmp/otofine_tables_pre_migration.txt

cat /tmp/otofine_tables_pre_migration.txt
# Record: total table count = ___
```

### 2.2 Dry-Run Verification

Before applying migrations, verify the runner logic without committing:

```bash
cd /var/www/otofine/backend

# Verify the migration runner file exists and is syntactically valid
node --check scripts/run-admin-migration.js
# Expected: no output (no syntax errors)

# List which migration files the runner would apply:
ls migrations/05*.sql
# Expected 6 files:
#   051_schema_migrations.sql
#   052_admin_accounts.sql
#   053_admin_rbac.sql
#   054_admin_audit_log.sql
#   055_admin_feature_flags.sql
#   056_admin_job_queue.sql
```

### 2.3 Migration Execution — Step by Step

Apply migrations individually, validating after each one. Do NOT run all six at once.

---

#### Step M1: Apply `051_schema_migrations.sql`

```bash
cd /var/www/otofine/backend
node scripts/run-admin-migration.js --file 051_schema_migrations.sql
# (If runner does not support --file flag: apply SQL directly)
# mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} < migrations/051_schema_migrations.sql
```

**Validation:**
```sql
-- Confirm table exists
SHOW TABLES LIKE 'schema_migrations';
-- Expected: 1 row

-- Confirm structure
DESCRIBE schema_migrations;
-- Expected: id, filename, applied_at, checksum columns

-- Confirm runner recorded it (if using state-tracking runner)
SELECT * FROM schema_migrations;
-- Expected: 1 row with filename='051_schema_migrations.sql'
```

**PASS if:** `schema_migrations` table exists with correct columns.  
**FAIL if:** Table does not exist or query errors. → Execute rollback M1 (§8.1).

---

#### Step M2: Apply `052_admin_accounts.sql`

```bash
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} < migrations/052_admin_accounts.sql
```

**Validation:**
```sql
SHOW TABLES LIKE 'admin_accounts';
-- Expected: 1 row

DESCRIBE admin_accounts;
-- Expected columns: id, email, password_hash, display_name, is_active,
--                   last_login_at, created_by, created_at, updated_at

-- Confirm no existing tables were affected:
SELECT COUNT(*) FROM shops;       -- Must equal baseline count from §1.5
SELECT COUNT(*) FROM products;    -- Must equal baseline count from §1.5
```

**PASS if:** `admin_accounts` exists; baseline counts unchanged.  
**FAIL if:** Any error, or baseline counts changed. → Rollback M2 (§8.1).

---

#### Step M3: Apply `053_admin_rbac.sql`

```bash
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} < migrations/053_admin_rbac.sql
```

**Validation:**
```sql
-- Confirm all 4 tables created
SHOW TABLES LIKE 'admin_role%';
-- Expected: admin_role_permissions, admin_roles

SHOW TABLES LIKE 'admin_account_roles';
-- Expected: 1 row

SHOW TABLES LIKE 'admin_permissions';
-- Expected: 1 row

-- Confirm system roles were seeded
SELECT id, name, is_system FROM admin_roles ORDER BY id;
-- Expected: 5 rows
--   1 | superadmin    | 1
--   2 | moderator     | 1
--   3 | support       | 1
--   4 | analyst       | 1
--   5 | billing_admin | 1

-- Confirm admin_permissions table is empty (populated later via API)
SELECT COUNT(*) FROM admin_permissions;
-- Expected: 0 (populated by POST /api/admin/rbac/permissions/sync in Stage 12)

-- Confirm FK constraints are intact
SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('admin_role_permissions', 'admin_account_roles')
  AND REFERENCED_TABLE_NAME IS NOT NULL;
-- Expected: 4 rows (2 FKs per table)
```

**PASS if:** All 4 tables exist; 5 system roles seeded; FK constraints present.  
**FAIL if:** Any error, missing tables, or wrong role count. → Rollback M3 then M2 (§8.1).

---

#### Step M4: Apply `054_admin_audit_log.sql`

```bash
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} < migrations/054_admin_audit_log.sql
```

**Validation:**
```sql
SHOW TABLES LIKE 'admin_audit_log';
-- Expected: 1 row

DESCRIBE admin_audit_log;
-- Expected columns: id, request_id, admin_id, actor_type, action, target_type,
--                   target_id, target_label, before_json, after_json,
--                   ip_address, user_agent, metadata_json, created_at

-- Confirm NO FK constraint on admin_id (intentional — see plan §3.6)
SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'admin_audit_log'
  AND REFERENCED_TABLE_NAME IS NOT NULL;
-- Expected: 0 (no FKs — intentional)

-- Confirm indexes exist
SHOW INDEX FROM admin_audit_log;
-- Expected indexes: PRIMARY, idx_aal_admin_id, idx_aal_action, idx_aal_target,
--                   idx_aal_created, idx_aal_request_id
```

**PASS if:** Table exists with correct columns and indexes; no FK constraints.  
**FAIL if:** Table missing or any column incorrect. → Rollback M4, M3, M2 (§8.1).

---

#### Step M5: Apply `055_admin_feature_flags.sql`

```bash
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} < migrations/055_admin_feature_flags.sql
```

**Validation:**
```sql
SHOW TABLES LIKE 'admin_feature_flags';
-- Expected: 1 row

-- Confirm seed data inserted
SELECT flag_key, is_enabled FROM admin_feature_flags ORDER BY flag_key;
-- Expected: 10 rows, ALL is_enabled = 0
-- Row list:
--   ADMIN_ANALYTICS_ENABLED              | 0
--   ADMIN_AUDIT_LOG_ENABLED              | 0
--   ADMIN_BILLING_ENABLED                | 0
--   ADMIN_PRODUCT_MODERATION_DEFAULT     | 0
--   ADMIN_PRODUCT_MODERATION_ENABLED     | 0
--   ADMIN_RBAC_ENABLED                   | 0
--   ADMIN_RISK_ENGINE_ENABLED            | 0
--   ADMIN_SELLER_CRM_ENABLED             | 0
--   ADMIN_SHOP_MODERATION_ENABLED        | 0
--   ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED | 0
```

**PASS if:** Table exists; exactly 10 rows; all `is_enabled = 0`.  
**FAIL if:** Table missing, wrong row count, or any `is_enabled = 1`. → Rollback M5, M4, M3, M2 (§8.1).

---

#### Step M6: Apply `056_admin_job_queue.sql`

```bash
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} < migrations/056_admin_job_queue.sql
```

**Validation:**
```sql
SHOW TABLES LIKE 'admin_job_queue';
-- Expected: 1 row

-- Confirm SKIP LOCKED-compatible indexes
SHOW INDEX FROM admin_job_queue;
-- Expected: PRIMARY, uq_ajq_idempotency, idx_ajq_status_run, idx_ajq_job_type, idx_ajq_locked

-- Confirm table is empty
SELECT COUNT(*) FROM admin_job_queue;
-- Expected: 0
```

**PASS if:** Table exists with correct indexes; empty.  
**FAIL if:** Table missing or indexes incorrect. → Rollback M6, M5, M4, M3, M2 (§8.1).

---

### 2.4 Post-Migration Full Verification

After all 6 migrations are applied:

```sql
-- Verify all 9 new tables exist
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'schema_migrations',
    'admin_accounts',
    'admin_roles',
    'admin_permissions',
    'admin_role_permissions',
    'admin_account_roles',
    'admin_audit_log',
    'admin_feature_flags',
    'admin_job_queue'
  )
ORDER BY TABLE_NAME;
-- Expected: 9 rows
```

```sql
-- Regression: confirm existing table counts are UNCHANGED
SELECT 'products'     AS tbl, COUNT(*) AS cnt FROM products     UNION ALL
SELECT 'shops',               COUNT(*)          FROM shops        UNION ALL
SELECT 'rfq_requests',        COUNT(*)          FROM rfq_requests  UNION ALL
SELECT 'shop_accounts',       COUNT(*)          FROM shop_accounts;
-- Expected: ALL counts match §1.5 baseline exactly
```

```sql
-- Regression: confirm products index count is UNCHANGED
SELECT COUNT(*) AS index_count
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'products';
-- Expected: equals the value recorded in §1.5
```

**Stage 1 PASS if:** All 9 tables confirmed; all baseline counts match; product index count unchanged.  
**Stage 1 FAIL if:** Any count mismatch or missing table. → Full rollback §8.1 before continuing.

```
[ ] STAGE 1 COMPLETE: Tick box and record completion time ___________
```

---

## 3. Backend Rollout Procedure

> **GATE:** Stage 1 (Migrations) must be marked COMPLETE before proceeding.

### 3.1 Code State Verification

```bash
cd /var/www/otofine/backend

# Confirm new module is present on disk
ls modules/admin/index.js
# Expected: file exists (no "No such file" error)

ls modules/admin/core/rbac/
ls modules/admin/core/auditLog/
ls modules/admin/platform/
ls modules/admin/shared/
# Expected: all directories exist

# Confirm new migration runner exists
ls scripts/run-admin-migration.js
# Expected: file exists

# Confirm server.js has the additive append and ONLY the additive append
tail -20 server.js
# Expected: last lines contain the 3 new app.use() calls for rbac, audit-log, platform
# The rest of server.js must be identical to pre-deploy state

# Syntax check the full server.js
node --check server.js
# Expected: no output (no syntax errors)

# Syntax check the new module barrel
node --check modules/admin/index.js
# Expected: no output
```

### 3.2 Environment Variable Update

```bash
# Open the backend .env file
nano /var/www/otofine/backend/.env
# (or: vi /var/www/otofine/backend/.env)

# APPEND the following 10 lines at the end of the file.
# Do NOT modify any existing lines.
# Do NOT change any existing variable values.

# --- Admin Platform Feature Flags (Phase 1 Foundation) ---
ADMIN_RBAC_ENABLED=false
ADMIN_AUDIT_LOG_ENABLED=false
ADMIN_AUDIT_STRICT_MODE=false
ADMIN_SHOP_MODERATION_ENABLED=false
ADMIN_PRODUCT_MODERATION_ENABLED=false
ADMIN_BILLING_ENABLED=false
ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED=false
ADMIN_SELLER_CRM_ENABLED=false
ADMIN_RISK_ENGINE_ENABLED=false
ADMIN_ANALYTICS_ENABLED=false
# --- End Admin Platform Feature Flags ---
```

**Verification after saving:**
```bash
# Confirm all 10 new vars are present in .env
grep "ADMIN_" /var/www/otofine/backend/.env | wc -l
# Expected: 10

# Confirm all 10 are set to false
grep "ADMIN_" /var/www/otofine/backend/.env | grep -v "=false"
# Expected: empty output (all are false)

# Confirm no existing vars were changed
wc -c /var/www/otofine/backend/.env
# Expected: larger than 2950 bytes (the pre-deploy size from audit)
# Specifically: should be 2950 + ~420 bytes for the new block = ~3370 bytes

# Critical: confirm JWT_SECRET and DB credentials are still present
grep "JWT_SECRET" /var/www/otofine/backend/.env | wc -l
# Expected: 1
grep "DB_HOST" /var/www/otofine/backend/.env | wc -l
# Expected: 1
```

**PASS if:** 10 new vars present, all false; existing vars unchanged.  
**FAIL if:** Any existing var missing or changed. → Restore .env from backup before restarting.

### 3.3 Backend Restart

```bash
# Capture pre-restart state
pm2 list > /tmp/pm2_pre_backend_restart.txt

# Restart ONLY the backend — do NOT touch frontend or workers
pm2 restart otofine-backend

# Wait 5 seconds for startup
sleep 5

# Monitor startup logs for errors
pm2 logs otofine-backend --lines 30 --nostream

# Confirm process is online
pm2 list | grep otofine-backend
# Expected: status = online
```

**PASS if:** Process online; no ERROR/EXCEPTION lines in startup logs.  
**FAIL if:** Process enters errored state or crash loop. → Immediate rollback §8.2.

### 3.4 Backend Health Verification

```bash
# Test the Express backend responds on port 5000
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/health
# Expected: 200 (or whatever the existing health check returns)
# If /api/health does not exist: use an existing public endpoint instead:
curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:5000/api/public/shops?limit=1"
# Expected: 200
```

### 3.5 Hidden Route Verification (Flags OFF)

Verify all new admin platform routes return 404 when all flags are false:

```bash
# Get a valid admin token first
ADMIN_TOKEN=$(curl -s -X POST http://127.0.0.1:5000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "Token obtained: ${ADMIN_TOKEN:0:20}..."

# Test RBAC routes — should return 404 (flag is false)
curl -s -o /dev/null -w "%{http_code}" \
  http://127.0.0.1:5000/api/admin/rbac/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 404

# Test audit log routes — should return 404 (flag is false)
curl -s -o /dev/null -w "%{http_code}" \
  http://127.0.0.1:5000/api/admin/audit-log \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 404

# Test platform features endpoint — should return 200 (always-on, no flag gate)
curl -s \
  http://127.0.0.1:5000/api/admin/platform/features \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200 with JSON showing all flags false:
# {"rbacEnabled":false,"auditLogEnabled":false,...}
```

**PASS if:** RBAC and audit-log return 404; platform/features returns 200 with all flags false.  
**FAIL if:** Any unexpected status code or backend errors. → Diagnose before continuing.

### 3.6 Existing Admin Routes Regression Test

```bash
# Verify existing admin routes still function correctly

# 1. Admin login still works
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://127.0.0.1:5000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}'
# Expected: 200

# 2. Shop list still works
curl -s -o /dev/null -w "%{http_code}" \
  http://127.0.0.1:5000/api/admin/shops \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200

# 3. Part knowledge still works
curl -s -o /dev/null -w "%{http_code}" \
  http://127.0.0.1:5000/api/admin/part-knowledge \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200

# 4. Public shop API still works
curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:5000/api/public/shops?limit=1"
# Expected: 200

# 5. RFQ routes still respond (do not require auth for buyer-facing)
curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:5000/api/rfq/admin/health" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200
```

**PASS if:** All 5 existing routes return expected status codes.  
**FAIL if:** Any existing route returns 500 or unexpected error. → Immediate rollback §8.2.

```
[ ] STAGE 2 COMPLETE: Backend code deployed
[ ] STAGE 3 COMPLETE: .env updated
[ ] STAGE 4 COMPLETE: Backend restarted, flags all false
[ ] STAGE 5 COMPLETE: Existing routes regression pass
Record completion time: ___________
```

---

## 4. Frontend Rollout Procedure

> **GATE:** Stages 2–5 must be marked COMPLETE before proceeding.

### 4.1 Code State Verification

```bash
cd /var/www/otofine/frontend

# Confirm new admin platform pages exist
ls app/admin/\(platform\)/layout.js
ls app/admin/\(platform\)/dashboard/page.js
ls app/admin/\(platform\)/settings/roles/page.js
ls app/admin/\(platform\)/audit/page.js
# Expected: all 4 files exist

# Confirm new components directory
ls components/admin/
# Expected: AdminShell.jsx, AdminSidebar.jsx, AdminTopbar.jsx,
#           AdminFeatureGuard.jsx, AdminPermissionGuard.jsx,
#           AuditLogTable.jsx, RbacManager.jsx

# Confirm new API file
ls api/adminPlatformApi.js
# Expected: file exists

# Confirm new context file
ls contexts/AdminPlatformContext.js
# Expected: file exists

# Confirm protected files are UNCHANGED
git diff HEAD -- middleware.js
# Expected: empty output

git diff HEAD -- lib/shopHost.js
# Expected: empty output

git diff HEAD -- next.config.mjs
# Expected: empty output

git diff HEAD -- "app/(shopsite)/"
# Expected: empty output

git diff HEAD -- lib/seo/
# Expected: empty output

git diff HEAD -- components/AdminGuard.jsx
# Expected: empty output (new layout IMPORTS it, does NOT modify it)

git diff HEAD -- api/adminApi.js
# Expected: empty output (new API file is separate, existing unchanged)
```

### 4.2 Frontend Build

```bash
cd /var/www/otofine/frontend

# Run the production build
npm run build

# Monitor for errors — build must complete with zero TypeScript/ESLint errors
# Expected output ends with:
#   ✓ Compiled successfully
#   Route (app)                              Size
#   ...
#   /admin/dashboard                         [some size]
#   /admin/settings/roles                    [some size]
#   /admin/audit                             [some size]
```

**PASS if:** Build completes with `Compiled successfully` or equivalent.  
**FAIL if:** Build fails with errors. → Do NOT restart frontend. Fix build errors before proceeding. The existing frontend continues to serve traffic from the current `.next/` build.

### 4.3 Storefront Pre-Restart Smoke Test

Before restarting the frontend, confirm storefront is currently working:

```bash
# Test apex storefront
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/
# Expected: 200

# Test a known product URL (replace with a real product slug)
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/p/1
# Expected: 200 or 308 (redirect to canonical)

# Test a known storefront page (replace with a real shop slug)
curl -s -o /dev/null -w "%{http_code}" "https://otofine.com/shops"
# Expected: 200

# Test the sitemap
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/sitemap.xml
# Expected: 200
```

Record all baseline status codes. These will be re-verified after restart.

### 4.4 Frontend Restart

```bash
# Capture pre-restart PM2 state
pm2 list > /tmp/pm2_pre_frontend_restart.txt

# Restart ONLY the frontend — do NOT touch backend or workers
pm2 restart otofine-frontend

# Wait 8 seconds for Next.js startup (longer than backend due to hydration)
sleep 8

# Monitor startup logs
pm2 logs otofine-frontend --lines 30 --nostream

# Confirm process is online
pm2 list | grep otofine-frontend
# Expected: status = online
```

**PASS if:** Process online; no critical errors in startup logs.  
**FAIL if:** Process enters errored state. → Immediate rollback §8.3.

### 4.5 Storefront Post-Restart Regression Test

```bash
# Repeat all tests from §4.3 — results must match pre-restart baseline

curl -s -o /dev/null -w "%{http_code}" https://otofine.com/
# Expected: 200 (matches baseline)

curl -s -o /dev/null -w "%{http_code}" https://otofine.com/p/1
# Expected: same as baseline (200 or 308)

curl -s -o /dev/null -w "%{http_code}" "https://otofine.com/shops"
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" https://otofine.com/sitemap.xml
# Expected: 200

# Wildcard storefront test (replace with an actual active shop slug)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: {KNOWN_SHOP_SLUG}.otofine.com" \
  https://otofine.com/
# Expected: 200 (storefront renders)
```

**PASS if:** All status codes match pre-restart baseline.  
**FAIL if:** Any status code changed (e.g., 200 → 500, 200 → 404). → Immediate rollback §8.3.

### 4.6 New Admin Pages Hidden Route Test

Verify new admin pages are accessible to admin but hidden from public:

```bash
# New dashboard page — requires admin login
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/admin/dashboard
# Expected: 200 (page renders, but AdminGuard redirects unauthenticated users client-side)
# Note: Next.js SSR renders the page shell; AdminGuard redirects in client JS.
# The HTTP status will be 200 regardless of auth state.

# Verify the page content does NOT include sensitive data when unauthenticated
curl -s https://otofine.com/admin/dashboard | grep -i "error\|exception\|stack trace"
# Expected: no matches (no server-side errors)

# New settings/roles page
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/admin/settings/roles
# Expected: 200

# New audit page
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/admin/audit
# Expected: 200
```

### 4.7 Route Isolation Check

Verify new admin pages do NOT interfere with existing frontend routes:

```bash
# Existing admin pages still work
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/admin/login
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" https://otofine.com/admin/shops
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" https://otofine.com/admin/seo
# Expected: 200

# SEO critical routes unaffected
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/phu-tung-o-to
# Expected: 200

# RFQ routes unaffected
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/rfq/new
# Expected: 200

# Seller center unaffected
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/shop/login
# Expected: 200
```

**PASS if:** All existing routes return expected status codes; no new 500 errors.  
**FAIL if:** Any regression in existing routes. → Rollback §8.3.

```
[ ] STAGE 6 COMPLETE: Frontend code confirmed on disk
[ ] STAGE 7 COMPLETE: npm run build succeeded
[ ] STAGE 8 COMPLETE: Frontend restarted, online
[ ] STAGE 9 COMPLETE: Storefront regression pass
Record completion time: ___________
```

---

## 5. RBAC Rollout Verification

> **GATE:** Stages 6–9 must be marked COMPLETE before enabling feature flags.  
> This section is performed AFTER the feature flag activation in §9.

### 5.1 Superadmin Bypass Verification

After `ADMIN_RBAC_ENABLED=true` (see §9.2):

```bash
# Get superadmin token (from existing admin table — no adminAccountId in payload)
ADMIN_TOKEN=$(curl -s -X POST https://otofine.com/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Decode token payload (do NOT verify signature — just inspect claims)
echo $ADMIN_TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
# Expected payload:
# {
#   "id": <number>,
#   "role": "admin",
#   "email": "...",
#   "iat": <timestamp>,
#   "exp": <timestamp>
# }
# CRITICAL: there should be NO "adminAccountId" field (superadmin path)

# Test RBAC role list — superadmin should access without permission DB lookup
curl -s -w "\nHTTP: %{http_code}\n" \
  https://otofine.com/api/admin/rbac/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: HTTP 200 + JSON array with 5 system roles
```

**PASS if:** Token has no `adminAccountId`; roles endpoint returns 200 with 5 roles.  
**FAIL if:** Token contains `adminAccountId` or endpoint returns non-200. → Diagnose before continuing.

### 5.2 Middleware Chain Verification

```bash
# Test that requireAuth still blocks requests without token
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/rbac/roles
# Expected: 401 (no Authorization header)

# Test that requireAdmin still blocks non-admin tokens
# First, get a shop (seller) token:
SHOP_TOKEN=$(curl -s -X POST https://otofine.com/api/auth/shop-login \
  -H "Content-Type: application/json" \
  -d '{"email":"SELLER_EMAIL","password":"SELLER_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/rbac/roles \
  -H "Authorization: Bearer $SHOP_TOKEN"
# Expected: 403 (shop role cannot access admin routes)

# Test that existing admin routes are NOT affected by new middleware
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/shops \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200 (unchanged behavior — no requireAdminPermission on existing routes)
```

**PASS if:** 401 without token; 403 with seller token; 200 on existing admin route.  
**FAIL if:** Any unexpected status code. → Rollback flags §8.4 and diagnose.

### 5.3 Permission Endpoint Verification

```bash
# List all permissions
curl -s \
  https://otofine.com/api/admin/rbac/permissions \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected BEFORE sync: empty array []
# Expected AFTER sync (Step 12): array with 15+ permission objects

# Get admin me
curl -s \
  https://otofine.com/api/admin/platform/me \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: { identity: {id, email, isSuperadmin: true}, permissions: ["*"] }
# or equivalent superadmin representation
```

### 5.4 Audit Log Write Verification

After `ADMIN_AUDIT_LOG_ENABLED=true`:

```bash
# Trigger an action that writes to audit log
# (This assumes role list is now active)
curl -s -X POST \
  https://otofine.com/api/admin/rbac/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test_phase1_role","description":"Temporary test role"}'
# Expected: 201 Created with role object

# Verify audit log captured this action
curl -s \
  "https://otofine.com/api/admin/audit-log?action=admin_role.create" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: array with 1 entry for the role creation above

# Verify entry structure
curl -s \
  "https://otofine.com/api/admin/audit-log?action=admin_role.create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -m json.tool
# Expected fields: id, action, target_type, target_id, target_label,
#                  actor_type, after_json, created_at
```

**PASS if:** Audit log contains 1 entry for the test role creation; entry has correct structure.  
**FAIL if:** Audit log returns empty array or 500. → Check audit log service logs in pm2 logs.

```bash
# Clean up test role
curl -s -X DELETE \
  "https://otofine.com/api/admin/rbac/roles/{TEST_ROLE_ID}" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200 or 204

# Verify delete was also logged
curl -s \
  "https://otofine.com/api/admin/audit-log?action=admin_role.delete" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
# Expected: 1 entry for the delete
```

---

## 6. Smoke Test Procedures

> **GATE:** All smoke tests must pass before marking Phase 1 complete.  
> Run the full suite after Stages 1–12 are complete.

### 6.1 Storefront Smoke Tests

```bash
STOREFRONT_SLUG="KNOWN_ACTIVE_SHOP_SLUG"  # replace with a real slug

# a. Storefront homepage via apex domain
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://otofine.com/shops/${STOREFRONT_SLUG}")
echo "Storefront apex: $STATUS"  # Expected: 200

# b. Storefront products tab
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://otofine.com/shops/${STOREFRONT_SLUG}/san-pham")
echo "Products tab: $STATUS"  # Expected: 200

# c. Storefront about tab
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://otofine.com/shops/${STOREFRONT_SLUG}/gioi-thieu")
echo "About tab: $STATUS"  # Expected: 200

# d. Shop directory
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://otofine.com/shops")
echo "Shop directory: $STATUS"  # Expected: 200

# e. Homepage marketplace
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://otofine.com/")
echo "Homepage: $STATUS"  # Expected: 200

# f. Verify no admin JS bundles leaked into storefront pages
curl -s "https://otofine.com/shops/${STOREFRONT_SLUG}" | grep -i "admin\|rbac\|auditLog"
# Expected: no matches (admin module code not present in storefront HTML)
```

### 6.2 Wildcard Subdomain Smoke Tests

```bash
STOREFRONT_SLUG="KNOWN_ALLOWLISTED_SLUG"  # must be in PUBLIC_SHOPSITE_ALLOWED_SLUGS

# a. Wildcard subdomain root
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: ${STOREFRONT_SLUG}.otofine.com" \
  https://otofine.com/)
echo "Wildcard root: $STATUS"  # Expected: 200

# b. Wildcard subdomain products
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: ${STOREFRONT_SLUG}.otofine.com" \
  "https://otofine.com/san-pham")
echo "Wildcard products: $STATUS"  # Expected: 200

# c. X-Robots-Tag header still present on wildcard
curl -s -I -H "Host: ${STOREFRONT_SLUG}.otofine.com" https://otofine.com/ \
  | grep -i "x-robots-tag"
# Expected: X-Robots-Tag: noindex, nofollow

# d. Reserved subdomain still blocked
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: admin.otofine.com" \
  https://otofine.com/)
echo "Reserved admin subdomain: $STATUS"  # Expected: 000 (connection close / 444)

# e. Invalid slug still gets 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: INVALID_SLUG_123ABC.otofine.com" \
  https://otofine.com/)
echo "Invalid slug: $STATUS"  # Expected: 404
```

### 6.3 RFQ Smoke Tests

```bash
# a. RFQ new request page loads
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://otofine.com/rfq/new)
echo "RFQ new page: $STATUS"  # Expected: 200

# b. RFQ seller inbox accessible (will redirect to login if no session)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://otofine.com/rfq/shop/inbox)
echo "RFQ seller inbox: $STATUS"  # Expected: 200 (page loads, auth handled client-side)

# c. RFQ admin health endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/rfq/admin/health \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "RFQ admin health: $STATUS"  # Expected: 200

# d. Verify RFQ workers are still polling (check PM2 process status)
pm2 list | grep -E "rfq-buyer-reminder|rfq-escalation"
# Expected: both processes online (status = online)

# e. Verify no new error patterns in RFQ worker logs
pm2 logs rfq-buyer-reminder-worker --lines 10 --nostream | grep -i "error\|exception"
pm2 logs rfq-escalation-worker --lines 10 --nostream | grep -i "error\|exception"
# Expected: no new error lines introduced by Phase 1
```

### 6.4 Seller Dashboard Smoke Tests

```bash
# a. Seller login page loads
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://otofine.com/shop/login)
echo "Seller login: $STATUS"  # Expected: 200

# b. Seller center API with valid seller token
SELLER_TOKEN=$(curl -s -X POST https://otofine.com/api/auth/shop-login \
  -H "Content-Type: application/json" \
  -d '{"email":"SELLER_EMAIL","password":"SELLER_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/shop/me \
  -H "Authorization: Bearer $SELLER_TOKEN")
echo "Seller me API: $STATUS"  # Expected: 200

# c. Seller products list
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://otofine.com/api/shop/products?limit=5" \
  -H "Authorization: Bearer $SELLER_TOKEN")
echo "Seller products: $STATUS"  # Expected: 200

# d. Seller metrics overview
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://otofine.com/api/shop/metrics/overview" \
  -H "Authorization: Bearer $SELLER_TOKEN")
echo "Seller metrics: $STATUS"  # Expected: 200
```

### 6.5 Admin Hidden Route Smoke Tests (New Phase 1 Routes)

```bash
# a. Admin platform features — always-on, no flag gate
FEATURES=$(curl -s \
  https://otofine.com/api/admin/platform/features \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "Features response: $FEATURES"
# Expected: JSON with all flags — rbacEnabled and auditLogEnabled should be true
# after flag activation in §9

# b. Admin me endpoint
curl -s \
  https://otofine.com/api/admin/platform/me \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -m json.tool
# Expected: { identity: {..., isSuperadmin: true}, permissions: [...] }

# c. RBAC roles list
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/rbac/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "RBAC roles: $STATUS"  # Expected: 200

# d. Audit log query
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://otofine.com/api/admin/audit-log?limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "Audit log: $STATUS"  # Expected: 200

# e. Disabled modules still return 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://otofine.com/api/admin/moderation/shops" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "Moderation (should be disabled): $STATUS"  # Expected: 404

# f. New frontend dashboard page loads
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://otofine.com/admin/dashboard)
echo "Admin dashboard: $STATUS"  # Expected: 200
```

### 6.6 Redis State Verification (Post-Deploy)

```bash
# Confirm Redis is still responding
redis-cli ping
# Expected: PONG

# Check key count has not dropped significantly
redis-cli dbsize
# Expected: approximately equal to pre-deploy count (§1.4)
# Some variance is normal from cache expirations; a large drop may indicate
# unintended cache flush.
```

### 6.7 Smoke Test Pass Criteria

All tests must produce expected results. Record any failure immediately.

| Test Group | Pass Condition | Actual |
|---|---|---|
| 6.1 Storefront | All status codes match baseline | ___ |
| 6.2 Wildcard | 200 on valid slugs; noindex header present | ___ |
| 6.3 RFQ | All RFQ routes 200; workers online | ___ |
| 6.4 Seller dashboard | All seller API routes 200 | ___ |
| 6.5 Admin routes | New routes return expected codes | ___ |
| 6.6 Redis | PONG; key count stable | ___ |

---

## 7. Rollback Triggers

Rollback is **MANDATORY** — not optional — when any of the following conditions occur.

### 7.1 Immediate Rollback Triggers (Stop All Work)

| Condition | Trigger | Action |
|---|---|---|
| `otofine-backend` enters errored/stopped state after restart | Stage 4 or later | §8.2 PM2 rollback |
| `otofine-frontend` enters errored/stopped state after restart | Stage 8 or later | §8.3 PM2 rollback |
| Any existing public storefront URL returns 500 (was 200 before) | Stages 5, 9, or smoke test | §8.3 frontend rollback |
| Any existing RFQ route returns 500 (was 200 before) | Any stage | §8.2 backend rollback |
| Any existing seller API returns 500 (was 200 before) | Any stage | §8.2 backend rollback |
| Any existing admin route (`/api/admin/shops`, `/api/admin/part-knowledge`) returns 500 | Any stage | §8.2 backend rollback |
| `admin_audit_log` insert fails in strict mode and blocks admin actions | Stage 10–12 | §8.4 flag disable |
| Wildcard subdomain stops returning `X-Robots-Tag: noindex, nofollow` | Stages 9+ | Investigate immediately |
| SEO product canonical URLs return 404 or 500 | Any stage | §8.3 frontend rollback |
| Redis is unresponsive after backend restart | Stage 4 | §8.2 backend rollback + Redis investigation |

### 7.2 Investigation Triggers (Do Not Proceed — Diagnose First)

Pause execution and diagnose before continuing when:

- `pm2 logs` shows new `TypeError`, `ReferenceError`, or `UnhandledPromiseRejection`
- Backend restart count increases by more than 2 in the first 5 minutes after restart
- Frontend build completes but pages return incorrect content (not status code failures)
- `admin_feature_flags` table has `is_enabled = 1` for any flag BEFORE the flag activation step in §9
- Any new database table has non-zero row counts that were not seeded there (unexpected data)

### 7.3 Non-Rollback Conditions

These conditions do **NOT** trigger rollback:

- Stale PM2 processes (`backend-rfq-dev`, `frontend-rfq-dev`) continue to show as errored — this is pre-existing
- New admin platform pages show "Feature not enabled" when flags are false — this is expected
- `admin_permissions` table is empty before `syncPermissions` is called — this is expected (Step 12)
- Redis key count changes by ≤10% from baseline — normal cache expiration

---

## 8. Rollback Procedure

### 8.1 Migration Rollback

**When to use:** Migrations caused unexpected errors, or post-migration validation (§2.4) failed.

Apply in this exact order (reverse dependency):

```bash
# Connect to MySQL
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME}
```

```sql
-- Step R1: Drop admin_job_queue (no dependencies on other admin tables)
DROP TABLE IF EXISTS admin_job_queue;

-- Step R2: Drop admin_feature_flags (no dependencies)
DROP TABLE IF EXISTS admin_feature_flags;

-- Step R3: Drop admin_audit_log (no FK dependencies)
DROP TABLE IF EXISTS admin_audit_log;

-- Step R4: Drop admin_account_roles (FK → admin_accounts, admin_roles)
DROP TABLE IF EXISTS admin_account_roles;

-- Step R5: Drop admin_role_permissions (FK → admin_roles, admin_permissions)
DROP TABLE IF EXISTS admin_role_permissions;

-- Step R6: Drop admin_permissions (no FK from other tables at this point)
DROP TABLE IF EXISTS admin_permissions;

-- Step R7: Drop admin_roles (now safe — foreign key holders are dropped)
DROP TABLE IF EXISTS admin_roles;

-- Step R8: Drop admin_accounts (no remaining dependencies)
DROP TABLE IF EXISTS admin_accounts;

-- Step R9: Drop schema_migrations ONLY if full rollback required
-- WARNING: Only run this if NO other migrations were tracked here.
-- DROP TABLE IF EXISTS schema_migrations;

-- Verify all admin tables are gone
SHOW TABLES LIKE 'admin_%';
-- Expected: 0 rows (or only schema_migrations if you chose to keep it)
```

**Post-rollback verification:**
```sql
-- Confirm existing tables are intact
SELECT COUNT(*) FROM products;    -- must match baseline
SELECT COUNT(*) FROM shops;       -- must match baseline
SELECT COUNT(*) FROM rfq_requests; -- must match baseline
```

### 8.2 Backend Rollback (Code + PM2)

**When to use:** Backend fails to start, or existing routes return 500 after restart.

```bash
# Step 1: Revert to the previous git commit
cd /var/www/otofine/backend
git log --oneline -5  # identify the last stable commit
git checkout {STABLE_COMMIT_HASH}

# Step 2: Remove the new env vars (do NOT remove existing vars)
# Edit /var/www/otofine/backend/.env and remove the 10 ADMIN_* lines added in §3.2
nano /var/www/otofine/backend/.env
# Remove lines: ADMIN_RBAC_ENABLED through ADMIN_ANALYTICS_ENABLED

# Step 3: Restart backend
pm2 restart otofine-backend

# Step 4: Verify backend is healthy
sleep 5
pm2 list | grep otofine-backend
# Expected: online

# Step 5: Verify existing routes work
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/shops \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200

# Step 6: Document rollback time and reason
echo "Backend rollback executed at $(date) — reason: {DESCRIBE REASON}" >> /tmp/phase1_rollback_log.txt
```

**Note:** After backend code rollback, the migration tables still exist in the DB. They are harmless (no existing code reads them). Run migration rollback (§8.1) only if required for some specific reason.

### 8.3 Frontend Rollback (Code + PM2)

**When to use:** Frontend build fails, or storefront returns 500 after frontend restart.

```bash
# Step 1: Revert to the previous git commit
cd /var/www/otofine/frontend
git log --oneline -5  # identify the last stable commit
git checkout {STABLE_COMMIT_HASH}

# Step 2: Rebuild from stable code
npm run build

# Step 3: Restart frontend
pm2 restart otofine-frontend

# Step 4: Verify frontend is healthy
sleep 8
pm2 list | grep otofine-frontend
# Expected: online

# Step 5: Verify storefront works
curl -s -o /dev/null -w "%{http_code}" https://otofine.com/
# Expected: 200

# Step 6: Verify wildcard still works
curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: {KNOWN_SHOP_SLUG}.otofine.com" \
  https://otofine.com/
# Expected: 200

echo "Frontend rollback executed at $(date) — reason: {DESCRIBE REASON}" >> /tmp/phase1_rollback_log.txt
```

### 8.4 Feature Flag Disable (Soft Rollback)

**When to use:** RBAC or audit log functionality causes errors but the backend itself is still running.  
**Fastest path:** Does not require git revert or PM2 restart.

```bash
# Edit .env to disable problem flags
nano /var/www/otofine/backend/.env

# Change specific flags:
ADMIN_RBAC_ENABLED=false      # ← change from true to false
ADMIN_AUDIT_LOG_ENABLED=false # ← change from true to false

# Restart backend to pick up env change
pm2 restart otofine-backend
sleep 5

# Verify flags are now false
curl -s \
  https://otofine.com/api/admin/platform/features \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -m json.tool
# Expected: rbacEnabled: false, auditLogEnabled: false

# Verify RBAC routes return 404 again
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/rbac/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 404
```

**This is reversible:** Re-enabling the flags requires only editing `.env` and restarting — no migration or code rollback needed.

### 8.5 Full Rollback Decision Tree

```
Error detected
     │
     ├─ Is it storefront/RFQ/SEO related?
     │       YES → §8.3 Frontend rollback immediately
     │
     ├─ Is it backend API related (500 on existing routes)?
     │       YES → §8.4 Try flag disable first
     │             If flag disable doesn't help → §8.2 Backend code rollback
     │
     ├─ Is it only new admin platform routes?
     │       YES → §8.4 Flag disable (safe, targeted)
     │
     ├─ Is it a migration error?
     │       YES → §8.1 Migration rollback
     │             Then assess whether §8.2 backend rollback is also needed
     │
     └─ Is it PM2 process crash?
             YES → Immediate §8.2 (backend) or §8.3 (frontend)
```

---

## 9. Feature Flag Activation Sequence

> **GATE:** All of Stages 1–9 must be complete (migrations + backend + frontend + regression tests).  
> Flag activation is a separate, deliberate step — not bundled with code deploy.

### 9.1 Pre-Activation Gate

Before enabling any flag:

```bash
# Confirm all baseline tests still pass (re-run §6 smoke tests)
# If any smoke test fails: DO NOT enable flags. Fix the issue first.

# Confirm backend .env has flags set to false
grep "ADMIN_RBAC_ENABLED\|ADMIN_AUDIT_LOG_ENABLED" /var/www/otofine/backend/.env
# Expected:
#   ADMIN_RBAC_ENABLED=false
#   ADMIN_AUDIT_LOG_ENABLED=false

# Confirm admin_feature_flags table also shows false
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} -e "
  SELECT flag_key, is_enabled FROM admin_feature_flags
  WHERE flag_key IN ('ADMIN_RBAC_ENABLED','ADMIN_AUDIT_LOG_ENABLED');
"
# Expected: both rows with is_enabled = 0
```

### 9.2 Enable RBAC (`ADMIN_RBAC_ENABLED=true`)

```bash
# Step 1: Update .env
sed -i 's/^ADMIN_RBAC_ENABLED=false/ADMIN_RBAC_ENABLED=true/' \
  /var/www/otofine/backend/.env

# Verify the change
grep "ADMIN_RBAC_ENABLED" /var/www/otofine/backend/.env
# Expected: ADMIN_RBAC_ENABLED=true

# Step 2: Restart backend
pm2 restart otofine-backend
sleep 5

# Step 3: Confirm process is online
pm2 list | grep otofine-backend
# Expected: online

# Step 4: Verify RBAC routes are now active
curl -s -o /dev/null -w "%{http_code}" \
  https://otofine.com/api/admin/rbac/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200 (no longer 404)

# Step 5: Verify features endpoint shows rbacEnabled=true
curl -s \
  https://otofine.com/api/admin/platform/features \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('rbacEnabled:', d.get('rbacEnabled'))"
# Expected: rbacEnabled: True

# Step 6: Verify superadmin bypass works (§5.1)
# Step 7: Verify existing admin routes still 200 (§3.6)
```

**PASS if:** RBAC routes return 200; superadmin bypass confirmed; existing routes unchanged.  
**FAIL if:** Any issue → `sed -i 's/^ADMIN_RBAC_ENABLED=true/ADMIN_RBAC_ENABLED=false/'` and restart.

### 9.3 Enable Audit Log (`ADMIN_AUDIT_LOG_ENABLED=true`)

```bash
# Step 1: Update .env
sed -i 's/^ADMIN_AUDIT_LOG_ENABLED=false/ADMIN_AUDIT_LOG_ENABLED=true/' \
  /var/www/otofine/backend/.env

# Verify the change
grep "ADMIN_AUDIT_LOG_ENABLED" /var/www/otofine/backend/.env
# Expected: ADMIN_AUDIT_LOG_ENABLED=true

# Step 2: Restart backend
pm2 restart otofine-backend
sleep 5

# Step 3: Confirm audit log routes are active
curl -s -o /dev/null -w "%{http_code}" \
  "https://otofine.com/api/admin/audit-log?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200 (returns empty array initially)

# Step 4: Trigger a test write (perform a read-only action and verify no audit entry created)
# (Read actions should NOT write audit entries — only mutations do)
curl -s \
  "https://otofine.com/api/admin/audit-log?limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: empty array (no mutations have been performed yet)

# Step 5: Trigger a test mutation (list roles call is a read — instead, use §5.4 procedure)
```

**PASS if:** Audit log route returns 200; empty array before any mutations.  
**FAIL if:** Route returns 500 or audit log write errors appear in logs.

### 9.4 Seed Permissions Registry

```bash
# This populates admin_permissions from the hardcoded permissions.registry.js

curl -s -X POST \
  https://otofine.com/api/admin/rbac/permissions/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -m json.tool
# Expected: { "synced": <number>, "message": "Permissions synced successfully" }

# Verify permissions are in DB
curl -s \
  https://otofine.com/api/admin/rbac/permissions \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Permission count:', len(d))"
# Expected: Permission count: 15 (or the count from the registry)

# Also verify in DB directly
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} -e "
  SELECT module, COUNT(*) AS cnt FROM admin_permissions GROUP BY module ORDER BY module;
"
# Expected: rows for admin, rbac, auditLog, shopModeration, productModeration,
#           billing, sellerCrm, riskEngine, analytics modules

# Verify audit log captured the sync action
curl -s \
  "https://otofine.com/api/admin/audit-log?action=rbac.permissions.sync" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Audit entries:', len(d))"
# Expected: Audit entries: 1
```

**PASS if:** Permissions seeded; audit log entry created for sync.  
**FAIL if:** sync returns error or wrong count. → Check `pm2 logs otofine-backend`.

```
[ ] STAGE 10 COMPLETE: ADMIN_RBAC_ENABLED=true, routes active
[ ] STAGE 11 COMPLETE: ADMIN_AUDIT_LOG_ENABLED=true, log active
[ ] STAGE 12 COMPLETE: Permissions seeded, audit log verified
Record completion time: ___________
```

### 9.5 Flag Activation Order Summary

| Flag | Stage | Activation condition |
|---|---|---|
| `ADMIN_RBAC_ENABLED` | Stage 10 | All Stages 1–9 complete + smoke tests pass |
| `ADMIN_AUDIT_LOG_ENABLED` | Stage 11 | Stage 10 verified working |
| `ADMIN_SHOP_MODERATION_ENABLED` | **Phase 2** | Not activated in Phase 1 |
| `ADMIN_PRODUCT_MODERATION_ENABLED` | **Phase 3** | Not activated in Phase 1 |
| `ADMIN_BILLING_ENABLED` | **Phase 5** | Not activated in Phase 1 |
| `ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED` | **Phase 5+** | Last of all flags — never in Phase 1 |
| `ADMIN_SELLER_CRM_ENABLED` | **Phase 6** | Not activated in Phase 1 |
| `ADMIN_RISK_ENGINE_ENABLED` | **Phase 7** | Not activated in Phase 1 |
| `ADMIN_ANALYTICS_ENABLED` | **Phase 4** | Not activated in Phase 1 |

---

## 10. Production Safety Constraints

### 10.1 Forbidden Deployment Actions

The following actions are **absolutely forbidden** during Phase 1 execution. Performing any of them is an immediate stop condition.

```
FORBIDDEN — will break production:

[ NEVER ] Edit, rename, or delete frontend/middleware.js
[ NEVER ] Edit, rename, or delete frontend/lib/shopHost.js
[ NEVER ] Edit, rename, or delete frontend/next.config.mjs
[ NEVER ] Edit any file under frontend/app/(shopsite)/
[ NEVER ] Edit any file under frontend/lib/seo/
[ NEVER ] Edit any file under frontend/lib/shopsite/
[ NEVER ] Edit backend/domains/auth/middlewares/auth.middleware.js
[ NEVER ] Edit the existing requireAuth, requireAdmin, requireShop exports
[ NEVER ] Edit any file under backend/domains/shopPublic/
[ NEVER ] Edit any file under backend/domains/storefrontEvents/
[ NEVER ] Edit any file under backend/modules/rfq/
[ NEVER ] Edit backend/services/product.service.js
[ NEVER ] Edit backend/services/seoComposer.js
[ NEVER ] Edit backend/services/seoSlugResolver.service.js
[ NEVER ] Edit backend/services/typesenseRealtimeSync.service.js
[ NEVER ] Edit backend/routes/admin.routes.js
[ NEVER ] Edit backend/controllers/adminController.js
[ NEVER ] Edit backend/config/db.js
[ NEVER ] Run ALTER TABLE on products, shops, rfq_requests, shop_accounts, or any existing table
[ NEVER ] Run DROP TABLE on any existing table
[ NEVER ] Modify /etc/nginx/sites-available/otofine
[ NEVER ] Modify /etc/nginx/sites-available/otofine-shop-subdomain.conf
[ NEVER ] Reload Nginx (nginx -s reload) unless explicitly required for a separate reason
[ NEVER ] Run pm2 delete on any existing process
[ NEVER ] Run pm2 start for a new admin-worker or admin-scheduler process (Phase 4+)
[ NEVER ] Set ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED=true (Phase 5+ only)
[ NEVER ] Set ADMIN_SHOP_MODERATION_ENABLED=true without Phase 2 code deployed
[ NEVER ] Set ADMIN_PRODUCT_MODERATION_ENABLED=true without Phase 3 code deployed
```

### 10.2 Forbidden File Modifications

In addition to the list above, the following files must have zero modifications during Phase 1:

```
frontend/components/AdminGuard.jsx
frontend/api/adminApi.js
frontend/app/admin/login/page.js
frontend/app/admin/shops/page.js
frontend/app/admin/seo/page.js
frontend/app/admin/seo-articles/page.js
frontend/app/admin/seo-pages/page.js
frontend/app/admin/part-knowledge/page.js
frontend/components/pages/AdminLogin.jsx
frontend/components/pages/AdminShops.jsx
frontend/components/pages/AdminPartKnowledge.jsx
```

### 10.3 Forbidden Refactors

Even if a refactor seems unrelated to Phase 1, the following are forbidden until Phase 1 is fully complete and stable for at least 48 hours:

```
FORBIDDEN during Phase 1:
- Renaming any existing route, controller, or service file
- Moving files between directories
- Consolidating the dual product service files (product.service.js + productService.js)
- Removing the dead code adminAuthController.js (controllers/)
- Changing JWT_SECRET value
- Changing bcrypt round count in auth.config.js
- Updating any npm dependency (especially express, mysql2, jsonwebtoken)
- Changing the existing admin table schema
- Adding any column to the existing `shops` or `products` tables
```

### 10.4 Forbidden Rollout Patterns

```
FORBIDDEN rollout patterns:
- Enabling ALL flags at once — flags must be enabled one at a time with verification between each
- Running migrations and restarting backend simultaneously — always wait for migration
  verification before restarting
- Deploying frontend before backend is verified stable
- Skipping the pre-deploy checklist §1 to save time
- Applying migrations outside of a documented deployment window
- Running run-admin-migration.js on production without first verifying on dev DB
- Activating ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED without Phase 5 code
- Enabling shop moderation without testing the post-registration hook
- Making any change to Nginx config as part of the Phase 1 rollout
```

---

## 11. Success Criteria

Phase 1 is considered **successfully complete** when ALL of the following conditions are true simultaneously.

### 11.1 Database Conditions

```
[ ] 9 new tables exist and are correctly structured (verified via §2.4)
[ ] schema_migrations has exactly 6 rows (one per migration file)
[ ] admin_roles has exactly 5 rows, all is_system=1
[ ] admin_permissions has 15+ rows (populated via syncPermissions in Stage 12)
[ ] admin_feature_flags has 10 rows (8 remain is_enabled=0; RBAC+audit=1)
[ ] admin_audit_log has at least 1 entry (from test action in §5.4)
[ ] admin_job_queue is empty (no jobs scheduled in Phase 1)
[ ] All existing table row counts match pre-deploy baselines
[ ] No new indexes were added to existing tables
```

### 11.2 Backend Conditions

```
[ ] otofine-backend PM2 process is online
[ ] Backend restart count after deploy is ≤ 2 (one restart per deployment step)
[ ] GET /api/admin/platform/features returns { rbacEnabled: true, auditLogEnabled: true, ...all others false }
[ ] GET /api/admin/rbac/roles returns 200 with 5 roles
[ ] GET /api/admin/audit-log returns 200 with array containing at least 1 entry
[ ] POST /api/admin/rbac/permissions/sync returns success
[ ] GET /api/admin/rbac/permissions returns 15+ permissions
[ ] GET /api/admin/shops returns 200 (existing route unchanged)
[ ] GET /api/admin/part-knowledge returns 200 (existing route unchanged)
[ ] GET /api/public/shops?limit=1 returns 200 (storefront API unchanged)
[ ] POST /api/auth/admin-login returns 200 with token (existing auth unchanged)
[ ] POST /api/auth/shop-login returns 200 with token (seller auth unchanged)
[ ] No ADMIN_MODERATION, BILLING, CRM, RISK, or ANALYTICS routes return 200
    (all disabled modules must return 404 for their routes)
```

### 11.3 Frontend Conditions

```
[ ] otofine-frontend PM2 process is online
[ ] npm run build completed without errors
[ ] https://otofine.com/ returns 200
[ ] https://otofine.com/shops returns 200
[ ] https://otofine.com/shops/{KNOWN_SLUG} returns 200
[ ] https://otofine.com/sitemap.xml returns 200
[ ] https://otofine.com/admin/dashboard returns 200 (new page)
[ ] https://otofine.com/admin/settings/roles returns 200 (new page)
[ ] https://otofine.com/admin/audit returns 200 (new page)
[ ] https://otofine.com/admin/login returns 200 (existing page unchanged)
[ ] https://otofine.com/admin/shops returns 200 (existing page unchanged)
[ ] https://otofine.com/rfq/new returns 200
[ ] https://otofine.com/shop/login returns 200
```

### 11.4 RBAC Conditions

```
[ ] Superadmin token (from existing admin table) has NO adminAccountId field
[ ] Superadmin can access all RBAC routes without 403
[ ] Shop seller token returns 403 on all /api/admin/rbac/* routes
[ ] Unauthenticated requests to /api/admin/rbac/* return 401
[ ] Existing admin routes are NOT protected by requireAdminPermission
    (verified by confirming /api/admin/shops returns 200 with admin token,
     with no permission code required beyond requireAdmin)
```

### 11.5 Audit Log Conditions

```
[ ] admin_audit_log is append-only (no UPDATE/DELETE methods exist in code)
[ ] At least 1 audit log entry exists from Stage 12 test actions
[ ] Audit entries have correct structure: action, target_type, target_id,
    actor_type, before_json or after_json, created_at, request_id
[ ] GET /api/admin/audit-log returns paginated results correctly
[ ] Audit log write does NOT block/fail for the test mutation performed
```

### 11.6 Safety Conditions

```
[ ] All protected file hashes are unchanged (git diff shows zero changes on protected files)
[ ] Wildcard subdomain serving confirmed: X-Robots-Tag header present
[ ] Storefront renders correctly for a known active shop
[ ] RFQ workers online: rfq-buyer-reminder-worker, rfq-escalation-worker
[ ] Redis responding: redis-cli ping returns PONG
[ ] No new ERROR or EXCEPTION lines in pm2 logs for any process
    (check: pm2 logs --lines 50 | grep -i "error\|exception\|unhandled")
[ ] No new 500 responses detected on public-facing routes in Nginx logs
    (if accessible: tail -100 /var/log/nginx/access.log | grep " 500 ")
```

### 11.7 Sign-Off Condition

Phase 1 is declared complete only when a designated team member verifies and signs off on all checklist items above.

```
Phase 1 completion confirmed by: ___________________________
Date and time: ___________________________
All 13 RUNBOOK STATUS TRACKER items checked: YES / NO
```

---

## Appendix A: Command Reference Card

Quick reference for the most frequently used commands during execution.

```bash
# PM2
pm2 list                                      # process status
pm2 logs otofine-backend --lines 30 --nostream  # recent backend logs
pm2 logs otofine-frontend --lines 30 --nostream # recent frontend logs
pm2 restart otofine-backend                   # restart backend only
pm2 restart otofine-frontend                  # restart frontend only
pm2 list > /tmp/pm2_snapshot_$(date +%H%M).txt  # save PM2 state

# MySQL (replace with actual credentials from .env)
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME}   # open MySQL shell
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} < migrations/051_schema_migrations.sql

# Redis
redis-cli ping                                # health check
redis-cli dbsize                              # key count
redis-cli info memory | grep used_memory_human # memory usage

# Git
git status                                    # working tree status
git log --oneline -5                          # recent commits
git diff HEAD -- backend/server.js            # show changes to server.js

# Node checks
node --check backend/server.js                # syntax check
node --check backend/modules/admin/index.js   # syntax check

# Frontend
cd /var/www/otofine/frontend && npm run build # production build

# Admin token retrieval
curl -s -X POST http://127.0.0.1:5000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"EMAIL","password":"PASS"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
```

## Appendix B: Rollback Decision Table

| Symptom | Likely Cause | Rollback Action |
|---|---|---|
| Backend crashes on startup | Import error in new module | §8.2 code rollback |
| Backend crashes after flag enable | Bug in RBAC/audit service | §8.4 flag disable |
| Frontend build fails | Syntax error in new component | Fix code, retry build |
| Frontend crashes after restart | Runtime error in new layout | §8.3 code rollback |
| Storefront returns 500 | Frontend SSR error | §8.3 code rollback |
| Seller API returns 500 | Backend middleware error | §8.2 code rollback |
| Admin login returns 500 | Auth service touched (it shouldn't be) | §8.2 code rollback |
| RBAC routes return 500 | DB tables not migrated | Verify §2.4, re-run migrations |
| Audit log returns 500 | MySQL error on INSERT | Check DB user grants; §8.4 flag disable |
| Migration script fails at M3 | admin_accounts table missing | Run M2 first, then retry M3 |
| Redis ping fails | Redis crashed | Restart Redis, check fallback behavior |
