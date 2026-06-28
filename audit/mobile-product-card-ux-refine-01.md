# MOBILE-PRODUCT-CARD-UX-REFINE-01

**Date:** 2026-06-22  
**Objective:** Refine mobile product card UX only — no desktop layout/data/SEO changes.

**Build:** `npm run build` — **PASS**

---

## Summary

| Issue | Fix |
|-------|-----|
| **Duplicate location** | Scoped mobile location styles to `.of-product__meta--l3`; forced `.of-product__location--side { display: none }` on mobile (later CSS had re-shown it via `.of-product__location { display: inline }`) |
| **CTA too tall** | `Gọi báo giá` → **36px** height (`min-height: 36px`, `padding: 4px 14px`), same font size |
| **Cards blend together** | `1px solid var(--of-border)` + `box-shadow: 0 1px 4px rgba(0,0,0,.06)` + **8px** list gap |

---

## Before / after

### Mobile (`390×844`)

**Before:** Location shown twice (metadata + side row above CTA); flat list rows; tall CTA (~44px min-height).

**After:** Single location in metadata; chip-style separated cards; CTA **36px**.

Screenshot: `audit/screenshots/mobile-product-card-ux-refine-01/after-mobile-toyota-vios.png`

### Desktop (`1280×900`)

Unchanged behavior: metadata hidden, side location visible, desktop shadow retained.

Screenshot: `audit/screenshots/mobile-product-card-ux-refine-01/after-desktop-toyota-vios.png`

---

## Validation

```bash
cd frontend && npm run build
pm2 restart otofine-frontend
node frontend/scripts/validate-mobile-product-card-ux-refine-01.mjs
```

| Check | Mobile | Desktop |
|-------|--------|---------|
| Side location visible | **0** (hidden) | **1** (shown) |
| Meta location | **1** | hidden via CSS |
| CTA height | **36px** | **45px** (unchanged pattern) |
| Card shadow | soft `0 1px 4px` | desktop `var(--of-shadow-sm)` |

**Result:** ALL PASS

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/Home.css` | Mobile-only product card border/shadow/gap; location selector scoping; CTA height; hide `--side` on mobile |
| `frontend/scripts/validate-mobile-product-card-ux-refine-01.mjs` | **NEW** — mobile/desktop checks + screenshots |

**Unchanged:** `HomeProductCard.jsx` markup (desktop still uses `location--side`; mobile hidden via CSS).

---

## Deploy

```bash
pm2 restart otofine-frontend
```
