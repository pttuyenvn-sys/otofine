# SEARCH-SUGGEST-PRODUCT-INTENT-ALIGNMENT-01

**Date:** 2026-06-22  
**Objective:** Align product preview in search dropdown with dominant category suggestion intent.

**Build:** `npm run build` — **PASS**

---

## Problem

Keyword `giảm xóc vios` showed relevant category suggestions (e.g. Giảm Xóc Trước Phải Toyota Vios) but product preview came from broad keyword search (`Bạc cao su…`, `Bạc bèo…`) — intent mismatch.

---

## Solution

| Rule | Behavior |
|------|----------|
| Category suggestions exist | Fetch product preview from **first ranked** category + current vehicle context via `/api/products` (listing filters) |
| No category suggestions | Fallback to `/api/products/search?q=…` (unchanged) |
| UI | Heading **"Sản phẩm phù hợp nhất"** above preview when category drives intent |

### Fetch flow (`Home.jsx`)

1. `search-sidebar` → category suggestions  
2. If `categories[0]` → `GET /products?category=…&brand=…&model=…&year=…`  
3. Else → `GET /products/search?q=…`  
4. `suggestProductIntent` state tracks aligned category for heading

Uses existing listing category map (same scope as suggestion counts), not keyword Typesense search.

---

## Validation

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
node tests/unit/request-run.js
node scripts/validate-search-suggest-product-intent-alignment-01.mjs
```

| Check | Result |
|-------|--------|
| Top suggestion Giảm Xóc Trước Phải (Toyota Vios) | **PASS** |
| Category-scoped preview all giảm xóc products | **PASS** |
| UI heading + aligned preview (no bạc cao su) | **PASS** |

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/services/listingRequestState.js` | `buildSuggestCategoryProductPreviewParams` |
| `frontend/components/pages/Home.jsx` | Intent-driven product fetch + `suggestProductIntent` |
| `frontend/components/pages/home/HomeSearch.jsx` | Preview heading |
| `frontend/components/pages/home/header/SearchSuggestPanel.jsx` | Preview heading |
| `frontend/tests/unit/request-run.js` | Unit test |
| `frontend/scripts/validate-search-suggest-product-intent-alignment-01.mjs` | **NEW** — E2E validation |

**Unchanged:** SEO, URLs, redirects, category suggestion ranking.

---

## Deploy

```bash
pm2 restart otofine-frontend
```
