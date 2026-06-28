# MOBILE-CLEANUP-01 — Dead Code Removal (Mobile UX Refactor)

**Mode:** IMPLEMENT (cleanup only)  
**Date:** 2026-06-28  
**Scope:** Remove unreachable code left after Mobile UX Phases 1–3B. No UI, UX, SEO, Discovery, routing, or feature changes.

---

## Summary

Audited home/mobile code paths after BottomSheet refactor (Chọn xe, Danh mục, Shop). Removed only symbols and CSS with **zero remaining references**. Search history still writes to `localStorage` on submit; the unused React state that mirrored it was dropped.

---

## Files changed

| File | Action |
|------|--------|
| `frontend/components/pages/Home.jsx` | Removed dead render helpers, state, memos, props wiring, unused imports |
| `frontend/components/pages/home/HomeSearch.jsx` | Removed unused destructured props |
| `frontend/components/pages/home/header/HomeHeader.jsx` | Removed unused `onOpenFilter`, `onOpenMenu` props |
| `frontend/components/pages/Home.css` | Removed obsolete mobile drawer / category panel selectors |
| `frontend/components/pages/home/sections/ShopRecommendRail.jsx` | **Deleted** — unused re-export; `RightRail` imports `ShopRecommendSection` directly |

**Not changed:** `MobileDrawers.jsx`, `PopularCategoriesSection`, `ShopRecommendSection`, Discovery, SEO, sitemap, URL builders, backend.

---

## Removed code summary

### `Home.jsx`

| Removed | Reason |
|---------|--------|
| `renderCategoryPanel()` | Replaced by `PopularCategoriesSection` in `MobileDrawers` |
| `renderLeftQuickBlocks()` | Left-rail quick blocks no longer rendered from Home |
| `HOT_KEYWORDS`, `SEARCH_POPULAR_ANCHORS` | Only consumed by removed left quick blocks |
| `leftPopularOpen`, `leftRecentOpen` state | No UI reads these flags |
| `categoryItemRefs` | Only used by removed category panel |
| `handleCategorySuggestionClick` | Category sheet uses `handlePopularCategoryClick` |
| `clearRecentSearches` callback | No UI exposes clear-recent |
| `popularQuickKeywords`, `filteredCategories` memos | Only fed removed drawer UI |
| `recentSearches` React state + `readRecentSearchesFromStorage` import | State never read; `saveRecentSearch` still persists to `localStorage` |
| Trimmed `homeSearchProps` | Props not used by `HomeSearch` |
| Imports: `computePopularQuickKeywords`, `formatCategorySuggestLabel` | No remaining call sites in Home |

### `HomeSearch.jsx`

Removed unused props: `filteredCategories`, `popularQuickKeywords`, `recentSearches`, `leftPopularOpen`, `leftRecentOpen`, `clearRecentSearches`, `handleCategorySuggestionClick`, `categoryItemRefs`, and related drawer wiring.

### `HomeHeader.jsx`

Removed unused `onOpenFilter`, `onOpenMenu` — mobile nav opens sheets via bottom bar in `Home.jsx`.

### `ShopRecommendRail.jsx`

Phase 3B shim; zero imports after `RightRail` switched to `ShopRecommendSection`.

### `Home.css` (dead selectors — no JSX/class references)

| Selector block | Former use |
|----------------|------------|
| `.mobile-cat-item` | Old category list rows |
| `.right-panel`, `.mobile-panel.right-panel` | Legacy right drawer layout |
| `.mobile-copy`, `.mobile-copy .category` | Old category drawer scroll shell |
| `.mobile-panel .category li`, `.mobile-panel .search-btn` | Old in-drawer category list / CTA |
| `.mobile-menu-body` + descendants | Old category BottomSheet body (grid list, search wrap) |
| Section 7 mobile category grid rules | 2-col drawer category grid |

**Preserved:** `.mobile-filter-body`, vehicle/shop sheet styles, bottom nav, search overlay, active BottomSheet rules.

### Intentionally kept (still referenced)

- `mobileMenu`, `mobileFilter`, `mobileShop`, `mobileQuote` — active sheet state
- `saveRecentSearch` + `RECENT_SEARCHES_KEY` — localStorage persistence on search submit
- `computePopularQuickKeywords`, `formatCategorySuggestLabel` in service modules — used by tests / suggest helpers outside Home

---

## Bundle delta

| Metric | Phase 3B (pre-cleanup) | After MOBILE-CLEANUP-01 |
|--------|------------------------|-------------------------|
| `/` route size | 199 B | 199 B |
| `/` First Load JS | **157 kB** | **156 kB** (−1 kB) |
| Shared First Load JS | 103 kB | 103 kB |

First Load JS **−1 kB** (157 → 156 kB); source/CSS dead weight removed without changing route behavior.

---

## Build result

```
npm run build  →  PASS
```

- Next.js 15.5.15 — compiled successfully  
- Linting and type check — **no warnings**  
- 38 static pages generated  

---

## Regression checklist

Manual / smoke verification targets (behavior must match pre-cleanup):

| Area | Check |
|------|-------|
| Desktop | Left nav vehicle + categories; right rail shop recommend; search suggest unchanged |
| Mobile bottom nav | Trang chủ · Chọn xe · Hỏi giá · Danh mục · Shop — each opens correct sheet |
| Chọn xe sheet | `VehicleQuickPanel` + popular models |
| Danh mục sheet | `PopularCategoriesSection` |
| Shop sheet | `ShopRecommendSection` + seller footer |
| Search | Suggest groups, category hints, submit → listing + keyword param |
| Discovery | Product grid, filters, pagination |
| SEO | `SeoContent`, PartKnowledge, canonical paths untouched |
| Shop directory | Marketplace shop API + province/brand mapping |
| Vehicle / category filters | URL state + filter bar unchanged |

**Grep verification:** no remaining references to `renderCategoryPanel`, `renderLeftQuickBlocks`, `ShopRecommendRail`, `leftPopularOpen`, `mobile-menu-body`, `mobile-copy`, `mobile-cat-item`.

---

## Constraints honored

- Cleanup only — no new features  
- No stylistic or formatting-only edits  
- No Marketplace / Discovery / SEO / routing changes  
- Removed symbols confirmed unreachable before deletion  
