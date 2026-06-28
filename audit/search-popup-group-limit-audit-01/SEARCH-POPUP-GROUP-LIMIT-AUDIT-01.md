# SEARCH-POPUP-GROUP-LIMIT-AUDIT-01

**Mode:** Read-only  
**Date:** 2026-06-27  
**Question:** Why are only **3 product groups** rendered in the search popup?

---

## Executive answer

The **3-group cap comes from the backend**, not the frontend render path.

`GET /api/search/suggest` returns **exactly 3 groups** in the JSON payload. The UI renders whatever the API sends. After `SEARCH-POPUP-UX-IMPROVEMENT-01`, the frontend **no longer slices** groups; the backend preview builder still defaults to **`groupLimit = 3`**.

| Layer | Limits groups to 3? |
|-------|---------------------|
| **Backend** (`buildInvertedPreviewBlocks` / `buildPreviewBlocksFromInventory`) | **YES** — default 3, max 6 |
| **API response** | **YES** — always 3 in live samples |
| **Frontend** (`HomeSearch.jsx`) | **NO** — renders all `response.groups` |

---

## 1. Live API response

**Endpoint:** `GET /api/search/suggest`  
**Runtime:** `InvertedSearchRuntime` (production)

| Query | `groups.length` | `categories.length` | Group titles |
|-------|-----------------|---------------------|--------------|
| bugi + Toyota | **3** | 6 | Altis, Camry, Prado |
| đèn hậu + Kia | **3** | 84 | Cerato phải/trái, Forte phải |
| má phanh + Vios | **3** | 14 | Má Phanh Vios, Trước, Cụm Phanh Sau |

The API never returned 10 or 50 groups in these samples — **always 3** vehicle preview groups.

Sidebar **categories** are separate (`categories[]`) and can be much larger (e.g. 84 for đèn hậu). Only **`groups[]`** (vehicle popup blocks with product previews) is capped at 3.

---

## 2. Frontend search

### Current render path (`HomeSearch.jsx`)

```javascript
const previewGroups = Array.isArray(searchSuggestResponse?.groups)
  ? searchSuggestResponse.groups
  : [];
```

**No `slice(0, 3)`** — all groups from the API are mapped into the popup.

### Legacy frontend limit (removed)

Prior to `SEARCH-POPUP-UX-IMPROVEMENT-01`, `HomeSearch.jsx` did:

```javascript
searchSuggestResponse.groups.slice(0, SEARCH_SUGGEST_GROUP_LIMIT)
```

That constant still exists but is **unused** in the render component:

| File | Value | Used in popup render? |
|------|-------|----------------------|
| `frontend/lib/search/searchSuggestPreviewConfig.js` | `SEARCH_SUGGEST_GROUP_LIMIT = 3` | **No** (validation scripts only) |

### Other frontend matches

No `groups.slice`, `limitGroups`, or `OnlyFirstGroups` in the suggest popup path. Unrelated `slice(0, …)` calls exist elsewhere (recent searches, categories sidebar, etc.).

---

## 3. Backend search

Production uses **inverted** runtime. Group limiting happens in **preview block builders**, after full inventory grouping/ranking.

### Primary limit (inverted — active)

**File:** `backend/services/search/runtime/invertedInventoryQuery.js`  
**Function:** `buildInvertedPreviewBlocks()`

```javascript
const groupLimit = Math.min(Math.max(Number(options.groupLimit) || 3, 1), 6);
const topGroups = (rankedVehicleGroups || []).slice(0, groupLimit);
```

- **Default:** 3  
- **Hard max:** 6  
- **Override:** query param `groupLimit` on `rawQuery` (not sent by frontend today)

Called from `InvertedSearchRuntime.searchSuggest()` → passed `groupLimit: rawQuery.groupLimit` (undefined from browser → **defaults to 3**).

### Legacy path (not active in production)

**File:** `backend/services/search/searchSuggestPreviewProducts.service.js`  
**Function:** `buildPreviewBlocksFromInventory()`

```javascript
const DEFAULT_GROUP_LIMIT = 3;
const groupLimit = Math.min(Math.max(Number(options.groupLimit) || DEFAULT_GROUP_LIMIT, 1), 6);
const topGroups = (rankedVehicleGroups || []).slice(0, groupLimit);
```

Same default **3**, max **6**.

### Index runtime path (not active)

**File:** `backend/services/search/runtime/indexInventoryQuery.js` — identical `groupLimit` default **3**, max **6**.

### Upstream functions (no 3-group cap on full inventory)

| Function | Role | Caps preview groups? |
|----------|------|----------------------|
| `fetchInvertedSharedGroupedInventory` | Retrieves & ranks all vehicle + category groups | **No** — full set used for `categories[]` |
| `fetchSharedGroupedInventory` | Legacy inventory scan | **No** |
| `rankSearchPreviewGroups` | Sorts groups | **No slice** |
| `assembleSearchSuggestResponse` | Maps blocks → JSON | **No slice** — 1 block = 1 group |

The slice happens **only** in `buildInvertedPreviewBlocks` / `buildPreviewBlocksFromInventory` before hydration.

### SQL `LIMIT 3`

No `LIMIT 3` on grouped vehicle preview in the suggest pipeline. SQL limits elsewhere (e.g. shop metrics) are unrelated.

---

## 4. End-to-end flow

```
GET /api/search/suggest?query=bugi&brand=Toyota
  → InvertedSearchRuntime.searchSuggest
  → fetchInvertedSharedGroupedInventory     // many vehicle groups ranked
  → buildInvertedPreviewBlocks
       → groupLimit = 3 (default)
       → topGroups = rankedVehicleGroups.slice(0, 3)   ◄── LIMIT HERE
  → assembleSearchSuggestResponse
  → JSON { groups: [3 items], categories: [6 items], viewAll: {...} }

Frontend HomeSearch
  → previewGroups = response.groups   // 3 items
  → render all 3
```

---

## 5. Why users still see 3 groups after UX improvement

`SEARCH-POPUP-UX-IMPROVEMENT-01` removed the **frontend** slice and the “Xem tất cả” footer, but **did not change the backend** preview limit. Since the API still returns 3 groups, the popup still shows 3.

To show more groups without changing search algorithm/ranking/grouping logic, the cap would need to be raised in **`buildInvertedPreviewBlocks`** (e.g. default or max `groupLimit`) — that would be a separate backend/config change, out of scope for this audit.

---

## 6. Related constants (aligned at 3)

| Location | Constant | Value |
|----------|----------|-------|
| Backend inverted | `groupLimit` default | 3 |
| Backend legacy | `DEFAULT_GROUP_LIMIT` | 3 |
| Frontend config | `SEARCH_SUGGEST_GROUP_LIMIT` | 3 (unused in render) |
| Frontend config | `SEARCH_SUGGEST_PRODUCTS_PER_GROUP` | 2 |
| Backend | `productsPerGroup` default | 2 |

Products per group (2) is a separate limit from group count (3).

---

## Verdict

| Source | Limits popup to 3 groups? |
|--------|---------------------------|
| **Backend** | **YES** — `buildInvertedPreviewBlocks` / `buildPreviewBlocksFromInventory`, default `groupLimit = 3` |
| **Frontend** | **NO** (after UX improvement) |

**Root cause:** Backend preview assembly slices ranked vehicle groups to **3** before building the suggest JSON response.

No implementation in this audit.
