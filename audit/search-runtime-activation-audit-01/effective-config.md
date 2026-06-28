# Effective configuration — SEARCH-RUNTIME-ACTIVATION-AUDIT-01

**Inspected:** 2026-06-22  
**Server:** PM2 `otofine-backend` on `/var/www/otofine/backend`

---

## backend/.env

- **Path:** `/var/www/otofine/backend/.env`
- **SEARCH_* variables:** **None** (grep confirmed)
- **Load mechanism:** `import "dotenv/config"` as first line of `backend/server.js`

Other `.env` keys present (DB_*, etc.) — not reproduced here (secrets).

---

## PM2 ecosystem

- **File:** `backend/ecosystem.config.cjs`
- **Process name in production:** `otofine-backend` (not `otofine-api` from ecosystem template)
- **Start command:** `npm start` → `node server.js`
- **CWD:** `/var/www/otofine/backend`
- **PM2 env block:** Only `NODE_ENV: "production"` in ecosystem file
- **PM2 runtime env (`pm2 env 7`):** No `SEARCH_*` keys

PM2 was started via CLI (`pm2 start npm --name otofine-backend -- start`), not necessarily via `ecosystem.config.cjs`. Either way, search flags come only from `backend/.env` defaults.

---

## Server startup chain

```
pm2 → npm start → node server.js
  → dotenv/config loads backend/.env
  → Express mounts app.use("/api/search", searchRoutes)
  → First suggest request: getSearchRuntimeMode() reads process.env.SEARCH_RUNTIME || "legacy"
```

Runtime object is cached in `searchRuntime.js` until process exit.

---

## Effective search configuration

| Setting | Source | Effective value |
|---------|--------|-----------------|
| Active runtime mode | `searchRuntimeConfig.js` default | **`legacy`** |
| Active runtime class | `getSearchRuntime()` | **`LegacySearchRuntime`** |
| Candidate policy | default | `strict` (inactive for legacy) |
| Ranking mode | default | `legacy` (inactive for legacy) |
| Grouping mode | default | `legacy` (inactive for legacy) |
| Popup index | default | off |
| Canary | default | off |
| Inverted index sync | default | off |
| Search index sync | `SEARCH_INDEX_SYNC_ENABLED` default | **enabled** (`product_search_index` maintained) |
| Search engine mode | `SEARCH_ENGINE_MODE` default | `hybrid` (legacy provider chain) |

---

## Index table state (readiness signal)

Queried read-only against production DB on 2026-06-22:

| Table | Rows |
|-------|------|
| `product_search_index` (status=active) | **8,602** |
| `search_token_index` | **352,631** |

Tables are populated even with `SEARCH_INVERTED_INDEX=0` (historical backfill + `product_search_index` sync). Incremental token sync on product updates is **skipped** while flag is off.

---

## Frontend (no runtime selection)

Search suggest always calls:

```
GET {NEXT_PUBLIC_API_URL}/search/suggest
```

Default production: `https://otofine.com/api/search/suggest`

Frontend has **no** runtime flag — backend alone determines implementation.
