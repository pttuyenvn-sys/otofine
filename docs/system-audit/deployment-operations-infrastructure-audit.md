# Otofine — Deployment, Operations & Infrastructure Audit

> **Phase:** Structural Observation Only  
> **Date:** 2026-05-26  
> **Scope:** Read-only. No remediation suggestions. Reflects current production architecture as-is.  
> **Sources:** PM2 live process list, `/etc/nginx/sites-*`, `deploy/` directory, `backend/jobs/`, `backend/services/`, `backend/config/`, `package.json` scripts.

---

## Table of Contents

1. [PM2 Topology](#1-pm2-topology)
2. [Nginx & Wildcard Infrastructure](#2-nginx--wildcard-infrastructure)
3. [Background Jobs](#3-background-jobs)
4. [Search Infrastructure](#4-search-infrastructure)
5. [Deployment Architecture](#5-deployment-architecture)
6. [Operational Risks](#6-operational-risks)
7. [Existing Scalability Groundwork](#7-existing-scalability-groundwork)

---

## 1. PM2 Topology

### 1.1 Ecosystem Configuration

**No `ecosystem.config.*` file exists in the repository.** PM2 processes were started via CLI commands and persisted in `/root/.pm2/dump.pm2`. There is no repo-tracked process definition.

```
find /var/www/otofine -name "ecosystem.config*" -not -path "*/node_modules/*"
→ (no results)
```

### 1.2 Running Processes

Seven PM2 processes online at time of audit:

| id | Name | Mode | Port | CWD | Restarts | Notes |
|---|---|---|---|---|---|---|
| 0 | `otofine-frontend` | fork | 3000 | `/var/www/otofine/frontend` | **127** | `npm start` → `next start` |
| 7 | `otofine-backend` | fork | 5000 | `/var/www/otofine/backend` | **141** | `npm start` → `node server.js` |
| 1 | `frontend-rfq-dev` | fork | 3001 | `/var/www/otofine/frontend-rfq-dev` | 4 | `npm run dev -- -p 3001`; only `.next/` on disk, no source |
| 2 | `backend-rfq-dev` | fork | — | `/var/www/otofine/backend-rfq-dev` | 4 | `npm start`; **cwd does not exist on disk** |
| 3 | `rfq-auto-wave-worker-prod` | fork | — | `/var/www/otofine/backend-rfq-dev` | 4 | `jobs/rfqAutoWave.worker.js`; **cwd does not exist** |
| 5 | `rfq-buyer-reminder-worker` | fork | — | `/var/www/otofine/backend` | 4 | `npm run worker:rfq-buyer-reminder` |
| 6 | `rfq-escalation-worker` | fork | — | `/var/www/otofine/backend` | 4 | `jobs/rfqEscalation.worker.js` |

**Process count:** 2 production services + 2 stale dev processes + 3 RFQ workers = 7 total.

### 1.3 Process Policies (All Apps)

| Setting | Value |
|---|---|
| `exec_mode` | `fork_mode` — single process per app, no cluster |
| `instances` | 1 |
| `autorestart` | `true` |
| `autostart` | `true` |
| `watch` | `false` |
| `cron_restart` | None |
| `max_memory_restart` | Not set |

No PM2 clustering is configured. All processes are single-instance fork mode. No memory ceiling configured.

### 1.4 Worker Poll Intervals

RFQ workers use internal poll loops, not PM2 cron:

| Worker | Poll interval | Env override |
|---|---|---|
| `rfq-auto-wave-worker-prod` | 5000 ms (default) | `RFQ_AUTO_WAVE_WORKER_POLL_MS` |
| `rfq-buyer-reminder-worker` | 20 min (default; clamped 15–30 min) | `RFQ_BUYER_REMINDER_POLL_MS` |
| `rfq-escalation-worker` | 25000 ms (default) | `RFQ_ESCALATION_WORKER_POLL_MS` |

### 1.5 Processes Not in PM2

The following processes defined in `package.json` scripts are **not running as PM2 apps**:

| Script | Entry | Status |
|---|---|---|
| `sync:scheduler` | `jobs/scheduler.js` | **Not in PM2** |
| `cron:rfq-buyer-reminder` | `jobs/rfqBuyerReminder.cron.js` | **Not in PM2** |
| `cron:rfq-escalation-repair` | `jobs/rfqEscalation.repair.js` | **Not in PM2** |
| `cron:rfq-upload-retention` | `jobs/rfqUploadRetention.js` | **Not in PM2** |
| `sync:typesense` | `scripts/sync-products-to-typesense.js --full` | **Not in PM2** |

> `jobs/scheduler.js` uses node-cron (`0 3 * * *` Asia/Ho_Chi_Minh) but is only active when the process is running. If `sync:scheduler` is not in PM2 or system cron, the nightly rebuild does not execute automatically.

### 1.6 Stale PM2 Processes

`backend-rfq-dev` (id: 2) and `rfq-auto-wave-worker-prod` (id: 3) both reference `cwd: /var/www/otofine/backend-rfq-dev` which does not exist on disk. These processes are in a restart-failure loop. `rfq-auto-wave-worker-prod` has no corresponding `package.json` npm script alias.

`frontend-rfq-dev` (id: 1) references a directory that contains only a `.next/` build artifact with no application source code.

---

## 2. Nginx & Wildcard Infrastructure

### 2.1 Active Virtual Hosts

| Config file | Symlinked in `sites-enabled` | Covers |
|---|---|---|
| `/etc/nginx/sites-available/otofine` | Yes | `otofine.com`, `www.otofine.com` |
| `/etc/nginx/sites-available/otofine-shop-subdomain.conf` | Yes | `*.otofine.com` (wildcard storefronts) |
| `/etc/nginx/sites-available/default` | No | Stock Debian default — not in use |

No dedicated vhosts for `api.otofine.com` or `rfq.otofine.com`. API traffic routes through `/api/` prefix on both apex and wildcard configs.

### 2.2 Apex Config (`otofine.com`, `www.otofine.com`)

```
HTTP  :80  → 301 HTTPS redirect
HTTPS :443 → 
  /api/*        → proxy_pass http://127.0.0.1:5000/api/
  /uploads/*    → proxy_pass http://127.0.0.1:5000/uploads/
  /             → proxy_pass http://127.0.0.1:3000
```

**SSL:** Let's Encrypt — `/etc/letsencrypt/live/otofine.com/fullchain.pem` + `privkey.pem`

**Timeouts:**
- `proxy_connect_timeout`: 60s
- `proxy_send_timeout`: 120s
- `proxy_read_timeout`: 120s
- `client_body_timeout`: 120s

**Headers forwarded:** `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`

**Client max body size:** 12 MB (`client_max_body_size 12m`)

**No Nginx-level caching** on the apex config — no `proxy_cache` directives.

### 2.3 Wildcard Storefront Config (`*.otofine.com`)

Source of truth: `/var/www/otofine/deploy/nginx/wildcard-shopsite.conf` (deployed as `/etc/nginx/sites-available/otofine-shop-subdomain.conf`).

```
HTTP  *.otofine.com :80  → 301 HTTPS redirect
HTTPS *.otofine.com :443 →
  Reserved subdomains    → 444 (connection close)
  Invalid slug shapes    → 404
  /api/*                 → proxy_pass http://127.0.0.1:5000/api/
  /uploads/*             → proxy_pass http://127.0.0.1:5000/uploads/
  /                      → proxy_pass http://otofine_frontend (127.0.0.1:3000)
```

**SSL:** Cloudflare origin certificate — `/etc/ssl/otofine/origin.pem` + `origin.key`  
(Different CA from apex — apex uses Let's Encrypt, wildcard uses Cloudflare origin cert)

**Upstream definition:**
```nginx
upstream otofine_frontend {
  server 127.0.0.1:3000;
}
```

**Robots gate at Nginx level:**
```nginx
add_header X-Robots-Tag "noindex, nofollow" always;
```
This header is set for **all** wildcard subdomain responses at the Nginx layer, independently of the `buildShopMetadata` robots meta tag in Next.js.

**Reserved subdomain guard (Nginx regex):**
Matches `www`, `api`, `admin`, `shop`, `rfq`, `mail`, `smtp`, `ftp`, `dev`, `staging`, `test` → 444 connection close.

**Slug shape guard:**
If `$subdomain` does not match `^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$` → 404.

### 2.4 SSL Summary

| Domain | Certificate | CA |
|---|---|---|
| `otofine.com`, `www.otofine.com` | Let's Encrypt | `/etc/letsencrypt/live/otofine.com/` |
| `*.otofine.com` | Cloudflare origin cert | `/etc/ssl/otofine/` |

Two separate certificate chains for apex vs wildcard.

### 2.5 Nginx-Level Cache Behavior

No Nginx `proxy_cache` or `fastcgi_cache` directives in either vhost. All caching is application-layer only:
- Backend: in-memory `responseCache.middleware.js` + Redis/LRU cache
- Frontend: Next.js `revalidate` TTL (60s for storefront)

---

## 3. Background Jobs

### 3.1 Job Inventory

| Job | Entry point | Trigger mechanism | Runs in PM2 |
|---|---|---|---|
| Nightly catalog rebuild | `jobs/scheduler.js` → `nightlyRebuild.js` | node-cron `0 3 * * *` | **No** |
| Manual nightly | `npm run sync:nightly` | Manual | No |
| Typesense full reindex | `npm run sync:typesense` | Manual only | No |
| Part knowledge match | `npm run matchPartKnowledge` | Manual only | No |
| RFQ auto-wave | `jobs/rfqAutoWave.worker.js` | Poll loop (5s) | Yes (id:3 — stale cwd) |
| RFQ escalation | `jobs/rfqEscalation.worker.js` | Poll loop (25s) | Yes (id:6) |
| RFQ buyer reminder | `jobs/rfqBuyerReminder.worker.js` | Poll loop (20 min) | Yes (id:5) |
| RFQ buyer reminder cron | `jobs/rfqBuyerReminder.cron.js` | External cron | No |
| RFQ escalation repair | `jobs/rfqEscalation.repair.js` | External cron | No |
| RFQ upload retention | `jobs/rfqUploadRetention.js` | External cron (weekly) | No |

### 3.2 Nightly Rebuild (`jobs/nightlyRebuild.js`)

**Schedule:** node-cron `0 3 * * *` via `scheduler.js`. **Only active if `sync:scheduler` process is running.**

**Pipeline (sequential):**
```
1. runPartKnowledgeProductMatch()
   → UPDATE products.part_knowledge_id (scored match)
   → Env: PART_MATCH_MIN_SCORE, PART_MATCH_OVERWRITE, PART_MATCH_DRY_RUN

2. For each product id (full table scan):
   rebuildProductAliasesForProduct  → product_aliases
   rebuildProductMetaForProduct     → product_meta
   rebuildProductFitmentScores      → product_fitment_score

3. For each car_model id (full table scan):
   syncCar → car_model_keywords, car_model_meta,
              car_model_maintenance, car_model_common_faults

4. For each part_knowledge id (full table scan):
   syncKnowledge → knowledge derivatives

5. rebuildAllCarModelRelations() → car_model_relations
```

**What nightly rebuild does NOT touch:**
- `product_list_view` — updated only by product CRUD API
- Typesense — updated only by realtime sync on CRUD or manual `sync:typesense`
- Redis cache — invalidated only on product writes

**Retry:** None per entity. Loop continues on per-entity failure. Fatal outer error: rethrow → `process.exit(1)` in CLI mode.

**Failure handling:**
- Part match step: error caught, logged, pipeline continues
- Per-entity errors: `failCount++`, logged, next entity
- Fatal: rethrow from top-level catch

**Idempotency:** DELETE+INSERT/UPSERT pattern in services — generally re-runnable. Full table iteration nightly regardless of change detection.

### 3.3 RFQ Worker Details

#### `rfqAutoWave.worker.js`

- **Poll interval:** `RFQ_AUTO_WAVE_WORKER_POLL_MS` (min 3000, default 5000 ms)
- **Job queue:** `rfq_auto_wave_jobs`
- **Claim pattern:** `UPDATE ... WHERE status='queued' AND run_at <= NOW() AND locked_until < NOW()` — **non-transactional; no `SKIP LOCKED`**
- **Stale lock recovery:** `unlockStaleAutoWaveProcessingJobs` (default 15 min)
- **Max attempts:** `RFQ_AUTO_WAVE_MAX_ATTEMPTS` (default 5) → status `dead`
- **Idempotency:** Unique `idempotency_key` on INSERT (`ER_DUP_ENTRY` ignored)
- **Failure:** Per-job error logged; worker continues; does not exit
- **PM2 status:** Running as id:3 but pointing to missing cwd `backend-rfq-dev`

#### `rfqEscalation.worker.js`

- **Poll interval:** `RFQ_ESCALATION_WORKER_POLL_MS` (default 25000 ms)
- **Job queue:** `rfq_escalation_jobs`
- **Claim pattern:** `SELECT ... FOR UPDATE SKIP LOCKED` in transaction ✓
- **Stale lock recovery:** unlock after `RFQ_ESCALATION_STALE_LOCK_MINUTES` (default 15 min)
- **Max attempts:** `RFQ_ESCALATION_MAX_ATTEMPTS` (default 5)
- **Channel:** Zalo only (`rfqZaloOaUx.js`)
- **Failure:** Per-job error logged; worker survives
- **PM2 status:** Running as id:6 with correct cwd

#### `rfqBuyerReminder.worker.js`

- **Poll interval:** `RFQ_BUYER_REMINDER_POLL_MS` (clamped 15–30 min, default 20 min)
- **Dedup:** `wasReminderSentWithinHours` check on `rfq_push_sent_log`; default 24h (`RFQ_BUYER_REMINDER_DEDUP_HOURS`)
- **Dry run:** `RFQ_BUYER_REMINDER_DRY_RUN`
- **Failure:** Tick errors logged; process continues
- **PM2 status:** Running as id:5 with correct cwd

#### `rfqBuyerReminder.cron.js` (one-shot)

- One-shot CLI for external cron scheduler
- `process.exit(1)` on error
- **No system cron entry found** — must be configured externally

#### `rfqEscalation.repair.js` (one-shot)

- Unlocks stale escalation jobs; repairs missing Zalo dispatch jobs
- `process.exit(1)` on error
- **No system cron entry found**

#### `rfqUploadRetention.js`

- Deletes files from **local filesystem** `uploads/rfq/` older than `RFQ_UPLOAD_RETENTION_DAYS`
- **Does NOT touch R2 storage** (RFQ uploads in production likely use R2 via `rfqR2Upload.service.js`)
- Noop if `RFQ_UPLOAD_RETENTION_DAYS` is 0 or less than 7
- Comment states "weekly" frequency — **no system cron entry found**

### 3.4 Cron Schedule Summary

| Job | Schedule string | Defined in | Operational status |
|---|---|---|---|
| Nightly rebuild | `0 3 * * *` Asia/Ho_Chi_Minh | `scheduler.js` | Only active if `sync:scheduler` process is running |
| RFQ buyer reminder cron | None — external | comment in cron.js | **Not scheduled** |
| RFQ escalation repair | None — external | comment in repair.js | **Not scheduled** |
| RFQ upload retention | "weekly" — external | comment in retention.js | **Not scheduled** |

### 3.5 Job Failure Handling Matrix

| Job | Error propagation | Process exit | Partial state risk |
|---|---|---|---|
| `scheduler.js` cron tick | Logged only (no rethrow) | No | Nightly may be partial |
| `nightlyRebuild.js` CLI | Fatal rethrow → `exit(1)` | Yes | Yes — partial entity sync |
| `rfqAutoWave.worker.js` | Per-job logged; tick survives | No | Job → `retry` or `dead` in DB |
| `rfqEscalation.worker.js` | Per-job logged; tick survives | No | Same |
| `rfqBuyerReminder.worker.js` | Tick error logged; survives | No | Per-RFQ in tick |
| `rfqBuyerReminder.cron.js` | `exit(1)` on error | Yes | Partial reminder batch |
| `rfqEscalation.repair.js` | `exit(1)` | Yes | Escalation queue may be inconsistent |
| `rfqUploadRetention.js` | Per-file `try/catch` skip | No | Partial file deletion |
| Typesense realtime | Errors swallowed (`console.warn`) | No | Index drift from MySQL |

---

## 4. Search Infrastructure

### 4.1 Typesense Integration

**Client config:** `productSearch.service.js` reads `TYPESENSE_HOST`, `TYPESENSE_API_KEY`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_PRODUCT_COLLECTION`.

**Feature gate:** `isTypesenseConfigured()` — if any env var missing, search falls back to MySQL silently.

**Collection:** `otofine_products` (or override via `TYPESENSE_PRODUCT_COLLECTION`)

**Schema** (from `getProductCollectionSchema()`):
- Fields: `id` (string), `partName`, `partNumber`, `shortDescription`, `category`, `brands` (string[]), `models` (string[]), `yearMin`, `yearMax`, `sortOrder` (int32), `shopProvinceId` (int32), `shopProvinceSlug`, `updatedAt`
- `default_sorting_field`: `sortOrder`

**`typesenseSearchDefaults.js`:** Query-time defaults: `num_typos: 1`, `drop_tokens_threshold: 3`, `typo_tokens_threshold: 1`, `highlight_full_fields: partName,partNumber`. Overridable by env vars.

### 4.2 Indexing Flow

**Realtime (on product CRUD):**
```
product.service.js: createProduct / updateProduct / deleteProduct
  → queueUpsertProductInTypesense(productId) / queueDeleteProductFromTypesense(productId)
     → typesenseRealtimeSync.service.js
        → loadProductRowForTypesense (MySQL GROUP_CONCAT query)
        → typesenseClient.collections[...].documents().upsert/delete
        → Errors: console.warn only — NOT propagated to caller
```

**Full reindex (manual):**
```
npm run sync:typesense
  → scripts/sync-products-to-typesense.js --full
  → Reads all products from MySQL, bulk upserts to Typesense
  → Not in PM2, not in nightly rebuild
```

### 4.3 Rebuild Flow

**Nightly rebuild (`nightlyRebuild.js`) does NOT sync Typesense.** The nightly job updates MySQL derived tables (`product_aliases`, `product_meta`, `product_fitment_score`) and part knowledge matches, but does not call `typesenseRealtimeSync` or the full reindex script.

**Typesense ↔ MySQL sync is maintained only by:**
1. Per-product CRUD (realtime, fire-and-forget)
2. Manual `npm run sync:typesense` (full rebuild — no automated trigger)

### 4.4 Search Fallback Behavior

When Typesense is unavailable or `hasLocationFilter` is true:
```javascript
if (!ts || !q || hasLocationFilter) {
  return mysqlSearchIds(mysqlOpts);
}
```
MySQL fallback uses `LOWER(...) LIKE '%...%'` on `partName`/`partNumber`/`shortDescription` — full table scan. Location filter always forces MySQL path.

### 4.5 Redis Cache Layer

**`redisCache.service.js`:**
- Key prefix: `CACHE_KEY_PREFIX` or `otofine:v1:` + `CACHE_DATA_VERSION`
- Redis client: `ioredis`, `maxRetriesPerRequest: 1`
- Fallback: in-memory LRU on Redis error (logged, no throw)
- Invalidation: `invalidateByLogicalPrefix` (SCAN pattern), `invalidateProductCaches()` (full namespace)
- **Cache contents are lost on process restart** (memory fallback) or Redis restart

**Cache invalidation triggers:**
- Product create/update/delete → `invalidateListCache()`
- Shop field update → `updateShopFieldsForShop` → `invalidateListCache()`
- No time-based expiry visible in these paths (TTL set at write time in `getOrSetCache`)

---

## 5. Deployment Architecture

### 5.1 Server Setup

```
Single server (VPS/bare metal)
├── Nginx (reverse proxy + SSL termination)
│   ├── Port 80/443: otofine.com, www.otofine.com → :3000 + :5000
│   └── Port 80/443: *.otofine.com → :3000 + :5000
├── Node.js processes via PM2
│   ├── Next.js app → :3000
│   ├── Express API → :5000
│   └── RFQ workers (poll DB)
├── MySQL (local or remote, connection via DB_HOST)
├── Redis (local, ioredis)
├── Cloudflare (DNS + DDoS/CDN in front of Nginx)
└── Cloudflare R2 (object storage for images)
```

### 5.2 Environment Files

| File | Size | Purpose |
|---|---|---|
| `/var/www/otofine/backend/.env` | 2,950 bytes | All backend secrets and feature flags |
| `/var/www/otofine/frontend/.env.local` | 759 bytes | Frontend public/server env vars |
| `/var/www/otofine/.env` | **0 bytes** — empty | Unused |

**Backend `.env` keys (names only):**
`AI_PROVIDER`, `AUTH_EXPOSE_RESET_TOKEN`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `FRONTEND_URL`, `GEMINI_API_KEY`, `GEMINI_*`, `JWT_SECRET`, `MAIL_FROM`, `NEXT_PUBLIC_API_BASE_URL`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `PORT`, `PUBLIC_SHOPSITE_ALLOWED_SLUGS`, `PUBLIC_SHOPSITE_ENABLED`, `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED`, `R2_*`, `RESEND_API_KEY`, `RESET_PASSWORD_EXPIRES_MINUTES`, `RFQ_*`, `ZALO_OA_*`

**Frontend `.env.local` keys (names only):**
`AI_PROVIDER`, `GEMINI_API_KEY`, `LOCAL_AI_*`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ONESIGNAL_APP_ID`, `NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS`, `OTOFINE_SEO_KNOWLEDGE_ENGINE`, `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED`

**`PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=true`** is confirmed present in the `otofine-frontend` PM2 process env.

### 5.3 Deploy Flow

No automated deploy pipeline exists. Current deploy process (inferred from directory state and README):

```
1. Pull updated code (git pull or manual file transfer)
2. Install dependencies: npm install
3. Build frontend: npm run build (in /frontend)
4. Run applicable migrations: npm run migrate:*
5. Restart processes: pm2 restart otofine-frontend otofine-backend
6. (Optional) Re-sync Typesense: npm run sync:typesense
```

No CI/CD pipeline, no GitHub Actions, no Dockerfile, no Makefile. All deployment is manual shell operations.

### 5.4 Migration Flow

Migrations are SQL files executed by individual Node.js runner scripts:

| Script | Migrations covered |
|---|---|
| `npm run migrate:auth` | Auth schema |
| `npm run migrate:auth:email` | Email/password reset tables |
| `npm run migrate:shopsite` | Shop storefront columns |
| `npm run migrate:rfq` | Full RFQ subsystem |
| `npm run migrate:rfq:*` | Individual named RFQ migrations |
| `npm run migrate:knowledge` | Part knowledge tables |
| `npm run migrate:seo` | SEO routes and page cache |

**No migration state table.** There is no `schema_migrations` or equivalent tracking table. Each script is a one-shot SQL executor — it does not check whether the migration has already been applied. Re-running a migration may fail with `ER_TABLE_EXISTS` or silently succeed depending on whether SQL uses `CREATE TABLE IF NOT EXISTS`.

### 5.5 Rollback Capability

**No automated rollback.** There are no down-migration scripts. Database rollback requires manual SQL or restore from backup. Code rollback requires manually reverting to a prior git state and restarting processes.

**Backup snapshots present in the filesystem:**
- `/var/www/otofine/backend_backup_20260519/`
- `/var/www/otofine/backend_backup_20260524_0811/`

These are directory-level snapshots, not database backups.

---

## 6. Operational Risks

### O1. Nightly Rebuild May Not Be Running

`jobs/scheduler.js` is not in PM2. The node-cron `0 3 * * *` schedule is only active when the `sync:scheduler` process is running as a standalone Node process. No PM2 app, no system cron, and no systemd timer for this job was found. If the process has stopped or was never started, nightly catalog rebuilds are not executing.

### O2. Typesense Drift — No Automated Full Reindex

Typesense is synced realtime on product CRUD (fire-and-forget, errors swallowed). The nightly rebuild does not call Typesense. The full reindex script (`npm run sync:typesense`) has no automated trigger. After bulk operations (mass import, knowledge match updates, nightly derives), Typesense may be out of sync with MySQL until manually reindexed.

### O3. `product_list_view` Not Updated by Nightly Rebuild

`product_list_view` is only updated by product CRUD via `syncProductListViewByProductId`. The nightly rebuild updates MySQL derived tables but not the view. If the view falls out of sync (e.g., manual DB operations, failed CRUD sync), there is no automated repair path.

### O4. Stale PM2 Processes Referencing Missing Directory

`backend-rfq-dev` (id:2) and `rfq-auto-wave-worker-prod` (id:3) reference `cwd: /var/www/otofine/backend-rfq-dev` which does not exist. These processes fail on restart. `rfq-auto-wave-worker-prod` is the production auto-wave dispatch worker — if it is actually serving the `rfq_auto_wave_jobs` queue, the broken cwd may be causing the 4 recorded restarts, and the effective polling state is unknown.

### O5. High Production Restart Counts

`otofine-frontend`: **127 restarts**. `otofine-backend`: **141 restarts**. PM2 autorestart is true with no `max_restarts` limit and no `min_uptime` configured. Repeated crash-restarts are indistinguishable from normal deploy restarts in this configuration. No alert threshold is set.

### O6. No PM2 Ecosystem File — State Not Reproducible

PM2 state exists only in `/root/.pm2/dump.pm2`. There is no `ecosystem.config.js` in the repository. A fresh server or accidental `pm2 delete all` loses all process definitions. The precise startup commands, env file paths, cwd, and memory limits are not documented in source control.

### O7. In-Memory Rate Limiting Not Shared

Backend rate limiters (`loginRateLimit.middleware.js`, `publicApiRateLimit.middleware.js`, `rfqRateLimit.middleware.js`) use in-process `Map` structures. In a multi-process deployment (or if processes restart), rate limit state resets. Currently single-process, so this is contained.

### O8. Redis Cache Lost on Process Restart

If Redis is unavailable, `redisCache.service.js` falls back to an in-process LRU cache. This in-memory fallback is lost on process restart. If Redis restarts, the cache layer also resets. No warm-up or pre-population mechanism exists.

### O9. RFQ Auto-Wave Race Condition

`rfqAutoWaveJob.repository.js` uses a non-transactional UPDATE claim (no `SKIP LOCKED`). If two `rfq-auto-wave-worker-prod` instances run simultaneously (e.g., during a brief overlap during restart), both can claim the same job row. The escalation worker uses `SKIP LOCKED` correctly — auto-wave does not.

### O10. Typesense Realtime Sync Errors Are Silently Swallowed

`typesenseRealtimeSync.service.js` catches errors with `.catch(() => {})`. A product create/update that triggers a Typesense failure leaves no trace in logs and does not surface to the API caller. The product is saved in MySQL but not indexed in Typesense until the next manual full reindex.

### O11. RFQ Upload Retention Only Covers Local Filesystem

`rfqUploadRetention.js` deletes files from local `uploads/rfq/` only. RFQ image uploads in production use Cloudflare R2 via `rfqR2Upload.service.js`. Local `uploads/rfq/` may be a staging path or legacy path. R2 retention is not managed by any job in the codebase.

### O12. Migration Runner Has No State Tracking

No migration state table exists. Running migrations manually risks double-application. SQL that uses `CREATE TABLE IF NOT EXISTS` is safe; SQL that uses `CREATE TABLE` (without IF NOT EXISTS) or `INSERT` seed data would fail or duplicate on re-run.

### O13. Two SSL Certificate Chains in Production

Apex uses Let's Encrypt (`/etc/letsencrypt/live/otofine.com/`) with automatic renewal via certbot. Wildcard uses a Cloudflare origin cert (`/etc/ssl/otofine/origin.pem`) which must be renewed manually (typically 15-year validity, but origin cert rotation requires Cloudflare dashboard access + Nginx reload). These are managed independently.

### O14. Wildcard Nginx and Next.js Middleware Both Gate Storefronts

Storefront subdomain blocking is enforced at two independent layers:

| Layer | Mechanism | Effect |
|---|---|---|
| Nginx | `X-Robots-Tag: noindex, nofollow` header on all `*.otofine.com` responses | All crawlers receive noindex regardless of app-level settings |
| Nginx | Reserved subdomain regex → 444; invalid slug → 404 | Structural protection |
| Next.js `middleware.js` | `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED` flag | Rewrite on/off |
| `buildShopMetadata.js` | `NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED` + `shop.seoEligible` | Per-shop robots meta |

Currently `X-Robots-Tag: noindex, nofollow` is set at Nginx level for all wildcard traffic. Even if `NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED=true` and `seoEligible=true` for a shop, the Nginx header overrides the app-level robots meta for crawlers that respect `X-Robots-Tag`. Enabling storefront indexing requires changing both the Nginx config and the app env flag.

### O15. No Automated Deployment Rollback

There is no rollback script, no blue/green deployment, and no staging environment on this server. Rollback requires manual git revert, rebuild, and process restart. Database rollback requires manual SQL or file restore from the backup snapshot directories.

### O16. PM2 Process Env Contains Secrets

`pm2 env <id>` exposes the full process environment including secrets from `.env` files. PM2 dump files and `pm2 jlist` output contain all env vars in plaintext. Access to the PM2 daemon or `root` shell is equivalent to secret access.

---

## 7. Existing Scalability Groundwork

The following scalability-oriented patterns are present in the current architecture:

**Typesense for search:**  
Full-text search is offloaded to Typesense rather than MySQL LIKE queries. The fallback to MySQL exists for location-filtered queries and when Typesense is unavailable.

**`product_list_view` denormalized read table:**  
A denormalized view table is maintained for fast card listing without JOIN overhead. Cursor-based pagination is implemented (`(updatedAt, productId)` cursor).

**Redis caching with LRU fallback:**  
Redis is used for listing cache with an in-process LRU as fallback. Cache invalidation is per-product and per-shop.

**Backend response cache for storefront API:**  
`responseCache.middleware.js` provides an in-memory GET cache for public shop API endpoints, tagged by shop slug for targeted invalidation.

**Shop ranking computed in-memory:**  
`shopRanking.js` computes directory ranking scores in JS without DB queries, reducing read load during directory listing.

**RFQ job queues with DB-backed state:**  
RFQ workers use DB job tables (`rfq_escalation_jobs`, `rfq_auto_wave_jobs`) rather than in-process queues. Job state survives process restarts.

**Feature flags for gradual rollout:**  
`PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED`, `PUBLIC_SHOPSITE_ALLOWED_SLUGS`, `RFQ_MODULE_ENABLED`, `RFQ_AUTO_WAVE_ENABLED`, `RFQ_ZALO_ESCALATION_ENABLED` allow individual feature surfaces to be toggled without code deployment.

**What is NOT present:**
- No horizontal scaling (all single-instance, no cluster mode)
- No container orchestration (no Docker, no Kubernetes)
- No CDN for API responses (Cloudflare is at DNS/DDoS layer only)
- No database read replicas
- No message queue (Redis pub/sub or external queue) — RFQ uses DB polling
- No distributed rate limiting (all in-process memory)
- No health check endpoints beyond the RFQ admin health page
