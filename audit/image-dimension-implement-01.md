# IMAGE-DIMENSION-IMPLEMENT-01

**Date:** 2026-06-22  
**Scope:** Explicit `width` / `height` on product `<img>` elements only  
**Unchanged:** URLs, ALT, canonical, robots, sitemap, JSON-LD, thumbnail CDN pipeline

---

## Summary

Added a shared dimension resolver and wired it across all product image surfaces. Dimensions come from image metadata (when present), `thumb_100` / `thumb_400` URL conventions, or CSS-guaranteed layout slots.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/image/productImageDimensions.js` | **NEW** — dimension resolver + `productImageDimensionProps()` |
| `frontend/tests/unit/productImageDimensions.test.mjs` | **NEW** — unit tests |
| `frontend/scripts/validate-image-dimension-implement-01.mjs` | **NEW** — surface + 100-product validation |
| `frontend/components/pages/home/HomeImages.jsx` | `ProductCardImage` (400²), `SearchSuggestThumb` (100²) |
| `frontend/components/seo/SeoListingProductImage.jsx` | Listing / BMY / CBM / CBMY cards (400²) |
| `frontend/components/pages/ProductDetail.jsx` | Main 4:3, thumbs 72², related/recent 400², lightbox |
| `frontend/components/shopsite/ShopImage.jsx` | Optional `dimensionLayout` prop |
| `frontend/components/shopsite/ShopProductCard.jsx` | `thumb400` via ShopImage |
| `frontend/components/shopsite/ShopGallery.jsx` | Product tiles `thumb400` |
| `frontend/components/shopsite/ShopRecentlyViewed.jsx` | `thumb400` |
| `frontend/components/seo/CategorySeoContent.jsx` | Category grid 400² |
| `frontend/components/seo/seoArticleBodyEnhance.js` | Inline + top-products HTML |
| `frontend/components/products/ProductTable.jsx` | Seller grid `thumb100` |
| `frontend/components/pages/products/ProductMobileCard.jsx` | Seller mobile `thumb100` |
| `frontend/components/popup/ProductImagePopup.jsx` | PDP popup main + thumbs |
| `frontend/components/pages/AdminProductModerationQueue.jsx` | Admin previews |
| `frontend/components/moderation/ModerationDetailPanels.jsx` | Moderation gallery |
| `frontend/components/moderation/ModerationReviewCard.jsx` | Review card |

**Indirect (via shared wrappers):** `SeoListingContent`, `HomeProductCard`, `HomeSearch`, `SearchSuggestPanel` → `SeoListingProductImage` / `ProductCardImage` / `SearchSuggestThumb`.

---

## Dimension rules

| Source | Width × Height |
|--------|----------------|
| Image object `width` / `height` | As provided |
| URL contains `thumb_100_` | 100 × 100 |
| URL contains `thumb_400_` | 400 × 400 |
| Layout `square` / listing cards | 400 × 400 (1:1 CSS slot) |
| Layout `pdp-main` | 4 × 3 (`.main-img` aspect-ratio) |
| Layout `pdp-thumb` | 72 × 72 (gallery thumb buttons) |

---

## Before / After examples

**Before (marketplace listing card):**

```html
<img src="https://img.otofine.com/.../abc.webp" alt="Lọc dầu Honda City …" loading="lazy" />
```

**After:**

```html
<img src="https://img.otofine.com/.../abc.webp" alt="Lọc dầu Honda City …" loading="lazy" width="400" height="400" />
```

**Before (PDP hero):**

```html
<img src="https://img.otofine.com/.../abc.webp" alt="…" loading="eager" fetchpriority="high" />
```

**After:**

```html
<img src="https://img.otofine.com/.../abc.webp" alt="…" loading="eager" fetchpriority="high" width="4" height="3" />
```

**Before (search suggest):**

```html
<img src="https://img.otofine.com/.../thumb_100_abc.webp" class="search-suggest-thumb" loading="lazy" />
```

**After:**

```html
<img src="https://img.otofine.com/.../thumb_100_abc.webp" class="search-suggest-thumb" loading="lazy" width="100" height="100" />
```

---

## next/image audit

| File | Usage | Action |
|------|-------|--------|
| `HomeHeader.jsx` | Site logo | Skipped (not product) |
| `SeoArticleEnriched.jsx` | Article hero imagery | Skipped (not product grid) |

All product grids use native `<img>` with explicit dimensions — no `next/image` refactor.

---

## Coverage statistics

Validation: `node frontend/scripts/validate-image-dimension-implement-01.mjs`

| Metric | Result |
|--------|-------:|
| Product surfaces inventoried | 18 |
| Surfaces with dimensions (direct + wrapper) | **18 / 18 (100%)** |
| 100-product × 4 layout resolution checks | **400 / 400 (100%)** |

---

## CLS observations

| Page type | Before | After (expected) |
|-----------|--------|------------------|
| Homepage cards | Slot sized by CSS only after decode | 400×400 intrinsic ratio reserves square slot |
| SEO listing (BMY/CBM/CBMY) | Same | 400×400 on `SeoListingProductImage` |
| PDP hero | 4:3 container, no img hints | `width="4" height="3"` matches `.main-img` |
| Shop cards | `aspect-square` only | 400×400 on `thumb_400` src |
| Search suggest | Small thumb jump risk | 100×100 reserved |

No layout or URL changes — CSS `object-fit` / `width:100%` behavior unchanged. CLS should **improve or hold steady**; no regressions expected because dimensions align with existing aspect-ratio rules.

---

## Build result

```
cd frontend && npm run build
✓ Compiled successfully
Exit code: 0
```

Unit tests: `node frontend/tests/unit/productImageDimensions.test.mjs` — **PASS**

---

## Surface inventory (Step 1)

| Surface | Component | Dimensions |
|---------|-----------|------------|
| Marketplace PDP | `ProductDetail.jsx` | ✓ |
| Marketplace listing | `SeoListingProductImage` | ✓ |
| Homepage cards | `ProductCardImage` | ✓ |
| Search results | `SearchSuggestThumb` | ✓ |
| Category pages | `CategorySeoContent` | ✓ |
| Brand / BMY / CBM / CBMY | `SeoListingContent` → wrapper | ✓ |
| Shop homepage gallery | `ShopGallery` (product tiles) | ✓ |
| Shop cards | `ShopProductCard` | ✓ |
| Shop SEO pages | `seoArticleBodyEnhance` | ✓ |
| Related / recently viewed | `ProductDetail`, `ShopRecentlyViewed` | ✓ |
| Seller grids | `ProductTable`, `ProductMobileCard` | ✓ |
| Admin previews | Moderation + queue components | ✓ |
