# Feature flags — SEARCH-RUNTIME-ACTIVATION-AUDIT-01

All flags are read from `process.env` at request time (config modules) or process start (runtime cache). No flags are set in PM2 ecosystem or `backend/.env` today.

---

## SEARCH_RUNTIME

| Property | Value |
|----------|-------|
| **Default** | `legacy` |
| **Env var** | `SEARCH_RUNTIME` |
| **Config file** | `backend/config/searchRuntimeConfig.js` |
| **Fallback** | Any value other than `index` or `inverted` → `legacy` |

**Read locations:**

| File | Usage |
|------|-------|
| `backend/config/searchRuntimeConfig.js` | `getSearchRuntimeMode()`, `isSearchLegacyRuntime()`, `isSearchIndexRuntime()`, `isSearchInvertedRuntime()` |
| `backend/services/search/runtime/searchRuntime.js` | `getSearchRuntime()` selector |
| `backend/config/searchCanaryConfig.js` | `isSearchCanaryShadowMode()`, `getActiveRuntimeForCanary()` |
| Validation scripts | Set temporarily for benchmarks |

**Runtime impact:** Chooses `LegacySearchRuntime` \| `SearchIndexRuntime` \| `InvertedSearchRuntime`.

---

## SEARCH_CANDIDATE_POLICY

| Property | Value |
|----------|-------|
| **Default** | `strict` |
| **Env var** | `SEARCH_CANDIDATE_POLICY` |
| **Config file** | `backend/config/searchCandidatePolicyConfig.js` |
| **Fallback** | Any value other than `adaptive` → `strict` |
| **Related** | `SEARCH_CANDIDATE_TARGET` (default `30`), `SEARCH_CANDIDATE_LIMIT` (constant `500`) |

**Read locations:**

| File | Usage |
|------|-------|
| `backend/config/searchCandidatePolicyConfig.js` | `getSearchCandidatePolicy()`, `isAdaptiveCandidatePolicy()` |
| `backend/services/search/runtime/invertedSearchExecution.js` | Branch: `fetchAdaptiveCandidates` vs `fetchStrictCandidates` |
| `backend/services/search/runtime/invertedSearchCache.js` | Cache key includes policy |
| `backend/services/search/runtime/invertedCandidatePolicy.js` | Policy implementations |

**Runtime impact:** **Inverted only.** No effect when `SEARCH_RUNTIME=legacy`.

---

## SEARCH_RANKING_MODE

| Property | Value |
|----------|-------|
| **Default** | `legacy` |
| **Env var** | `SEARCH_RANKING_MODE` |
| **Config file** | `backend/config/searchRankingConfig.js` |
| **Fallback** | Any value other than `weighted_v2` → `legacy` |
| **Related** | `SEARCH_RANKING_EXPLAIN` (default `0`), `SEARCH_RANKING_WEIGHTS_PATH` (default `backend/config/searchRankingWeights.json`) |

**Read locations:**

| File | Usage |
|------|-------|
| `backend/config/searchRankingConfig.js` | `getSearchRankingMode()`, `isWeightedV2Ranking()`, `isSearchRankingExplainEnabled()` |
| `backend/services/search/runtime/invertedSearchRanking.js` | Ranking sort path selection |

**Runtime impact:** **Inverted only.**

---

## SEARCH_GROUPING_MODE

| Property | Value |
|----------|-------|
| **Default** | `legacy` |
| **Env var** | `SEARCH_GROUPING_MODE` |
| **Config file** | `backend/config/searchGroupingConfig.js` |
| **Fallback** | Any value other than `quality_gate_v2` → `legacy` |
| **Related** | `SEARCH_GROUPING_WEIGHTS_PATH`, `SEARCH_GROUPING_QUALITY_THRESHOLD` (default `0`), `SEARCH_GROUPING_POPUP_RESERVE` (default `3`) |

**Read locations:**

| File | Usage |
|------|-------|
| `backend/config/searchGroupingConfig.js` | `getSearchGroupingMode()`, `isQualityGateV2Grouping()` |
| `backend/services/search/runtime/invertedInventoryQuery.js` | Applies `applyGroupQualityGate()` when enabled |
| `backend/services/search/runtime/searchGroupQualityGate.js` | Gate logic |

**Runtime impact:** **Inverted only.**

---

## SEARCH_POPUP_INDEX

| Property | Value |
|----------|-------|
| **Default** | `0` (off) |
| **Env var** | `SEARCH_POPUP_INDEX` |
| **Config file** | `backend/config/searchPopupIndexConfig.js` |
| **Fallback** | Only `1` / `true` / `on` enables |

**Read locations:**

| File | Usage |
|------|-------|
| `backend/config/searchPopupIndexConfig.js` | `isSearchPopupIndexEnabled()` |
| `backend/services/search/searchSuggestPreviewProducts.service.js` | Legacy preview hydration path |
| `backend/services/search/runtime/indexProductHydration.js` | Index runtime hydration |

**Runtime impact:** **Legacy and Index runtimes only.** Inverted uses `SearchIndexDocumentReader` by default; this flag does not gate inverted popup.

---

## SEARCH_CANARY

| Property | Value |
|----------|-------|
| **Default** | `0` (off) |
| **Env var** | `SEARCH_CANARY` |
| **Config file** | `backend/config/searchCanaryConfig.js` |
| **Fallback** | Only `1` / `true` / `on` enables |
| **Related** | `SEARCH_CANARY_SAMPLE_RATE` (default `100`), `SEARCH_CANARY_LOG_DIR`, `SEARCH_CANARY_AUDIT_DIR` |

**Read locations:**

| File | Usage |
|------|-------|
| `backend/config/searchCanaryConfig.js` | `isSearchCanaryEnabled()`, `isSearchCanaryShadowMode()`, `shouldSampleCanary()` |
| `backend/services/searchSuggest.service.js` | Shadow legacy response or background comparison |
| `backend/services/search/canary/searchCanaryService.js` | Dual-run metrics |

**Runtime impact:** Does not change runtime class unless shadow mode forces legacy response to user.

---

## SEARCH_INVERTED_INDEX

| Property | Value |
|----------|-------|
| **Default** | `0` (off) |
| **Env var** | `SEARCH_INVERTED_INDEX` |
| **Config file** | `backend/config/searchInvertedIndexConfig.js` |
| **Fallback** | Only `1` / `true` / `on` enables |
| **Related** | `SEARCH_INVERTED_INDEX_LEGACY_BUILDER` (default `0`) |

**Read locations:**

| File | Usage |
|------|-------|
| `backend/config/searchInvertedIndexConfig.js` | `isSearchInvertedIndexEnabled()`, `isLegacyInvertedBuilderEnabled()` |
| `backend/services/search/inverted/invertedIndexSync.js` | Gates incremental `search_token_index` rebuild on product sync |

**Runtime impact:** **Does not select runtime.** Controls whether product sync maintains `search_token_index`. Inverted search **reads** `search_token_index` regardless; table must be populated (backfill or flag on).

---

## Effective values today (production PM2 + .env)

| Flag | Env set? | Effective |
|------|----------|-----------|
| `SEARCH_RUNTIME` | No | `legacy` |
| `SEARCH_CANDIDATE_POLICY` | No | `strict` |
| `SEARCH_RANKING_MODE` | No | `legacy` |
| `SEARCH_GROUPING_MODE` | No | `legacy` |
| `SEARCH_POPUP_INDEX` | No | off |
| `SEARCH_CANARY` | No | off |
| `SEARCH_INVERTED_INDEX` | No | off |

Verified via Node eval against live `backend/.env` on 2026-06-22.
