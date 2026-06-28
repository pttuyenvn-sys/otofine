# Live request trace — SEARCH-RUNTIME-ACTIVATION-AUDIT-01

## Request

```
GET /api/search/suggest?query=bugi&brand=Toyota
```

**Verified:** 2026-06-22 against local PM2 backend (`http://127.0.0.1:5000`) — same process/env as production `otofine-backend`.

| Metric | Value |
|--------|-------|
| TTFB | 165 ms |
| Response | JSON with 3 vehicle groups, preview products |
| Config eval (same host) | `effective_runtime_mode: "legacy"` |

Production curl (`https://otofine.com/api/search/suggest?query=bugi&brand=Toyota`): TTFB ~528 ms — same endpoint, same legacy latency profile per prior audits.

---

## Full call chain

```
GET /api/search/suggest
  └─ backend/routes/search.routes.js
       router.get("/suggest", getSearchSuggest)
  └─ backend/controllers/search.controller.js
       getSearchSuggest(req, res)
         • query = req.query.query || keyword || q
         • buildSearchSuggestResponse(req.query)
  └─ backend/services/searchSuggest.service.js
       buildSearchSuggestResponse(rawQuery)
         • isSearchCanaryShadowMode() → false (SEARCH_CANARY off)
         • getSearchRuntime().searchSuggest(rawQuery)
  └─ backend/services/search/runtime/searchRuntime.js
       getSearchRuntime()
         • getSearchRuntimeMode() → "legacy"
         • returns LegacySearchRuntime (cached)
  └─ backend/services/search/runtime/LegacySearchRuntime.js
       searchSuggest(rawQuery)
         1. cleanKeyword(rawQuery)
         2. normalizeListingQuery(rawQuery)
         3. fetchSharedGroupedInventory(rawQuery, keyword)
         4. buildPreviewBlocksFromInventory(ctx, vehicleGroups, listing, opts)
         5. assembleSearchSuggestResponse(rawQuery, blocks, categoryGroups)
  └─ res.json(payload)
```

---

## Step 3 — fetchSharedGroupedInventory (Legacy)

**File:** `backend/services/search/searchGroupedInventory.service.js`

```
fetchSharedGroupedInventory
  ├─ isSearchGroupIndexEnabled() → false (SEARCH_GROUP_INDEX unset)
  ├─ buildSearchInventoryContext(rawQuery, keyword)
  │    └─ searchProviderChain (SEARCH_ENGINE_MODE=hybrid)
  │         → provider: structured+fulltext or like-fallback
  └─ fetchGroupedInventoryFromMatchedCte(ctx)
       └─ SQL on products + product_category_map + product_car_applications + car_models
```

---

## Step 4 — buildPreviewBlocksFromInventory

**File:** `backend/services/search/searchSuggestPreviewProducts.service.js`

```
buildPreviewBlocksFromInventory
  ├─ isSearchPopupIndexEnabled() → false
  └─ fetchBatchPreviewProductRows(...)
       └─ SQL SELECT from products + LATERAL product_car_applications
       └─ Optional SearchIndexDocumentReader (not taken when popup index off)
```

---

## Step 5 — assembleSearchSuggestResponse

**File:** `backend/services/search/runtime/searchSuggestAssembly.js`

Builds `{ groups, viewAll, categories }` JSON.

---

## SQL sources for this live request

From `audit/search-runtime-trace-audit-01/sql-trace.json` (same query class, prior traced run):

| Source | Used? | Notes |
|--------|-------|-------|
| **`products`** | **YES** | Primary match, grouping CTE, preview hydration |
| **`product_search_index`** | **NO** | 0% of SQL in legacy trace |
| **`search_token_index`** | **NO** | Inverted-only retrieval |
| Supporting tables | YES | `product_category_map`, `product_categories`, `product_car_applications`, `car_models`, `shops`, `product_images` |

**Classification:** `PRODUCTS_ONLY` — legacy products path.

---

## Inverted path (NOT executed today)

Would activate only if `SEARCH_RUNTIME=inverted`:

```
InvertedSearchRuntime.searchSuggest
  └─ fetchInvertedSharedGroupedInventory
       └─ resolveInvertedSearchExecution
            ├─ fetchInvertedCandidatesByTokens → search_token_index
            ├─ rankInvertedProductIds → product_search_index
            └─ fetchIndexGroupedInventory → product_search_index
       └─ [optional] applyGroupQualityGate if SEARCH_GROUPING_MODE=quality_gate_v2
  └─ buildInvertedPreviewBlocks
       └─ SearchIndexDocumentReader.readForPreview (product_search_index)
  └─ assembleSearchSuggestResponse
```

---

## Function list (Legacy suggest — ordered)

| # | Function | Module |
|---|----------|--------|
| 1 | `getSearchSuggest` | `controllers/search.controller.js` |
| 2 | `buildSearchSuggestResponse` | `services/searchSuggest.service.js` |
| 3 | `getSearchRuntime` | `services/search/runtime/searchRuntime.js` |
| 4 | `getSearchRuntimeMode` | `config/searchRuntimeConfig.js` |
| 5 | `LegacySearchRuntime.searchSuggest` | `services/search/runtime/LegacySearchRuntime.js` |
| 6 | `cleanKeyword` | LegacySearchRuntime |
| 7 | `normalizeListingQuery` | `utils/listingQueryNormalize.js` |
| 8 | `fetchSharedGroupedInventory` | `services/search/searchGroupedInventory.service.js` |
| 9 | `buildSearchInventoryContext` | `services/search/searchInventoryQuery.js` |
| 10 | `searchProviderChain` | `services/search/providers/searchProviderChain.js` |
| 11 | `fetchGroupedInventoryFromMatchedCte` | `services/search/searchInventoryQuery.js` |
| 12 | `getModels` | `services/productList.service.js` (if brand-only) |
| 13 | `rankCategorySidebarSuggestions` | `utils/categorySuggestRanking.js` |
| 14 | `rankSearchPreviewGroups` | `utils/categorySuggestRanking.js` |
| 15 | `buildPreviewBlocksFromInventory` | `services/search/searchSuggestPreviewProducts.service.js` |
| 16 | `fetchBatchPreviewProductRows` | same |
| 17 | `assembleSearchSuggestResponse` | `services/search/runtime/searchSuggestAssembly.js` |
