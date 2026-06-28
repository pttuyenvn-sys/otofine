# Runtime verification — SEARCH-PRODUCTION-CUTOVER-01

**Date:** 2026-06-27  
**Result:** **PASS** — production executes `InvertedSearchRuntime`

---

## 1. Configuration applied

Added to `/var/www/otofine/backend/.env`:

```env
SEARCH_RUNTIME=inverted
SEARCH_CANDIDATE_POLICY=adaptive
SEARCH_RANKING_MODE=weighted_v2
SEARCH_GROUPING_MODE=quality_gate_v2
SEARCH_INVERTED_INDEX=1
```

No search logic, ranking, candidate, or grouping code was modified.

---

## 2. getSearchRuntime() verification

Post-restart Node eval (loads same `.env` as server):

```json
{
  "SEARCH_RUNTIME": "inverted",
  "mode": "inverted",
  "runtime_is_InvertedSearchRuntime": true,
  "runtime_is_LegacySearchRuntime": false,
  "SEARCH_CANDIDATE_POLICY": "adaptive",
  "SEARCH_RANKING_MODE": "weighted_v2",
  "SEARCH_GROUPING_MODE": "quality_gate_v2",
  "SEARCH_INVERTED_INDEX": true,
  "verification_pass": true
}
```

Exit code: **0**

Selector chain:
```
getSearchRuntimeMode() → "inverted"
getSearchRuntime() → InvertedSearchRuntime (cached)
```

---

## 3. PM2 restart

```bash
pm2 restart otofine-backend
```

| Check | Status |
|-------|--------|
| Process | `otofine-backend` online |
| PID | new after restart (3148801) |
| CWD | `/var/www/otofine/backend` |
| Env source | `server.js` → `import "dotenv/config"` → `backend/.env` |

---

## 4. Live HTTP verification

### Endpoint responds

```
GET http://127.0.0.1:5000/api/search/suggest?query=bugi&brand=Toyota
→ 200 OK, 3 groups, 6 categories, TTFB 260 ms
```

### Inverted execution confirmed (not Legacy)

Legacy and inverted produce **distinct signatures** on `đèn hậu + Kia`:

| Signal | Legacy (before) | Inverted (after) |
|--------|-----------------|----------------|
| TTFB | 3,847 ms | 507 ms (prod) / 232 ms (local) |
| JSON size | 101,233 bytes | 17,736 bytes |
| Category count | ~863 (canary) / huge payload | 84 |

Production-after and local-after payloads are **byte-identical in size (17,736)** and category count (84). Legacy could not produce this profile.

### Active call chain (now)

```
GET /api/search/suggest
 → search.controller.getSearchSuggest
 → searchSuggest.service.buildSearchSuggestResponse
 → getSearchRuntime().searchSuggest()  → InvertedSearchRuntime
 → fetchInvertedSharedGroupedInventory
      → resolveInvertedSearchExecution
           → search_token_index (candidates, adaptive policy)
           → product_search_index (ranking weighted_v2, grouping)
      → applyGroupQualityGate (quality_gate_v2)
 → buildInvertedPreviewBlocks
      → SearchIndexDocumentReader (product_search_index)
 → assembleSearchSuggestResponse
```

**SQL sources:** `search_token_index` + `product_search_index` (not legacy `products` CTE path).

---

## 5. Verification outcome

| # | Check | Result |
|---|-------|--------|
| 1 | `.env` flags set | PASS |
| 2 | `getSearchRuntime()` → InvertedSearchRuntime | PASS |
| 3 | PM2 restarted | PASS |
| 4 | `/api/search/suggest` responds | PASS |
| 5 | Production no longer on Legacy signature | PASS |
| 6 | Latency improved on legacy-slow queries | PASS |

**No verification failures. Cutover complete.**
