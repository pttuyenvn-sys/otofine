# SEARCH-GROUPED-VEHICLE-POPUP-01

**Date:** 2026-06-22  
**Objective:** Search popup shows grouped category+vehicle blocks with batch preview API (no N+1).

**Build:** `npm run build` — PASS

---

## Before / After

### Before (SEARCH-MULTI-CATEGORY-PREVIEW-01)

```
Bugi                    ← overlapping generic categories
  product · product
Bugi Sấy
  product · product
Ron Bugi
  product · product
```

**Requests:** 1 sidebar + **3 parallel** `/products?category=…` = **4 API calls**

### After

```
Bugi Toyota Altis (5)   ← resolved category + vehicle group
  product · product
Bugi Toyota Vios (4)
  product · product
Bugi Toyota Camry (3)
  product · product
Xem tất cả phụ tùng Bugi Toyota
```

**Requests:** 1 sidebar + **1** `/search-preview-batch` = **2 API calls**

---

## Architecture

```
parseSearchIntent → resolveSearchScope
    ↓
Parallel:
  GET /product-categories/search-sidebar     → sidebar category list
  GET /product-categories/search-preview-batch → [{ group, products }]
    ↓
Backend batch:
  SQL GROUP BY canonical_name × brand × model
  rankSearchPreviewGroups (phrase → vehicle → count → priority)
  Parallel getProductList per top group (server-side)
  Global product dedup (sequential, max 2 per group)
    ↓
HomeSearch: grouped blocks + view-all CTA
```

---

## API

### New (non-breaking)

`GET /api/product-categories/search-preview-batch`

| Param | Description |
|-------|-------------|
| `q` / `keyword` | Search keyword |
| `brand`, `model`, `year` | Resolved vehicle scope |
| `groupLimit` | Max groups (default 3) |
| `productsPerGroup` | Max preview per group (default 2) |

**Response:**

```json
[
  {
    "group": {
      "title": "Bugi Toyota Altis",
      "canonical_name": "Bugi",
      "canonical_slug": "bugi-o-to",
      "brand": "Toyota",
      "model": "Altis",
      "year": "",
      "total_count": 5
    },
    "products": [ /* listing card objects */ ]
  }
]
```

Existing `search-sidebar`, `/products`, etc. unchanged.

---

## Group ordering

1. Exact category phrase match  
2. Vehicle relevance (brand + model in group label)  
3. Product count  
4. `search_priority`

---

## Product preview rules

Per group: max **2** products, sorted by image → OEM → stock → newest.  
Global dedup: a product ID appears **once** in the popup.

---

## Popup UX

| Viewport | Max height | Scroll |
|----------|------------|--------|
| Desktop | **650px** | Internal panel scroll |
| Mobile | **70vh** | Internal; page fixed via overlay |

Group header click → existing SEO builder (`buildCategorySuggestNavigation`).  
Bottom CTA → `buildSuggestViewAllLabel` + keyword listing.

---

## Performance

| Metric | Multi-category (before) | Grouped batch (after) |
|--------|-------------------------|------------------------|
| Client preview requests | 3 | **1** |
| Total client requests / keystroke | 4 | **2** |
| Server product fetches | 3 (from client) | 3 (inside batch, parallel) |
| Duplicate products in popup | Possible | **Prevented** |

---

## Validation

```bash
npm run build
pm2 restart otofine-backend otofine-frontend
node scripts/validate-search-grouped-vehicle-popup-01.mjs
# + all existing search validation scripts
```

| Query | Check |
|-------|-------|
| bugi toyota | Per-model Bugi groups |
| bugi camry | Camry-scoped groups |
| má phanh vios | Má Phanh* + Vios |
| giảm xóc toyota | Multi-model groups |
| lọc dầu mazda | Mazda groups |
| đèn hậu kia | Đèn Hậu* groups |

Screenshots:
- `audit/search-grouped-vehicle-popup-01/after-grouped-popup-desktop.png`
- `audit/search-grouped-vehicle-popup-01/after-grouped-popup-mobile.png`

---

## Files changed

| File | Change |
|------|--------|
| `backend/services/searchPreviewBatch.service.js` | **NEW** — batch builder |
| `backend/utils/suggestPreviewProductSort.js` | **NEW** — preview sort |
| `backend/utils/searchPreviewGroupLabel.js` | **NEW** — group titles |
| `backend/utils/categorySuggestRanking.js` | `rankSearchPreviewGroups`; count before priority |
| `backend/controllers/productCategory.controller.js` | `searchPreviewBatch` handler |
| `backend/routes/productCategory.routes.js` | Route |
| `frontend/components/pages/Home.jsx` | Batch fetch + group navigation |
| `frontend/components/pages/home/HomeSearch.jsx` | Grouped UI |
| `frontend/components/pages/home/services/listingRequestState.js` | Batch params |
| `frontend/lib/search/searchSuggestPreviewConfig.js` | Group limit constants |
| `frontend/components/pages/Home.css` | 650px / 70vh scroll |
| `frontend/scripts/validate-search-grouped-vehicle-popup-01.mjs` | **NEW** |

**Unchanged:** SEO URLs, canonicals, sitemap, robots, API contracts for existing endpoints.

---

## Deploy

```bash
pm2 restart otofine-backend otofine-frontend
```
