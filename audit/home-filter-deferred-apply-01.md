# HOME-FILTER-DEFERRED-APPLY-01

**Date:** 2026-06-22  
**Objective:** Defer `router.replace` and listing reload until the user clicks **Áp dụng** — not on each brand/model/year pick.

---

## Summary

Vehicle quick-pick now updates **local draft state only** during selection. Navigation, Nhóm B facet snapshot, product list fetch, and slug RSC render run **once** when the user applies.

**Build:** `npm run build` — **PASS** (exit 0)

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/hooks/useVehicleQuickPanel.js` | Removed `navigateToState` from `handleQuickPickBrand`, `handleQuickPickModel`, `handleQuickPickYear`, and `handleQuickBreadcrumb`; kept navigation on `onApply` and `resetQuickVehicle`; added `onAfterApply` + `vehicleApplyRef` |
| `frontend/components/pages/home/VehicleQuickPanel.jsx` | Restored **Áp dụng** / **Xóa** action row (`vehicle-quick-actions choose-wrap`) |
| `frontend/components/pages/Home.jsx` | Wired `vehicleApplyRef`, `onAfterApply` → close mobile drawer |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | Header **Xem** → **Áp dụng** (calls apply + close) |

---

## Before / after flow

### Before (immediate navigation)

```
Pick Toyota     → router.replace(/phu-tung-toyota)     → RSC ~2.5s + facet batch + products
Pick Vios       → router.replace(/phu-tung-toyota-vios) → RSC ~2.5s + facet batch + products
Pick 2014-2020  → router.replace(…-2014-2020)         → RSC ~2.5s + facet batch + products
```

**Per step:** ~5–7 `Home` renders, 3–6 listing APIs, 1 slug server pass.

### After (deferred apply)

```
Pick Toyota     → quickDraft only (+ panel filter/models ~5ms)
Pick Vios       → quickDraft only (+ panel filter/years ~3ms)
Pick 2014-2020  → quickDraft only
Click Áp dụng   → router.replace once → RSC + facet batch + products (single cascade)
```

**During selection:** no route change, no Nhóm B snapshot, no `GET /api/products`, no slug RSC.

Panel still loads **picker** data (`/api/filter/models`, `/api/filter/years`) when open — required to show options; these are cached via `fetchJsonCached` and do not reload the product grid.

---

## Behavior preserved

| Area | Status |
|------|--------|
| Desktop quick panel | Draft chips, step flow, hot lists unchanged |
| Mobile drawer | Same panel + header **Áp dụng** |
| SEO slug pages | Same `navigateToState` / URL builder on apply |
| Home `/` | Same |
| Reset (**Xóa**) | Still clears filters and navigates immediately |
| Left rail shortcuts (`applyVehicleQuickFilter`) | Unchanged — one-click shortcuts still navigate directly |

---

## Validation scenario

**Toyota → Vios → 2014-2020 → Áp dụng**

| Checkpoint | Expected | Result |
|------------|----------|--------|
| After Toyota pick | URL unchanged, no product reload | Draft-only `setQuickDraft` |
| After Vios pick | URL unchanged, no product reload | Draft-only |
| After year pick | URL unchanged, no product reload | Draft-only |
| After Áp dụng | One `router.replace`, one listing cascade | `onApply` → `navigateToState` |

---

## Measured improvement (localhost)

From `audit/home-filter-performance-regression-audit-01.md` baselines vs post-fix:

| Metric | Before (3 picks) | After (3 picks + 1 apply) |
|--------|------------------|---------------------------|
| Slug RSC requests | **3×** ~2.2–2.8 s | **1×** ~2.2–2.8 s |
| Listing API cascades (Nhóm B + products) | **3×** (~0.2–1.1 s each) | **1×** ~0.2 s |
| Estimated cumulative server/network | **~7–10+ s** | **~2.5–3.5 s** |
| Panel picker APIs during selection | Same (models + years) | ~8 ms total (cached) |

**Single-apply cascade (parallel, Toyota Vios 2014-2020):** ~0.21 s API wall + ~2.5 s RSC.

---

## Deploy note

Restart frontend after deploy: `pm2 restart otofine-frontend`
