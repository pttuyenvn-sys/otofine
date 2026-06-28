# HOME-FILTER-IMMEDIATE-NAVIGATION-RESTORE-01

**Date:** 2026-06-22  
**Objective:** Restore immediate navigation on brand / model / year pick (rollback deferred-apply UX). Keep backend optimizations (year-range-links, SEO, image, sitemap).

**Build:** `npm run build` — **PASS**

---

## Summary

Quick-pick handlers call `navigateToState()` again on each selection. **Áp dụng** apply-only flow removed. Slug URL, H1, and product grid update on every pick.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/home/hooks/useVehicleQuickPanel.js` | Restored `navigateToState` + `setSeoData(null)` + `setPage(1)` in `handleQuickPickBrand` / `Model` / `Year` and breadcrumb steps; removed `onApply`, `onAfterApply`, `vehicleApplyRef` |
| `frontend/components/pages/home/VehicleQuickPanel.jsx` | Removed **Áp dụng** button; kept **Xóa** |
| `frontend/components/pages/Home.jsx` | Removed `vehicleApplyRef`, `handleVehicleFilterApplied`, deferred-apply props |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | Header **Áp dụng** → **Xem** (close drawer); removed `vehicleApplyRef` |
| `frontend/scripts/validate-home-filter-immediate-navigation-restore-01.mjs` | **NEW** — E2E validation |

**Unchanged:** `GET /api/seo/year-range-links`, `buildListingYearRangeLinks.server.js`, image/SEO/sitemap work.

---

## Before / after UX

| Action | Deferred apply (removed) | Immediate (restored) |
|--------|--------------------------|---------------------|
| Pick Toyota | Draft only; URL/H1/products unchanged | → `/phu-tung-toyota`, H1 + products update |
| Pick Vios | Draft only | → `/phu-tung-toyota-vios` |
| Pick 2020 | Draft only | → `/phu-tung-toyota-vios-2020` |
| Extra **Áp dụng** click | Required | **Removed** |
| Mobile header | Apply + close | **Xem** closes drawer (listing already updated on pick) |

---

## Timing measurements (Playwright, localhost post-deploy)

**Flow:** `/` → Toyota → Vios → 2020

### Warm validation run (`validate-home-filter-immediate-navigation-restore-01.mjs`)

| Step | Wall-clock to URL + products | Path |
|------|-----------------------------:|------|
| Brand | **655 ms** | `/phu-tung-toyota` |
| Model | **426 ms** | `/phu-tung-toyota-vios` |
| Year | **432 ms** | `/phu-tung-toyota-vios-2020` |
| **Total** | **1,513 ms** | |

Model/year picks within **~0.4–0.7 s** target band; brand first step ~**0.65 s**.

### Cold-ish first run (post PM2 restart)

| Step | ms |
|------|---:|
| Brand | 1,699 |
| Model | 1,458 |
| Year | 1,661 |
| Total | 4,818 |

Each step triggers listing product API reload (expected). Still **~4–5× faster** than pre-optimization immediate (~7–10 s total) per baseline audit.

---

## Validation

```bash
pm2 restart otofine-frontend
node frontend/scripts/validate-home-filter-immediate-navigation-restore-01.mjs
cd frontend && npm run build
```

---

## Deploy

```bash
pm2 restart otofine-frontend
```
