# MOBILE-UX-PHASE-1 — Mobile Vehicle Sheet: Popular Models

**Mode:** IMPLEMENT (Phase 1 only)  
**Date:** 2026-06-22  
**Scope:** Mobile bottom sheet **Chọn xe** — add **Dòng xe phổ biến** below existing brand picker

---

## Summary

Mobile users tapping **Chọn xe** in the bottom nav now see the existing `VehicleQuickPanel` unchanged, plus a new **Dòng xe phổ biến** block below (divider, model list, **Xem thêm →**). Data, navigation, and styling reuse the desktop left-rail implementation — no new API, no hardcoded model list in the mobile layer.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/listing/PopularVehicleModelsSection.jsx` | **New** — shared section for desktop + mobile |
| `frontend/components/pages/home/listing/LeftNav.jsx` | Refactored to render `PopularVehicleModelsSection` (desktop markup unchanged) |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | Renders `PopularVehicleModelsSection` with `variant="mobile"` below `VehicleQuickPanel` |
| `frontend/components/pages/Home.jsx` | Passes `seoDisplayModels`; adds `applyVehicleQuickFilterMobile` wrapper |
| `frontend/components/pages/Home.css` | Mobile-only styles for popular-models block in vehicle sheet |

**Not changed:** search, router, URL builders, SEO, Discovery, desktop layout outside LeftNav extraction, `VehicleQuickPanel`, backend.

---

## Architecture

```
Home.jsx
├── seoDisplayModels (useMemo from seoVehicleHot)
├── applyVehicleQuickFilter → navigateToState(...)
├── applyVehicleQuickFilterMobile → applyVehicleQuickFilter + closeMobileVehiclePanel()
│
├── LeftNav (desktop only, unchanged UI)
│   └── PopularVehicleModelsSection (variant="desktop" default)
│
└── MobileDrawers (mobile only)
    ├── VehicleQuickPanel (unchanged)
    └── PopularVehicleModelsSection (variant="mobile")
```

### Component: `PopularVehicleModelsSection`

- **Props:** `seoDisplayModels`, `applyVehicleQuickFilter`, `variant` (`desktop` | `mobile`)
- **Behavior:** Shows first 10 models; **Xem thêm →** expands to full list (same as desktop `LeftNav`)
- **Desktop:** Inline links with `·` separators — identical to previous `LeftNav` markup
- **Mobile:** Block list with divider, touch-friendly row padding; same link classes (`of-rail-link`, `of-rail-link--muted`, `of-rail-more`)

---

## Data source (reused)

| Layer | Source |
|-------|--------|
| Loader | `fetchListingCatalogSeed()` in `listingBootstrapSync.js` |
| API | `GET /api/filter/vehicle-hot` via `fetchFilterVehicleHot()` |
| State | `seoVehicleHot` in `Home.jsx` → `seoDisplayModels` useMemo |
| Fallback | `FALLBACK_SEO_HOT_MODELS` in `lib/seo/vehicleSeoChips.js` (only when API fails — not hardcoded in mobile UI) |
| Merge | `mergeModelRowsToLength(..., 20)` — same cap as desktop |

**No new API, table, or duplicate fetch.** Mobile reads the same `seoDisplayModels` array already computed for desktop `LeftNav`.

---

## Navigation flow

1. User taps **Toyota Camry** in mobile sheet.
2. `applyVehicleQuickFilterMobile("Toyota", "Camry")` runs.
3. Inner call: `applyVehicleQuickFilter("Toyota", "Camry")` — **same handler as desktop**.
4. `navigateToState({ category: "", brand: "Toyota", model: "Camry", year: "" })`.
5. `buildListingPathForUrlState` → `router.replace(newUrl)` — **same URL as desktop**.
6. `setPage(1)`, `setSeoData(null)`.
7. `closeMobileVehiclePanel()` — closes sheet (mobile UX only; does not alter routing).

**No new routes, no `push`/`replace` logic, no URL schema changes.**

---

## UI notes

- Heading: **Dòng xe phổ biến** (`of-rail-card__h`)
- Links: `of-rail-link of-rail-link--muted` (same colors as desktop rail)
- **Xem thêm →**: `of-rail-more` (blue link, same as desktop)
- Mobile divider: `of-rail-links__divider` (1px border)
- Sheet body scrolls (`overflow-y: auto` on `mobile-filter-body--vehicle`) so popular models sit below brand chips

**Desktop:** No visual or behavioral change — `LeftNav` delegates to the same component with default variant.

---

## Regression checklist

| Check | Status |
|-------|--------|
| BottomSheet opens normally | ✓ Structure unchanged; only appended section |
| Brand selection still works | ✓ `VehicleQuickPanel` untouched |
| Toyota brand pick still works | ✓ No changes to `useVehicleQuickPanel` |
| Click Toyota Camry → same URL as desktop | ✓ Reuses `applyVehicleQuickFilter` → `navigateToState` |
| Product list updates correctly | ✓ Same state patch as desktop |
| Search unchanged | ✓ No HomeSearch edits |
| Filter unchanged | ✓ No filter API / snapshot changes |
| History unchanged | ✓ No router/history logic changes |
| Hydration | ✓ Client-only section inside existing `"use client"` tree; no SSR mismatch |
| `npm run build` | ✓ **PASS** (Next.js 15.5.15, exit 0) |

### Manual verification (recommended)

- [ ] Mobile viewport: open **Chọn xe** → scroll → see **Dòng xe phổ biến**
- [ ] Tap **Toyota Camry** → sheet closes → URL matches desktop click on same link
- [ ] Desktop left rail **Dòng xe phổ biến** unchanged (inline · layout)
- [ ] **Xem thêm →** expands list on mobile

---

## Screenshot verification

Not captured in this session (no mobile browser automation run). Verify manually on device or DevTools mobile emulation at `https://otofine.com/` → bottom nav **Chọn xe**.

---

## Out of scope (Phase 2+)

- Popular categories in mobile vehicle sheet
- Search / RFQ / Shop drawer changes
- Desktop layout changes
- New APIs or CMS for popular models

---

**Phase 1 complete.**
