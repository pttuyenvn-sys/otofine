# SEARCH-SINGLE-ENDPOINT-01

**Date:** 2026-06-22  
**Objective:** One `/api/search/suggest` request replaces sidebar + preview-batch dual fetch.

**Build:** `npm run build` — PASS

---

## Before / After

### Before

```
GET /product-categories/search-sidebar
GET /product-categories/search-preview-batch
    ↓
Frontend merge + progressive patch
    ↓
Render
```

**2 HTTP requests** · client orchestration · separate sidebar/preview state

### After

```
GET /api/search/suggest?query=…&brand=…&model=…
    ↓
{ groups, viewAll, categories }
    ↓
One render
```

**1 HTTP request** · `searchSuggestResponse` single state

---

## API

`GET /api/search/suggest`

| Param | Description |
|-------|-------------|
| `query` | Search keyword (also accepts `q`, `keyword`) |
| `brand`, `model`, `year`, `location` | Resolved vehicle scope |

**Response:**

```json
{
  "groups": [
    {
      "title": "Bugi Toyota Camry",
      "count": 26,
      "url": "/bugi-toyota-camry",
      "canonical_name": "Bugi",
      "products": []
    }
  ],
  "viewAll": {
    "label": "Xem tất cả phụ tùng Bugi Toyota",
    "url": "/phu-tung-toyota?keyword=bugi"
  },
  "categories": []
}
```

**Legacy (unchanged):**

- `GET /api/product-categories/search-sidebar`
- `GET /api/product-categories/search-preview-batch` (now wraps unified pipeline)

---

## Backend pipeline (single request)

```
keyword + scope filters
    ↓
Parallel: vehicle groups SQL + sidebar categories SQL
    ↓
rankSearchPreviewGroups → top 3
    ↓
Parallel product lists per group
    ↓
Global dedup + sort
    ↓
Build group URLs + viewAll label/url
```

---

## Performance benchmark (sample: `bugi` + Toyota)

| Metric | Before (2 requests) | After (1 request) |
|--------|---------------------|-------------------|
| Client HTTP calls | **2** | **1** |
| Network waterfall | sidebar ∥ batch | single round-trip |
| Frontend JS | merge, patch, dual state | one `setSearchSuggestResponse` |
| Cache | 1 entry (merged) | 1 entry (`response`) |

Typical API: legacy dual ~40–100ms client wall (2 parallel) · single suggest ~900–1900ms server (one round-trip, internal parallel). Client wins: **1 HTTP call**, no merge/patch JS.

**Sample benchmark (`bugi` + Toyota):**

| Metric | Before | After |
|--------|--------|-------|
| Client HTTP calls | 2 | **1** |
| Client wall (parallel legacy) | ~40–124ms | ~897–1926ms (server-bound) |
| Frontend state | sidebar + preview blocks | `searchSuggestResponse` |
| JS orchestration | Promise.all + merge | single `setState` |

---

## Frontend

- `fetchSearchSuggest()` → `/api/search/suggest`
- State: `searchSuggestResponse` only
- Cache / AbortController / dedup: **unchanged**
- Navigation: `group.url`, `viewAll.url` from API

---

## Validation

```bash
npm run build
pm2 restart otofine-backend otofine-frontend
node scripts/validate-search-single-endpoint-01.mjs
# + all existing search validation scripts
```

Screenshots:
- `audit/search-single-endpoint-01/after-single-endpoint-desktop.png`
- `audit/search-single-endpoint-01/after-single-endpoint-mobile.png`

---

## Files changed

| File | Change |
|------|--------|
| `backend/services/searchSuggest.service.js` | **NEW** — unified pipeline |
| `backend/services/searchSidebarCategories.service.js` | **NEW** — shared sidebar fetch |
| `backend/utils/buildSuggestViewAllLabel.js` | **NEW** |
| `backend/utils/listingSuggestUrls.js` | **NEW** |
| `backend/controllers/search.controller.js` | **NEW** |
| `backend/routes/search.routes.js` | **NEW** |
| `backend/server.js` | Mount `/api/search` |
| `backend/routes/productCategory.routes.js` | Legacy markers |
| `frontend/lib/search/searchSuggestFetch.js` | Single endpoint |
| `frontend/lib/search/searchSuggestCache.js` | `response` payload |
| `frontend/components/pages/Home.jsx` | `searchSuggestResponse` |
| `frontend/components/pages/home/HomeSearch.jsx` | Render from response |
| `backend/services/searchPreviewBatch.service.js` | Always join vehicle fitment for grouped SQL |

**Unchanged:** ranking, scope, parser, SEO, URLs, canonicals.

---

## Deploy

```bash
pm2 restart otofine-backend otofine-frontend
```
