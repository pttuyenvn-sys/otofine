# MOBILE-UX-PHASE-2 — Mobile Category BottomSheet

**Mode:** IMPLEMENT (Phase 2 only)  
**Date:** 2026-06-22  
**Scope:** Bottom nav **Danh mục** → category BottomSheet (popular categories only)

---

## Summary

Bottom navigation label changed from **Cẩm nang** → **Danh mục**. Tapping it opens a full-height BottomSheet using the same `mobile-drawer` / `mobile-panel` framework as **Chọn xe**, showing **Danh mục phổ biến** from the desktop datasource. Desktop left rail is unchanged (extract-only refactor via shared component).

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/listing/PopularCategoriesSection.jsx` | **New** — shared desktop + mobile popular categories |
| `frontend/components/pages/home/listing/PopularCategoriesBox.jsx` | Re-export shim → `PopularCategoriesSection` (backward compat) |
| `frontend/components/pages/home/listing/LeftNav.jsx` | Uses `PopularCategoriesSection` (desktop variant) |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | Category BottomSheet replaces old full-category drawer |
| `frontend/components/pages/Home.jsx` | Bottom nav wiring + mobile category callbacks + props |
| `frontend/components/pages/Home.css` | Mobile-only styles for `.of-rail-cats--mobile` |

**Not changed:** Search, router, URL builders, SEO, Discovery, Shop nav, API layer, `handlePopularCategoryClick` core logic.

---

## Architecture

```
Home.jsx
├── popularCategories (useMemo → computePopularCategories(menuCategories))
├── handlePopularCategoryClick → navigateToState({ category })
├── handlePopularCategoryClickMobile → handlePopularCategoryClick + closeMobileCategoryPanel()
├── closeMobileCategoryPanel → setMobileMenu(false)
│
├── LeftNav (desktop, hidden on mobile via CSS)
│   └── PopularCategoriesSection (variant="desktop")
│
└── MobileDrawers
    └── mobileMenu BottomSheet
        ├── mobile-head: "Danh mục" | "Xem"
        └── PopularCategoriesSection (variant="mobile")
```

### Component: `PopularCategoriesSection`

| Prop | Purpose |
|------|---------|
| `categories` | Popular category rows from parent |
| `selectedCategory` | Active slug for `aria-pressed` |
| `onCategoryClick` / `onCtaClick` | Desktop-compatible click handler |
| `variant` | `"desktop"` (chips) \| `"mobile"` (block list) |
| `initialLimit` | Default 12 (same as desktop) |

**Desktop HTML:** Identical to former `PopularCategoriesBox` — `box-popular-cats`, `popular-cats-chips`, `popular-cat-link`, **Xem thêm →**.

**Mobile HTML:** Block list mirroring Phase 1 vehicle popular models — `of-rail-links--mobile`, `of-rail-link--block`.

---

## Datasource reused

| Layer | Source |
|-------|--------|
| Compute | `computePopularCategories(menuCategories)` in `listingDerivedState.js` |
| Input | `menuCategories` (= `categories` from filter snapshot) |
| Memo | Single `popularCategories` useMemo in `Home.jsx` |
| Sort/limit | Top 20 by `total_product_count` (server-side rows, client sort in section for display order) |
| Expand | First **12** visible; **Xem thêm →** expands (same as desktop) |

**No new API, table, fetch, or hardcoded category list.**

---

## Navigation flow

1. User taps **Má phanh** (or any popular category) in mobile sheet.
2. `handlePopularCategoryClickMobile(cat)` runs.
3. Inner: `handlePopularCategoryClick(cat)` — **same handler as desktop LeftNav**.
4. Extracts `canonical_name` → `navigateToState({ category: nextCategory })`.
5. `setKeyword("")`, `setPage(1)` inside `startTransition`.
6. `router.replace` via existing `navigateToState` / `buildListingPathForUrlState`.
7. `closeMobileCategoryPanel()` closes sheet (mobile-only; no routing change).

**No new `router.push`, URL schema, or filter logic.**

---

## Bottom nav change

| Before | After |
|--------|-------|
| Label: **Cẩm nang** | **Danh mục** |
| Action: scroll to SEO block | `setMobileMenu(true)` → category BottomSheet |
| Icon: 📚 | 📋 |

**Shop** bottom nav item unchanged (still `/shop/login` — Phase 3+ out of scope).

---

## Mobile UX parity with Chọn xe

| Aspect | Chọn xe | Danh mục |
|--------|---------|----------|
| Overlay | `mobile-drawer` | Same |
| Panel | `mobile-panel` full viewport | Same |
| Header | Title + **Xem** close | **Danh mục** + **Xem** |
| Body scroll | `mobile-filter-body--vehicle` | Same class |
| Animation / overlay | Existing CSS | Reused |

Old **Chọn phụ tùng** drawer (`renderCategoryPanel` + quick blocks) removed from `MobileDrawers`. That drawer was never opened from UI (`setMobileMenu(true)` had no callers before Phase 2).

---

## Desktop regression

| Check | Status |
|-------|--------|
| Left rail markup | ✓ Same `box-popular-cats` / chip classes |
| Heading | ✓ **Danh mục phổ biến** |
| Expand | ✓ 12 initial + **Xem thêm →** |
| Handler | ✓ `handlePopularCategoryClick` unchanged |
| CSS | ✓ No desktop CSS edits |
| Wrapper | ✓ Still inside `left-section left-section--cats of-rail-cats` |

---

## Regression checklist

| Check | Status |
|-------|--------|
| `npm run build` | ✓ **PASS** (Next.js 15.5.15) |
| `/` First Load JS | **156 kB** (was 157 kB Phase 1 — net −1 kB) |
| Category click → URL | ✓ Same `navigateToState` |
| Product list | ✓ Unchanged fetch path |
| Search | ✓ No HomeSearch edits |
| Filter | ✓ No snapshot API changes |
| History | ✓ Still `router.replace` |
| SEO / Discovery | ✓ No module changes |
| Desktop identical | ✓ Extract-only |
| Mobile adds Category sheet only | ✓ |

---

## Build result

```
✓ Compiled successfully
Route /  First Load JS 156 kB
Exit code: 0
```

---

## Manual verification

- [ ] Mobile: bottom nav shows **Danh mục** (not Cẩm nang)
- [ ] Tap **Danh mục** → full BottomSheet, title **Danh mục**
- [ ] Body shows **Danh mục phổ biến** with category list
- [ ] **Xem thêm →** expands when >12 categories
- [ ] Tap category (e.g. Má phanh) → sheet closes → URL matches desktop click
- [ ] Desktop left rail categories unchanged
- [ ] **Chọn xe** sheet still works (Phase 1)
- [ ] Search, Hỏi giá, Shop nav unchanged

---

## Future compatibility (Phase 3+)

`PopularCategoriesSection` is props-driven and portable:

```js
<PopularCategoriesSection
  categories={scopedCategories}
  selectedCategory={activeSlug}
  onCategoryClick={handler}
  variant="mobile" | "desktop"
/>
```

Reusable for Shop drawer, Discovery widgets, or category rails **without component changes** — only pass different `categories` + handler.

---

## Optional follow-up (out of scope)

- Remove unused `renderCategoryPanel` / `renderLeftQuickBlocks` from `Home.jsx` (dead after drawer replacement)
- `React.memo(PopularCategoriesSection)` if profiling shows unnecessary rerenders

---

**Phase 2 complete.** Shop bottom nav and Phase 3 not implemented.
