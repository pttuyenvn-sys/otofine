# MOBILE-RESTORE-IMPLEMENT-01 — Mobile UX Rollback

**Mode:** IMPLEMENT (restore only)  
**Date:** 2026-06-28  
**Git source revision:** `28effe4` (`28effe4b76d4ee6bf3b9c7e2e62674bddff3d397`) — `refactor: modularize Home.jsx orchestration rendering`  
**Method:** `git checkout 28effe4 -- <file>` per file; delete Mobile UX files that did not exist at that revision  

---

## Summary

All Mobile UX phases (1, 2, 3B, Cleanup) have been removed from the frontend home surface. The home page is back to the **`28effe4` committed state**: inline mobile drawers, presentational `VehicleQuickPanel`, vehicle state in `Home.jsx`, `PopularCategoriesBox` + inline popular models in `LeftNav`, bottom nav **Cẩm nang** (scroll) and **Shop** → old **Chọn phụ tùng** drawer.

**Not touched:** `app/page.js`, Discovery components, sitemap routes, `[slug]/page.js`, shop SEO libs, backend, canonical/product URL builders.

---

## Restored files (from `28effe4`)

| File | Notes |
|------|-------|
| `frontend/components/pages/Home.jsx` | Pre–Phase 1 orchestration; inline drawers; `renderCategoryPanel` / `renderLeftQuickBlocks` |
| `frontend/components/pages/Home.css` | Pre–Phase 1 styles |
| `frontend/components/pages/home/VehicleQuickPanel.jsx` | Presentational panel (no hook) |
| `frontend/components/pages/home/HomeSearch.jsx` | Pre–Cleanup / pre–search-refactor search UI |
| `frontend/components/pages/home/HomeHeader.jsx` | Restored at original path (`home/`, not `header/`) |
| `frontend/components/pages/home/LeftNav.jsx` | Pre–Phase 1 left rail |
| `frontend/components/pages/home/PopularCategoriesBox.jsx` | Inline category links |
| `frontend/components/pages/home/ProductGridWrapper.jsx` | Required import path for restored `Home.jsx` |
| `frontend/components/pages/home/SeoContent.jsx` | Required import path for restored `Home.jsx` |
| `frontend/components/pages/home/FilterBar.jsx` | Required import path for restored `Home.jsx` |
| `frontend/components/pages/home/ListingHero.jsx` | Required import path for restored `Home.jsx` |
| `frontend/components/pages/home/SearchSuggestPanel.jsx` | Required import path for restored `Home.jsx` |

The last five files are **not** Mobile UX files; they were restored from the same revision so restored `Home.jsx` imports resolve and `npm run build` passes. They match `28effe4` exactly.

---

## Deleted files (Mobile UX only — did not exist at `28effe4`)

| File | Phase introduced |
|------|------------------|
| `frontend/components/pages/home/listing/PopularVehicleModelsSection.jsx` | Phase 1 |
| `frontend/components/pages/home/listing/LeftNav.jsx` | Phase 1 / 2 |
| `frontend/components/pages/home/listing/PopularCategoriesSection.jsx` | Phase 2 |
| `frontend/components/pages/home/listing/PopularCategoriesBox.jsx` | Phase 2 (shim) |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | Phase 1 / 2 / 3B |
| `frontend/components/pages/home/sections/MobileShopSellerSection.jsx` | Phase 3B |
| `frontend/components/pages/home/sections/ShopRecommendSection.jsx` | Phase 3B |
| `frontend/components/pages/home/sections/RightRail.jsx` | Phase 3B |
| `frontend/components/pages/home/shop/mapMarketplaceToShopDirectoryParams.js` | Phase 3B |
| `frontend/components/pages/home/shop/buildShopDirectoryFetchUrl.js` | Phase 3B |
| `frontend/components/pages/home/hooks/useVehicleQuickPanel.js` | Phase 1* |
| `frontend/components/pages/home/header/HomeHeader.jsx` | Cleanup (duplicate path) |

\*Hook extraction was not in Phase 1 doc but was part of the Mobile UX working tree.

---

## Build result

```
npm run build  →  PASS (exit 0)
Next.js 15.5.15
Route /  First Load JS  144 kB  (was 156–157 kB with Mobile UX)
```

**Compile warning (non-fatal):**

```
export 'buildHomePageTitle' was not found in '@/lib/seo/homePageTitle'
```

Restored `Home.jsx` imports/re-exports `buildHomePageTitle`, but current `lib/seo/homePageTitle.js` (post–SEO work) no longer exports it. Runtime `pageTitle` uses `buildDbBackedPageTitle` in-component; home page loads correctly. Warning only.

---

## Smoke test results

Environment: `http://127.0.0.1:3000/` after `npm run build` + `pm2 restart otofine-frontend`.

### Desktop (1280×900)

| Check | Result |
|-------|--------|
| Vehicle panel — Toyota chip | **PASS** — `/phu-tung-toyota` in **227 ms** |
| Category — popular cat link | **PASS** — `/ma-phanh-truoc-o-to` in **2870 ms** |
| Search input present | **PASS** — `.category-search` ×2 |
| Shop rail (`.of-shop-rec`) | **N/A** — not present at `28effe4` (expected) |
| Page title | Renders (Otofine homepage title) |

Category navigation latency (~2.8 s) matches **pre–Mobile UX** behaviour (`startTransition` in `handlePopularCategoryClick` at `28effe4`).

### Mobile (375×812)

| Check | Result |
|-------|--------|
| Bottom nav visible | **PASS** |
| Nav labels | Trang chủ · Chọn xe · Hỏi giá · **Cẩm nang** · Shop |
| **Danh mục** sheet (Phase 2) | **Absent** — restored |
| Chọn xe → vehicle drawer | **PASS** — drawer opens |
| Shop → Phase 3B sheet | **Absent** — Shop opens **Chọn phụ tùng** drawer (`renderCategoryPanel`) |
| Cẩm nang | Scroll to SEO block (baseline behaviour) |

### Regression (unchanged)

| Area | Result |
|------|--------|
| `/sitemap.xml` | **200** — not modified |
| `app/page.js` / `HomeDiscoveryNav` | **Not modified** |
| Discovery / shop SEO / canonical libs | **Not modified** |
| `[slug]/page.js` | **Not modified** |
| Product pages / middleware | **Not modified** |

OneSignal console errors on `127.0.0.1` remain unrelated (domain restriction).

---

## What could not be restored “exactly”

| Item | Reason |
|------|--------|
| **Post–`28effe4` home modularization in same files** | Mobile UX lived in **uncommitted** changes on top of `28effe4`. Restoring plan files = restoring **`28effe4` committed snapshot**, not a hybrid with newer `listing/`, `services/`, search-suggest, or section splits still in untracked dirs |
| **`buildHomePageTitle` export** | `Home.jsx` at `28effe4` vs current `lib/seo/homePageTitle.js` — build warning; no runtime break observed |
| **Phase 3B desktop shop rail** | `ShopRecommendSection` / `RightRail` removed; **`28effe4` had no `.of-shop-rec` rail** — desktop shop recommend was added after baseline |
| **Search suggest UX** | Restored `HomeSearch.jsx` + `SearchSuggestPanel` from `28effe4` (pre–search-refactor). Newer search modules under `lib/search/` remain on disk but are unused by restored home search UI |
| **Category click speed** | Still ~2.8 s URL update — inherited from baseline, not introduced by Mobile UX alone |

---

## Remaining manual work (optional)

1. **Silence `buildHomePageTitle` warning** — remove stale import/export from `Home.jsx` *or* re-export shim from `lib/seo/homePageTitle.js` (would be a small fix, not done in this restore-only pass).
2. **Orphan untracked dirs** — `home/listing/`, `home/sections/`, `home/services/`, etc. still contain post-modularization files unused by restored `Home.jsx`. Safe to leave; delete only if repo hygiene desired (out of scope).
3. **`usePersistedOpen.js`** — still on disk; restored `Home.jsx` uses inline sessionStorage (baseline). File is unused.
4. **Deploy** — production needs same build + restart (done locally on PM2).

---

## Phases removed — verification

| Phase | Removed evidence |
|-------|-------------------|
| MOBILE-UX-PHASE-1 | No `PopularVehicleModelsSection`, no `useVehicleQuickPanel`, no popular models in mobile vehicle sheet |
| MOBILE-UX-PHASE-2 | No **Danh mục** nav; no `PopularCategoriesSection`; `PopularCategoriesBox` restored |
| MOBILE-UX-PHASE-3B | No Shop BottomSheet; no `ShopRecommendSection` / shop helpers / `RightRail` |
| MOBILE-CLEANUP-01 | `renderCategoryPanel` / `renderLeftQuickBlocks` **restored** (were removed in Cleanup) |

---

## Commands executed

```bash
git checkout 28effe4 -- \
  frontend/components/pages/Home.jsx \
  frontend/components/pages/Home.css \
  frontend/components/pages/home/VehicleQuickPanel.jsx \
  frontend/components/pages/home/HomeSearch.jsx \
  frontend/components/pages/home/HomeHeader.jsx \
  frontend/components/pages/home/LeftNav.jsx \
  frontend/components/pages/home/PopularCategoriesBox.jsx \
  frontend/components/pages/home/ProductGridWrapper.jsx \
  frontend/components/pages/home/SeoContent.jsx \
  frontend/components/pages/home/FilterBar.jsx \
  frontend/components/pages/home/ListingHero.jsx \
  frontend/components/pages/home/SearchSuggestPanel.jsx

# + delete Mobile UX files listed above

npm run build
pm2 restart otofine-frontend
```

No `git reset`, `git revert`, or whole-commit operations were used.
