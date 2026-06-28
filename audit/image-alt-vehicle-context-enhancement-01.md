# IMAGE-ALT-VEHICLE-CONTEXT-ENHANCEMENT-01

**Date:** 2026-06-22  
**Scope:** Product image `alt` text only — no sitemap, canonical, robots, JSON-LD, or URL changes

---

## Summary

Enhanced `buildProductImageAlt()` to include **primary vehicle fitment** (brand, model, year range) alongside part name and part number, using existing fitment data only.

**New format (when data available):**

`{productName} {brand} {model} {yearRange} - Mã {partNumber}`

**Limits:** target ≤180 chars, hard cap ≤220 chars (suffix ` - Mã {partNumber}` preserved when truncating).

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/seo/buildProductImageAlt.js` | Vehicle-context ALT builder, fitment resolvers, 220-char cap |
| `frontend/tests/unit/buildProductImageAlt.test.mjs` | Updated unit tests |
| `frontend/scripts/validate-image-alt-vehicle-context-enhancement-01.mjs` | **NEW** — 100-product validation |
| `frontend/components/pages/ProductDetail.jsx` | Pass `cars` + `productIdentity` to ALT builder |
| `backend/modules/products/services/canonicalPath.server.js` | Attach `cars` + `productIdentity` on list payloads; improved primary fitment loader |
| `backend/services/productCard.service.js` | Home embed cards enriched with primary fitment |

**Callers unchanged** (still use `buildProductImageAlt(product)`):  
`SeoListingContent`, `HomeProductCard`, `HomeSearch`, `SearchSuggestPanel`, `ShopProductCard`, `ShopGallery`, `CategorySeoContent`, `ProductTable`, `ProductMobileCard`, `ProductImagePopup`, `seoArticleBodyEnhance`, PDP related/recent cards.

---

## Before / After examples

| Before | After |
|--------|-------|
| `Ăng ten đuôi cá - Mã 96210A9000SWP` | `Ăng ten đuôi cá Kia Sedona 2014-2020 - Mã 96210A9000SWP` |
| `Má phanh trước - Mã 04465-0D140` | `Má phanh trước Toyota Vios 2014-2020 - Mã 04465-0D140` |
| `Lọc dầu - Mã 15400-RTA-003` | `Lọc dầu Honda City 2014-2020 - Mã 15400-RTA-003` |
| `Gương chiếu hậu phải - Mã 87620-1Y000` | `Gương chiếu hậu phải Kia Morning 2011-2017 - Mã 87620-1Y000` |

### Fallback rules (implemented)

| Case | Output |
|------|--------|
| Product + fitment + part number | Full format |
| Product + fitment | `{productName} {brand} {model} {yearRange}` |
| Product + part number | `{productName} - Mã {partNumber}` |
| Product only | `{productName}` |

### Primary fitment source order

1. `product.primaryFitment`
2. `product.productIdentity.fitment`
3. `pickPrimaryFitment(product.cars)` — same as PDP
4. Flat fields: `brand`/`model`/`yearFrom`/`yearTo` (shop cards)

---

## Coverage statistics

Validation: `node frontend/scripts/validate-image-alt-vehicle-context-enhancement-01.mjs`

| Metric | Result |
|--------|-------:|
| Sample size | 100 public products (with fitment) |
| Meaningful ALT coverage | **100%** |
| Part number in ALT (when present) | **100%** |
| Brand/model in ALT (when fitment present) | **100%** |
| Listing API sample (`/api/products`) | 16/16 with `cars[]`, 16/16 fitment in ALT |

**Live samples:**

- `Mobin Kia Cerato 2021 - Mã 273002E000`
- `Máy Phát Điện Toyota Camry 2008-2012 - Mã 270600H121`
- `Đèn hậu phải (ko led) Kia Morning 2011-2017 - Mã 924021Y000`

---

## Build result

```
cd frontend && npm run build
✓ Compiled successfully
Exit code: 0
```

Unit tests: `node frontend/tests/unit/buildProductImageAlt.test.mjs` — **PASS**

---

## Out of scope (unchanged)

- Sitemap emission
- Canonical URLs
- Robots
- JSON-LD
- Storefront URL structure
