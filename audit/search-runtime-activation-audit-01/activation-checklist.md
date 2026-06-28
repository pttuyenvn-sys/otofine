# Activation checklist — Search V2 (do not execute)

**Search V2** in this codebase = **`SEARCH_RUNTIME=inverted`** with validated sub-flags. Steps are documentation only — **not performed in this audit**.

---

## Prerequisites (verify before cutover)

- [ ] `product_search_index` populated (currently **8,602** active rows — OK)
- [ ] `search_token_index` populated (currently **352,631** rows — OK)
- [ ] Parity acceptance reviewed against your SLA (see readiness section in main audit)
- [ ] Rollback plan documented (`SEARCH_RUNTIME=legacy`)

---

## Recommended staged rollout

### Stage 0 — Shadow canary (no user impact)

Add to `backend/.env`:

```env
SEARCH_RUNTIME=legacy
SEARCH_CANARY=1
SEARCH_CANARY_SAMPLE_RATE=100
SEARCH_INVERTED_INDEX=1
```

Restart PM2. Users still receive legacy; inverted evaluated in background logs under `audit/search-inverted-runtime-canary-01/logs/`.

### Stage 1 — Enable Search V2 flags (still shadow optional)

Add/update in `backend/.env`:

```env
SEARCH_RUNTIME=inverted
SEARCH_CANDIDATE_POLICY=adaptive
SEARCH_RANKING_MODE=weighted_v2
SEARCH_GROUPING_MODE=quality_gate_v2
SEARCH_INVERTED_INDEX=1
```

Optional monitoring during live inverted:

```env
SEARCH_CANARY=1
SEARCH_CANARY_SAMPLE_RATE=10
```

### Stage 2 — Steady state

```env
SEARCH_RUNTIME=inverted
SEARCH_CANDIDATE_POLICY=adaptive
SEARCH_RANKING_MODE=weighted_v2
SEARCH_GROUPING_MODE=quality_gate_v2
SEARCH_INVERTED_INDEX=1
SEARCH_CANARY=0
```

---

## Apply configuration (when approved)

1. Edit **`/var/www/otofine/backend/.env`** — add flags above (do not commit secrets).
2. **Restart backend process:**
   ```bash
   pm2 restart otofine-backend
   ```
3. Verify:
   ```bash
   curl -s "http://127.0.0.1:5000/api/search/suggest?query=bugi&brand=Toyota" | head -c 200
   ```
   And Node config check (effective `runtime_mode` should be `inverted`).

**Do not** edit `ecosystem.config.cjs` unless you want flags in PM2 env instead of `.env` — `.env` is the current source of truth.

---

## PM2 restart vs rebuild vs reindex

| Action | Required? | Why |
|--------|-----------|-----|
| **PM2 restart** | **YES** | `getSearchRuntime()` caches runtime at first call; env read at process start |
| **npm rebuild / frontend build** | **NO** | Search runtime is backend-only; frontend unchanged |
| **Full inverted reindex** | **Only if tables stale** | Tables already populated; enable `SEARCH_INVERTED_INDEX=1` for ongoing sync |
| **Backfill script** | **Optional** | `backend/scripts/backfill-search-inverted-index-full-01.mjs` if token drift suspected |
| **product_search_index rebuild** | **Optional** | `backend/scripts/rebuild-search-index.js` if index version mismatch |

---

## Rollback

```env
SEARCH_RUNTIME=legacy
SEARCH_CANARY=0
```

```bash
pm2 restart otofine-backend
```

Sub-flags (`SEARCH_RANKING_MODE`, etc.) have no effect when runtime is legacy.

---

## Flags NOT required for Search V2

| Flag | Reason |
|------|--------|
| `SEARCH_POPUP_INDEX` | Legacy/index popup path; inverted uses `SearchIndexDocumentReader` |
| `SEARCH_RUNTIME=index` | Different runtime tier; not Search V2 |
| `SEARCH_GROUP_INDEX` | Legacy hybrid grouping assist; not inverted path |

---

## Post-activation monitoring

- Compare suggest latency (expect lower p95 vs legacy on broad queries per canary report)
- Watch canary logs if `SEARCH_CANARY=1`
- Monitor Top10/Top20 parity on production query sample
- Watch for empty suggest results (would indicate token index drift)
