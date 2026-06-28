# SEARCH-RESULTS-UNIFICATION-AUDIT-01

**Date:** 2026-06-22  
**Mode:** Read-only audit  
**Objective:** Determine whether the search popup can render as alternating **Category → Products → Category → Products** blocks without changing SEO or APIs.

---

## Verdict

**Yes — partially and safely, with a cap.**

The platform already has every endpoint needed to pair each category with its own product preview. A full interleave for *all* sidebar categories is **not recommended** without a client-side cap (payload, latency, scroll depth). A **top-K interleave** (K = 2–3) is feasible using only existing APIs, with no SEO or URL impact and no backend contract changes.

---

## Current popup rendering

### Active path (production)

`HomeHeader` → `HomeSearch.jsx` (desktop + mobile). State and fetch logic live in `Home.jsx`.

```
┌─────────────────────────────────────┐
│ Gợi ý danh mục                      │
│   • Cat 1 (count)                   │
│   • Cat 2 (count)                   │
│   • … Cat N (all from sidebar)      │
├─────────────────────────────────────┤
│ Sản phẩm phù hợp nhất               │
│   • Product 1  (max 3)              │
│   • Product 2                       │
│   • Product 3                       │
├─────────────────────────────────────┤
│ Xem tất cả (total) → top category   │
└─────────────────────────────────────┘
```

**Section order:** all categories first, then one product block scoped to **`categories[0]` only**.

### Data flow (current)

```mermaid
flowchart TD
  Q[Raw query + parsed intent] --> S[GET /product-categories/search-sidebar]
  S --> CS[categorySuggestions array]
  CS --> C0{categories[0] exists?}
  C0 -->|yes| P[GET /products?category=top&brand&model&year]
  C0 -->|no| K[GET /products/search?q=…]
  P --> SI[suggestItems]
  P --> SPI[suggestProductIntent = top category]
  K --> SI
  CS --> UI[HomeSearch: categories section + products section]
  SI --> UI
```

### Stale / unused paths

| Path | Layout | Status |
|------|--------|--------|
| `HomeSearch.jsx` | Categories → Products | **Live** |
| `SearchSuggestPanel.jsx` | Products → Categories (split) | Only referenced from dead `renderSearchPanelOnly` in `Home.jsx` |
| `renderCategoryPanel` | Sidebar category tree | Separate from search dropdown |

No production user currently sees the Products-first split layout.

---

## Proposed unified layout

```
Category 1
  Product A
  Product B
  Product C
Category 2
  Product D
  …
Category 3
  …
(optional) remaining categories without preview
Xem tất cả (N)
```

This is a **presentation + fetch fan-out** change only. Category click navigation (`buildCategorySuggestNavigation`), committed search URLs, and SEO landing paths stay unchanged.

---

## Can it be done without SEO or API changes?

| Constraint | Impact |
|------------|--------|
| SEO / URLs | **None** — popup is client-only; category clicks and “Xem tất cả” already navigate via existing helpers |
| API contracts | **None required** — reuse `search-sidebar` + `GET /products` per category (+ `products/search` fallback) |
| Ranking | **None** — category order stays `total_count DESC` from sidebar; per-category products stay `sort=popular` on listing API |

### Existing APIs (sufficient)

| Endpoint | Role today | Role in unified layout |
|----------|------------|------------------------|
| `GET /api/product-categories/search-sidebar` | Returns **all** matching canonical categories + `total_count` | Same — drives category rows |
| `GET /api/products?category=…&brand&model&year&sort=popular` | Preview for **top category only** | One call **per interleaved category block** |
| `GET /api/products/search?q=…&brand&model&year&limit=12` | Fallback when sidebar empty | Unchanged — single product block, no interleave |

**Not recommended for per-category preview:** `GET /products/search?category=…` — category filter uses normalized `partName` matching; prior work found this returns 0 for canonical category names. Listing API is the correct scope.

**Note:** `GET /products` returns a **fixed page size of 16** products server-side (`productList.service.js`). The UI already slices to 3 (`SEARCH_SUGGEST_PREVIEW_LIMIT`). No `limit` query param exists today — each preview request still transfers up to 16 card objects.

---

## Measurements

Sample query: **`má phanh vios`** (Toyota / Vios intent), local API `127.0.0.1:5000`.

### Payload

| Scenario | Requests | Approx. response bytes | Products returned (server) | Products shown (UI) |
|----------|----------|------------------------|----------------------------|---------------------|
| **Current** | 1 sidebar + 1 preview | ~1.4 KB + ~24 KB ≈ **25 KB** | 3–16 (1 category) | 3 |
| **3-block interleave** | 1 sidebar + 3 previews | ~1.4 KB + ~57 KB ≈ **58 KB** | up to 48 across 3 cats | up to 9 (3×3) |
| **Full interleave (14 cats)** | 1 + 14 previews | ~1.4 KB + ~330 KB ≈ **330 KB+** | up to 224 | up to 42 |

Sidebar returns **14** categories for this query; unbounded interleave scales linearly with category count.

### Latency (same sample, cold-ish cache)

| Pattern | Wall time |
|---------|-----------|
| Sidebar only | ~1.6 s |
| **Current** (sidebar → 1 preview sequential) | ~1.6 s |
| Top **3** previews sequential after sidebar | ~1.7 s |
| Top **3** previews **parallel** after sidebar | ~1.8 s (sidebar dominates) |
| **All 14** previews sequential | ~7.1 s |

Additional preview calls are cheap when listing cache is warm (~30–60 ms each). The first `search-sidebar` query dominates perceived latency.

### Extra requests

| K interleaved pairs | Extra requests vs today | Total per keystroke (debounced) |
|---------------------|-------------------------|----------------------------------|
| K = 1 (today) | 0 | 2 |
| K = 2 | +1 | 3 |
| K = 3 | +2 | 4 |
| K = N (all sidebar rows) | +(N−1) | 1 + N |

Debounce today: **200 ms** (`SUGGEST_FETCH_DEBOUNCE_MS`). Each debounced input can abort in-flight fetches via `AbortController`.

---

## Rendering complexity

### Current state shape (`Home.jsx`)

```javascript
categorySuggestions[]     // all categories
suggestItems[]            // products for categories[0] only
suggestProductIntent{}    // { categoryName, categoryItem } — top category
suggestPreviewTotal       // top category total_count or search found
```

Simple two-section render in `HomeSearch.jsx`; one product list, one category list.

### Unified layout — suggested state

```javascript
suggestBlocks: [
  {
    category: { canonical_name, canonical_slug, total_count },
    products: ProductCard[],   // slice(0, 3)
    loading?: boolean,
  },
  // …
]
```

| Area | Effort | Notes |
|------|--------|-------|
| Fetch orchestration | **Medium** | After sidebar, `Promise.all` top-K category previews; extend abort handling |
| Component render | **Low–Medium** | Replace two `<section>`s with `.map(block => …)` interleave |
| CSS | **Low** | Reuse `search-suggest-section`, `search-suggest-cat-row`, `search-suggest-item` |
| Empty / partial states | **Medium** | Per-block “no products”; global fallback when sidebar empty |
| “Xem tất cả” | **Low** | Keep top-category behavior or add per-block link |
| Accessibility | **Low** | Preserve `role="listbox"` / section `aria-label`s per block |
| Mobile scroll | **Medium** | More rows → taller overlay; existing keyboard-dismiss scroll listeners need block selectors |

### Files touched (if implemented later)

| File | Change |
|------|--------|
| `frontend/components/pages/Home.jsx` | Fan-out fetch, new `suggestBlocks` state |
| `frontend/components/pages/home/HomeSearch.jsx` | Interleaved section JSX |
| `frontend/components/pages/Home.css` | Spacing between block pairs |
| `frontend/components/pages/home/header/SearchSuggestPanel.jsx` | Align or delete (dead path) |

No backend, SEO, or route files required.

---

## Options ranked

### 1. Top-K interleave (recommended if pursuing unification)

- K = **2 or 3** category→product pairs, then remaining categories as **category-only rows** (no preview).
- Fetch previews in **parallel** after sidebar resolves.
- **Pros:** True unified UX, bounded payload (~2×–3× today), uses existing APIs.
- **Cons:** +1–2 requests per search; moderate state refactor.

### 2. Zero-request UI restructure (minimal)

- Render **Category 1** inline → existing product block (rename heading to category name) → **Categories 2…N** list below.
- **Pros:** No extra requests, smallest diff.
- **Cons:** Only one product group; not full Cat→Prod→Cat→Prod.

### 3. Full interleave for all sidebar categories

- **Not recommended:** up to 15+ requests and 300 KB+ per debounced query for broad keywords; long mobile scroll; diminishing UX value for tail categories.

### 4. Lazy / on-scroll load

- Render category rows immediately; fetch products when a block enters viewport.
- **Pros:** Fast first paint, spreads load.
- **Cons:** Higher implementation complexity; layout shift as previews load.

---

## Edge cases

| Case | Behavior |
|------|----------|
| No sidebar categories | Fallback `products/search` — single product list, **no interleave** |
| Category with `total_count > 0` but empty product page | Show category row + empty message for that block |
| Part-number query (`04465-0D140`) | Intent parser → search path; likely no categories |
| VF5 / thin catalog | Sidebar may be empty; interleave N/A |
| User changes query mid-flight | Existing abort logic applies; extend to N preview controllers |

---

## Summary

| Question | Answer |
|----------|--------|
| Can popup render Cat → Prod → Cat → Prod? | **Yes**, using existing `search-sidebar` + repeated `GET /products` |
| Without SEO changes? | **Yes** |
| Without API changes? | **Yes** (optional future `limit` on listing API would reduce payload but is **not required**) |
| Without extra requests? | **Only for K = 1** (today). K > 1 requires **K − 1** additional preview calls |
| Full interleave for all categories? | **Technically yes, practically no** — cap at 2–3 pairs |
| Rendering complexity | **Moderate** — mainly fetch orchestration + block state; JSX/CSS reuse is high |

**Recommendation:** If unification proceeds, implement **top-3 interleaved blocks + category-only tail** with **parallel** preview fetches. Keep SEO landing, API contracts, and sidebar ranking unchanged. Consider removing or aligning dead `SearchSuggestPanel` / `renderSearchPanelOnly` code to avoid layout drift.

---

## References

| Artifact | Path |
|----------|------|
| Live popup UI | `frontend/components/pages/home/HomeSearch.jsx` |
| Fetch + state | `frontend/components/pages/Home.jsx` (~L884–998) |
| Preview limit | `frontend/lib/search/highlightSearchQuery.js` (`SEARCH_SUGGEST_PREVIEW_LIMIT = 3`) |
| Sidebar API | `backend/controllers/productCategory.controller.js` → `searchSidebarCategories` |
| Listing API page size | `backend/services/productList.service.js` (fixed `limit = 16`) |
| Prior UX structure | `audit/search-ux-refinement-01.md` |
| Prior intent alignment | `audit/search-suggest-product-intent-alignment-01.md` |
