# SEARCH-QUERY-SCOPE-AND-PREVIEW-01

**Date:** 2026-06-22  
**Objective:** Search follows query intent over page context; improve category + preview quality.

**Build:** `npm run build` — see validation below.

---

## Architecture

```
Search input
    ↓
parseSearchIntent (dictionaries: brands, modelRows, categories)
    ↓
resolveSearchScope (Rules A–D: query overrides page)
    ↓
search-sidebar API (brand / model / year params)
    ↓
rankCategorySidebarSuggestions (phrase → model groups → vehicle → priority → count)
    ↓
Top category → GET /products?category=… (no keyword search fallback)
    ↓
sortSuggestPreviewProducts → slice(5) → popup
```

**Page context** (`Toyota Altis 2015` from URL) is the default. Parsed query tokens override brand, model, and year per rules below.

---

## Scope resolution (Part 1)

| Rule | Query signal | Resolved scope (on Altis 2015 page) |
|------|--------------|-------------------------------------|
| A | Model in query (`bugi camry`) | Toyota / **Camry** / year cleared |
| B | Brand only (`bugi toyota`) | Toyota / **ALL models** / year cleared |
| C | Category only (`bugi`) | **Toyota Altis 2015** (page) |
| D | Year in query (`bugi toyota 2018`) | Toyota / ALL / **2018** |

Implementation: `resolveSearchScope()` in `frontend/lib/search/parseSearchIntent.js`.

`modelAll: true` when brand set and model empty — drives backend model-group ranking.

---

## Category ranking (Part 2)

Unchanged priority from SEARCH-RANKING-EXACT-CATEGORY-BOOST-01:

1. Exact phrase → 2. Normalized → 3. Prefix → 4. All tokens → 5. Vehicle label → 6. `search_priority` → 7. Shorter name → 8. `total_count`

Popularity (`search_priority`) never beats phrase tiers.

---

## Category grouping (Part 3)

When `modelAll`, `rankCategorySidebarSuggestions` groups by model extracted from `canonical_name` using catalog models (`getModels(brand)`), ordering model bands by peak inventory count.

Example intent: Camry-heavy bugi rows before Altis rows when counts differ.

---

## Product preview (Parts 4–7)

| Change | Detail |
|--------|--------|
| Source | **Top category only** — removed `/products/search` fallback |
| Size | **5** products (`SEARCH_SUGGEST_PREVIEW_LIMIT = 5`) |
| Order | Image → vehicle scope match → OEM PN → stock → newest |
| View all | Shown when `total_count > 5`; existing SEO navigation |

Client sort: `frontend/lib/search/sortSuggestPreviewProducts.js`.

---

## Validation

```bash
pm2 restart otofine-backend otofine-frontend
cd frontend && npm run build
node scripts/validate-search-query-scope-and-preview-01.mjs
node scripts/validate-search-ranking-exact-category-boost-01.mjs
```

| Query (page: Toyota Altis 2015) | Scope |
|----------------------------------|-------|
| bugi | Toyota Altis 2015 |
| bugi toyota | Toyota, all models |
| bugi camry | Toyota Camry |
| lọc dầu mazda | Mazda, all models |
| lọc dầu cx5 | Mazda CX-5 |
| má phanh vios | Toyota Vios |
| bugi toyota 2018 | Toyota, all models, 2018 |

Screenshot (after): `audit/search-query-scope-and-preview-01/after-má-phanh-vios-desktop.png` (desktop popup, `má phanh vios`, 5 preview rows)

### Before / After (behavior)

| | Before | After |
|---|--------|-------|
| `bugi camry` on Altis page | Inherited Altis filter | **Camry-only** scope |
| `bugi toyota` | Inherited Altis | **All Toyota** models |
| Category order | Count-only bias | Phrase + model groups |
| Preview source | Keyword search fallback | **Top category listing** |
| Preview count | 3 | **5** |
| Product order | API popular only | Image / fitment / PN / stock / newest |

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/search/parseSearchIntent.js` | `resolveSearchScope`, query flags |
| `frontend/lib/search/sortSuggestPreviewProducts.js` | **NEW** — preview ordering |
| `frontend/lib/search/highlightSearchQuery.js` | Preview limit 5 |
| `frontend/components/pages/Home.jsx` | Scope, preview sort, no keyword fallback |
| `frontend/components/pages/home/services/categorySuggestVehicleContext.js` | Labels/nav when model ALL |
| `backend/utils/categorySuggestRanking.js` | Model-group sorting |
| `backend/controllers/productCategory.controller.js` | Load models for grouping |
| `frontend/scripts/validate-search-query-scope-and-preview-01.mjs` | **NEW** |

**Unchanged:** SEO URLs, canonicals, sitemaps, robots, API response shapes.

---

## Deploy

```bash
pm2 restart otofine-backend otofine-frontend
```
