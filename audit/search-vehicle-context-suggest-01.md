# SEARCH-VEHICLE-CONTEXT-SUGGEST-01

**Date:** 2026-06-22  
**Objective:** Search category suggestions preserve vehicle context (brand, model, year) in labels, counts, and click navigation.

**Build:** `npm run build` — **PASS**

---

## Problem

With Toyota Vios selected, keyword `càng a` showed category suggestions without vehicle in the label. Clicking navigated to `/cang-a-o-to`, dropping brand/model/year. Counts were global when vehicle filters were not passed (API already supported scoping when params present).

---

## Solution

| Area | Change |
|------|--------|
| **Labels** | `formatCategorySuggestLabel` → e.g. `Càng A Phải Toyota Vios` / `… 2014-2020` |
| **Counts** | Category sidebar fetch uses `buildCategorySidebarSuggestParams` (passes brand, model, full year range) |
| **Click** | `buildCategorySuggestNavigation` → SEO path via `buildListingUrlFromIdentity` with vehicle + `canonical_slug` |
| **State** | Explicit `brand`, `model`, `year`, `location` patch + `router.replace(href)` (no category-only URL) |

### Click URL priority (most specific context available)

`category + brand + model + year` → `category + brand + model` → `category + brand` → `category`

Example (Toyota Vios): `/cang-a-phai-toyota-vios`  
Example (Toyota Vios 2014-2020): `/cang-a-phai-toyota-vios-2014-2020`

---

## Backend

`normalizeListFilterYear` now accepts `YYYY-YYYY` ranges so vehicle-scoped category counts work for year-range context. `listingQueryNeedsVehicleFitmentJoin` joins fitment tables for range years.

---

## Validation

```bash
cd frontend && npm run build
pm2 restart otofine-backend otofine-frontend
node tests/unit/request-run.js
node scripts/validate-search-vehicle-context-suggest-01.mjs
```

| Check | Result |
|-------|--------|
| Label includes Toyota Vios | **PASS** |
| API count global 27 vs scoped 5 | **PASS** |
| Click → `/cang-a-phai-toyota-vios` | **PASS** |
| Unit: sidebar params keep year range | **PASS** |

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/services/categorySuggestVehicleContext.js` | **NEW** — label + href + navigation state |
| `frontend/components/pages/home/services/listingRequestState.js` | `buildCategorySidebarSuggestParams` |
| `frontend/components/pages/Home.jsx` | Vehicle-scoped fetch, labels, navigation |
| `frontend/components/pages/home/HomeSearch.jsx` | Labels + `handleCategorySuggestionClick` |
| `frontend/components/pages/home/header/SearchSuggestPanel.jsx` | Vehicle labels |
| `backend/utils/listingQueryNormalize.js` | Year-range filter support |
| `frontend/tests/unit/request-run.js` | Unit tests |
| `frontend/scripts/validate-search-vehicle-context-suggest-01.mjs` | **NEW** — E2E validation |

**Unchanged:** SEO governance, sitemap, canonical rules, redirects.

---

## Deploy

```bash
pm2 restart otofine-backend otofine-frontend
```
