# IMAGE-ALT-COVERAGE-IMPLEMENT-01

**Date:** 2026-06-22  
**Status:** Implemented and validated  
**Build:** `npm run build` — PASS  
**Validation:** `node scripts/validate-image-alt-coverage-implement-01.mjs` — PASS

---

## Summary

Introduced shared `buildProductImageAlt()` and wired it across marketplace and shop **product image** surfaces. ALT standard: `{productName} - Mã {partNumber}` (≤160 chars). Decorative assets (logos, shop promo banners, seller avatars, brand watermarks) unchanged.

**Unchanged per requirements:** URL structure, canonical, robots, sitemap, JSON-LD.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/seo/buildProductImageAlt.js` | **NEW** — shared ALT builder |
| `frontend/tests/unit/buildProductImageAlt.test.mjs` | **NEW** — unit tests |
| `frontend/scripts/validate-image-alt-coverage-implement-01.mjs` | **NEW** — coverage validator |
| `frontend/components/pages/ProductDetail.jsx` | Main, thumbs, lightbox, related, recent |
| `frontend/components/seo/SeoListingContent.jsx` | Listing product cards |
| `frontend/components/seo/SeoListingProductImage.jsx` | Fallback non-empty default |
| `frontend/components/pages/home/HomeProductCard.jsx` | Home / search listing cards |
| `frontend/components/pages/home/HomeImages.jsx` | `SearchSuggestThumb` accepts `alt` |
| `frontend/components/pages/home/header/SearchSuggestPanel.jsx` | Search suggest ALT |
| `frontend/components/pages/home/HomeSearch.jsx` | Search suggest ALT |
| `frontend/components/shopsite/ShopProductCard.jsx` | Shop listing cards |
| `frontend/components/shopsite/ShopGallery.jsx` | Product tiles only (shop branding stays decorative) |
| `frontend/components/seo/CategorySeoContent.jsx` | Category product grid |
| `frontend/components/seo/seoArticleBodyEnhance.js` | Inline article product images |
| `frontend/components/products/ProductTable.jsx` | Seller dashboard thumbs |
| `frontend/components/pages/products/ProductMobileCard.jsx` | Seller mobile thumbs |
| `frontend/components/popup/ProductImagePopup.jsx` | Seller image viewer |

---

## Coverage before (from IMAGE-SEO-AUDIT-01 + code audit)

| Surface | Before |
|---------|--------|
| Marketplace PDP main image | Title only (no part number) |
| Marketplace PDP thumbs / lightbox / related / recent | `alt=""` |
| SEO listing cards (`SeoListingContent`) | `alt=""` (~100% of listing product imgs) |
| Home / search cards | Title only (no `Mã {partNumber}`) |
| Search suggest thumbs | `alt=""` |
| Shop product cards | Title only |
| Shop gallery | All `alt=""` (including product photos) |
| **Est. meaningful ALT with part number** | **~30–40%** of product image instances |

---

## Coverage after

| Metric | Result |
|--------|--------|
| **Meaningful ALT coverage** (50-product sample) | **100%** |
| **Empty ALT** (product surfaces) | **0** |
| **Missing part number** (when `partNumber` present) | **0** |
| **Source audit:** `alt=""` on `SeoListingContent` product imgs | **0** |

### Sample generated ALT values

```
Ăng ten đuôi cá - Mã 96210A9000SWP
Ăng ten thu tín hiệu chìa khóa - Mã 95420A7200
Bạc balie - Mã 210202B913
```

---

## ALT standard (implemented)

```
{productName} - Mã {partNumber}   // when part number exists
{productName}                     // when no part number
Phụ tùng ô tô                     // fallback
```

Max length: **160 characters** (name truncated with `…` when needed; part number preserved).

---

## Surfaces covered

| Area | Component |
|------|-----------|
| Marketplace PDP | `ProductDetail.jsx` |
| Marketplace listing (CBM, brand, category, ranges) | `SeoListingContent.jsx` |
| Homepage cards | `HomeProductCard.jsx` |
| Search results / suggest | `SearchSuggestPanel.jsx`, `HomeSearch.jsx` |
| Category SEO grid | `CategorySeoContent.jsx` |
| SEO articles (inline products) | `seoArticleBodyEnhance.js` |
| Shop homepage / collection / SEO | `ShopProductCard.jsx`, `ShopSeoListingView` (via card) |
| Shop product gallery tiles | `ShopGallery.jsx` (product URLs only) |
| Seller product admin | `ProductTable.jsx`, `ProductMobileCard.jsx`, `ProductImagePopup.jsx` |

### Intentionally unchanged (decorative)

- Shop logos, covers, promo banners (`PromoBanner` `aria-hidden`)
- Listing hero brand watermarks (`ListingHero`)
- Seller avatar on PDP (`alt=""`)
- RFQ / admin moderation UI (non-public SEO surfaces)
- `SeoPublicHeader` logo ALT

---

## Build result

```
npm run build — PASS (Next.js 15.5.15)
node tests/unit/buildProductImageAlt.test.mjs — PASS
node scripts/validate-image-alt-coverage-implement-01.mjs — PASS
```

---

## Regression notes

| Risk | Mitigation |
|------|------------|
| JSON-LD unchanged | No edits to `ProductJsonLd.jsx` |
| Sitemap / canonical / robots | No edits |
| Over-long ALT | 160-char cap with truncation |
| Decorative images mis-tagged | Shop branding tiles keep `aria-hidden` + empty ALT |
| PDP client-rendered gallery | ALT set in React on hydrate (same as before for crawl via JSON-LD) |
| Products without `partNumber` | ALT falls back to product name only |

**Follow-up (out of scope):** SSR hero `<img>` on PDP for crawlers without JS; `width`/`height` attributes for CLS (IMAGE-SEO-AUDIT-01 P1).
