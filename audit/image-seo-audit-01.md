# IMAGE-SEO-AUDIT-01

**Date:** 2026-06-22  
**Mode:** Read-only — no production code changes  
**Data sources:** Production DB (`products`, `product_images`), live CDN probes (`img.otofine.com`), HTML/code review  
**Public product universe:** 7,385 visible products (same gate as public sitemap)

---

## Executive summary

| Area | Readiness | Score |
|------|-----------|------:|
| **Product pages (marketplace PDP)** | Good foundation; CSR gallery limits crawler-first HTML | **72 / 100** |
| **Shop product cards** | Strong alt + `thumb_400` + lazy loading | **85 / 100** |
| **Marketplace listing / SEO grids** | Empty `alt` on listing cards; placeholder overlay | **48 / 100** |
| **Image infrastructure** | 100% WebP on `img.otofine.com`; thumbs generated | **88 / 100** |
| **Image sitemap** | Not implemented | **0 / 100** |

**Headline:** Image **coverage is strong** (94.8% of public products have gallery rows). Delivery via **Cloudflare R2 + `img.otofine.com`** is consistent. The largest SEO gaps are **empty ALT on marketplace listing cards**, **missing explicit width/height everywhere**, **no image sitemap**, and **original WebP files lacking long-lived cache headers** (thumbnails cache well).

---

## Step 1 — Inventory

### Product image coverage (database)

| Metric | Count | % of public products |
|--------|------:|---------------------:|
| **Total public products** | **7,385** | 100% |
| **Products with ≥1 gallery row** (`product_images`) | **7,002** | **94.8%** |
| **Products without any image** | **383** | **5.2%** |
| **Products with primary image flagged** | **7,001** | 94.8% |
| **Total gallery rows** | **7,045** | 1.01 avg / product |
| **Products with multiple images** | **38** | 0.5% |

### Thumbnail pipeline coverage

| Metric | Result |
|--------|--------|
| Gallery URLs in DB | **7,045** — all **`.webp`** on **`img.otofine.com`** |
| `thumb_400_*` reachable (100-url sample) | **100 / 100** |
| `thumb_100_*` reachable (100-url sample) | **100 / 100** |
| Products with image but missing thumbs | **0** in sample (pipeline appears complete for existing images) |

**Interpretation:** “Products with thumbnail” ≈ **7,002** (any product with a gallery row gets `thumb_400` + `thumb_100` sidecars on upload per `productImageThumbnails.js`). **383 products** have no image at all → they fall back to `/no-image.png` in UI.

### Top shops contributing to missing images

| Shop slug | Products without `product_images` row |
|-----------|--------------------------------------:|
| `phutungotoautopt` | 227 |
| `phutungoto355` | 156 |

These two shops account for **~99%** of the no-image gap.

---

## Step 2 — Image formats

Counts from `product_images.url` extension (public products):

| Format | Count | % |
|--------|------:|--:|
| **webp** | **7,045** | **100%** |
| jpg / jpeg | 0 | 0% |
| png | 0 | 0% |
| avif | 0 | 0% |
| other | 0 | 0% |

**Notes:**
- Upload pipeline converts to WebP (`sharp` + R2 upload in `productImageThumbnails.js` / `productImage.service.js`).
- Next.js `images` config supports AVIF/WebP for `<Image>` optimizer, but **product surfaces use native `<img>`** pointing directly at R2 URLs — no Next image optimizer on PDP/cards.
- Shop branding assets use separate paths: `img.otofine.com/shop-public/{avatar|cover}/{id}.webp`.

---

## Step 3 — Image dimensions

Distribution from **200 random primary product images** (original `.webp`, not thumbs):

| Bucket | Count | % of sample |
|--------|------:|--------------:|
| **< 300px** width | 33 | 16.5% |
| **300–800px** | 162 | 81.0% |
| **800–1200px** | 5 | 2.5% |
| **≥ 1200px** | 0 | 0% |
| Errors | 0 | — |

| Stat | Value |
|------|------:|
| Median width | **369px** |
| Min width | 189px |
| Max width | 1,016px |

**Implications:**
- Images are **catalog/thumbnail-grade**, not high-res zoom assets — acceptable for cards, marginal for Google Images competitiveness on PDP.
- **16.5% below 300px** may look soft on retina grids and fail Google’s “adequate size” heuristics for image pack eligibility.
- PDP lightbox serves **full original** (not `thumb_400`); related-product rows use `thumb_400`.

---

## Step 4 — Image URLs & CDN

### Host distribution (all gallery URLs)

| Host | Count |
|------|------:|
| **`img.otofine.com`** | **7,045** (100%) |
| `*.r2.dev` direct | 0 |
| other | 0 |

**Architecture:** Cloudflare **R2** storage → public custom domain **`img.otofine.com`** (`R2_PUBLIC_URL`). Key pattern:

```
https://img.otofine.com/shops/{shopId}/{PARTNUMBER}.webp
https://img.otofine.com/shops/{shopId}/thumb_400_{PARTNUMBER}.webp
https://img.otofine.com/shops/{shopId}/thumb_100_{PARTNUMBER}.webp
```

### Cache header probe (live)

| Asset | `cache-control` | `cf-cache-status` | `content-type` |
|-------|-----------------|-------------------|----------------|
| Original `.webp` | *(none)* | `DYNAMIC` | `image/webp` |
| `thumb_400_*.webp` | `public, max-age=31536000, immutable` | `DYNAMIC` | `image/webp` |
| `thumb_100_*.webp` | `public, max-age=31536000, immutable` | `DYNAMIC` | `image/webp` |

**Gaps:**
- **Originals lack long `max-age`** — repeat crawls revalidate origin; slower LCP on first PDP visit.
- **`cf-cache-status: DYNAMIC`** on probe — edge caching may be limited until Cloudflare cache rules are tuned for `img.otofine.com`.
- All assets return **ETag** (good for conditional requests).

---

## Step 5 — HTML audit

Audit combines **live HTML** (where SSR emits `<img>`) and **code review** (client-hydrated surfaces).

### Marketplace PDP (`ProductDetail.jsx` — **client component**)

| Signal | Finding |
|--------|---------|
| **SSR `<img>` in HTML** | **None** — gallery hydrates client-side; crawlers relying on raw HTML see no product `<img>` |
| **Main image `src`** | Original R2 URL or `/no-image.png` |
| **`loading`** | `eager` + `fetchPriority="high"` on main ✅ |
| **`decoding`** | `async` ✅ |
| **`width` / `height`** | **Not set** ❌ (CLS risk) |
| **`alt`** | **Generated** from product title (`titleText`) on main ✅ |
| **Thumbnails** | `alt=""` (decorative) — acceptable |
| **Seller avatar** | `alt=""` |
| **JSON-LD `image`** | **Present** in SSR (`ProductJsonLd`) ✅ |
| **`og:image`** | Product image or fallback `/logo.png` ✅ |

### Marketplace listing / home product cards

| Surface | Component | `src` | `alt` | `loading` | `width/height` |
|---------|-----------|-------|-------|-----------|----------------|
| Home / search grid | `HomeProductCard` → `ProductCardImage` | `thumb_400` | **displayTitle** ✅ | lazy / eager first 2 ✅ | ❌ |
| SEO listing grid | `SeoListingContent` → `SeoListingProductImage` | original `item.image` | **`""` empty** ❌ | lazy ✅ | ❌ |
| Search suggest | `SearchSuggestThumb` | thumb | **`""` empty** ❌ | lazy ✅ | ❌ |

**SEO listing pages** render a visible “Đang cập nhật ảnh” placeholder **under** the image — confusing for users; image may still load above placeholder text.

### Shop storefront (`ShopProductCard` + `ShopImage`)

| Signal | Finding |
|--------|---------|
| **`src`** | `thumb_400(product.image)` ✅ |
| **`alt`** | **displayTitle** (generated) ✅ |
| **`loading`** | lazy default; `priority` on first cards ✅ |
| **`decoding`** | `async` ✅ |
| **`width` / `height`** | **Not set** (CSS aspect-square) |
| **Live probe** (`phutungoto355` collection) | 22 images, **22/22 generated alt** ✅ |

### `next/image` usage

Product commerce surfaces use **`<img>`**, not `next/image`. Remote patterns for `img.otofine.com` exist in `next.config.mjs` but are **unused** on main PDP/card paths.

---

## Step 6 — ALT coverage

### Estimated distribution by surface (code + live sample)

| Category | Marketplace PDP | Home cards | SEO listing cards | Shop cards |
|----------|----------------:|-----------:|------------------:|-----------:|
| **Missing ALT** (no attribute) | 0% | 0% | 0% | 0% |
| **Empty ALT** (`alt=""`) | ~30% of imgs (thumbs, avatar) | 0% | **~100%** of product imgs | 0% |
| **Generic ALT** (“image”, “product”) | 0% | 0% | 0% | 0% |
| **Generated ALT** (title/H1) | **~70%** (main) | **100%** | **0%** | **100%** |

### Platform-wide estimate (weighted by impression surface)

| ALT type | Est. share | Notes |
|----------|------------|-------|
| **Generated** (product title) | **~65%** | PDP main, home grid, shop cards |
| **Empty** (decorative / missing) | **~30%** | Listing SEO grids, thumbs, search suggest |
| **Generic** | **< 1%** | Admin UI only |
| **Missing attribute** | **< 1%** | Rare |

**Priority gap:** `SeoListingProductImage` hardcodes `alt=""` while adjacent `<h2>` has the product title — missed free ALT signal for Google Images on high-impression listing URLs.

---

## Step 7 — Structured data

### Marketplace Product JSON-LD (`ProductJsonLd.jsx`)

| Field | Status |
|-------|--------|
| `@type: Product` | ✅ |
| `image` | ✅ Array with primary image URL |
| Source priority | `p.image` → `data.images[0]` |
| URL validity (live sample) | `https://img.otofine.com/shops/2/96210A9000SWP.webp` → **HTTP 200** ✅ |
| Multiple images in schema | ❌ Only first image (38 products have multi-image galleries) |

### Shop JSON-LD (`buildShopJsonLd.js`)

| Field | Status |
|-------|--------|
| `AutoPartsStore.image` | ✅ cover or avatar |
| `LocalBusiness.image` | ✅ |
| `Organization.logo` | ✅ avatar |
| Product-level images | ❌ Not emitted (catalog-level only) |

### Open Graph

| Page type | `og:image` |
|-----------|------------|
| Marketplace PDP | Product R2 URL or `/logo.png` fallback |
| Shop storefront | Cover/avatar with alt text |
| Listing pages | Typically none / site default |

---

## Step 8 — Image sitemap audit

| Question | Answer |
|----------|--------|
| Are product images in any sitemap? | **No** |
| `xmlns:image` image sitemap extension | **Not used** |
| Google image discovery today | Via page crawl + JSON-LD `image` + `og:image` |

### Effort estimate to add image sitemap

| Approach | Scope | Effort | Notes |
|----------|-------|--------|-------|
| **A. Extend `sitemap-products.xml`** with `<image:image>` per PDP | ~7,385 URLs × 1 image | **Medium (3–5 eng-days)** | Must add image namespace XML; cap 1,000 images/url per spec |
| **B. Dedicated `sitemap-images.xml` index** | Products + optional listing hero images | **Medium–High (5–7 days)** | Cleaner separation; reuse `projectProductsSitemap` |
| **C. Full multi-image per product** | 7,045 gallery rows | **+2 days** | Diminishing returns (avg 1.01 images/product) |

**Recommendation:** Approach **A** tied to existing `sitemap-products.xml` route — lowest integration cost; include primary image URL only in v1.

**Expected SEO impact:** **Low–medium** uplift for Google Images on long-tail part-number queries; highest value for products with unique photos vs competitors using stock art.

---

## Step 9 — Google Image readiness scores

| Surface | Score | Rationale |
|---------|------:|-----------|
| **Product pages** | **72** | JSON-LD + og:image + good main ALT; CSR gallery; no dimensions; originals often &lt;800px; no image sitemap |
| **Shop pages** | **85** | Strong card ALT + thumbs + SSR images; shop schema images; no product-level schema images |
| **Marketplace listing pages** | **48** | Empty ALT on product cards; SEO grid uses full original not thumb; weak image structured data at listing level |

### Readiness checklist (Google Images)

| Requirement | Products | Shops | Listings |
|-------------|:--------:|:-----:|:--------:|
| Indexable page | ✅ | ✅ (INDEX tier) | ✅ |
| Image URL HTTPS | ✅ | ✅ | ✅ |
| Descriptive ALT | ⚠️ main only | ✅ | ❌ |
| Adequate size (≥300px) | ⚠️ 83.5% | ✅ thumbs | ⚠️ |
| Not blocked by robots | ✅ | ✅ | ✅ |
| Structured `image` field | ✅ JSON-LD | ✅ shop only | ❌ |
| Image in sitemap | ❌ | ❌ | ❌ |

---

## Gaps & priority ranking

| Priority | Gap | Impact | Effort |
|:--------:|-----|--------|--------|
| **P0** | Empty ALT on `SeoListingProductImage` / SEO listing grids | High — many indexed listing URLs | Low |
| **P0** | 383 products (5.2%) with no image | Medium — poor SERP/listing CTR | Medium (seller ops) |
| **P1** | No `width`/`height` on product `<img>` | Medium — CLS + image crawl hints | Low–medium |
| **P1** | PDP gallery client-only (no SSR image) | Medium — some crawlers | Medium |
| **P1** | Original WebP missing `Cache-Control: immutable` | Medium — LCP / crawl cost | Low (CDN config) |
| **P2** | No image sitemap | Low–medium — Google Images discovery | Medium |
| **P2** | 16.5% images &lt;300px wide | Medium — image pack eligibility | Medium (upload guidelines) |
| **P2** | JSON-LD only first of multiple images | Low (38 products) | Low |
| **P3** | Listing cards use full original not `thumb_400` | Low — bandwidth / LCP | Low |
| **P3** | Migrate to `next/image` for responsive srcset | Low–medium long-term | High |

---

## Expected SEO impact (if gaps addressed)

| Initiative | Expected impact | Timeline |
|------------|-----------------|----------|
| Fix listing card ALT | **+5–15%** image-related impressions on listing URLs | 1–2 weeks after recrawl |
| Image sitemap (primary only) | **+3–8%** Google Images clicks (long-tail parts) | 4–8 weeks |
| Cache headers on originals | **Faster LCP** → indirect ranking; minimal image index change | Immediate |
| Fill 383 missing images | **+CTR** on affected PDPs; reduces soft-404 perception | Ongoing seller ops |
| SSR hero image on PDP | **+crawl reliability** for image discovery | 2–4 weeks after deploy |
| Upload min 800px guideline | **+image pack** eligibility over 6+ months | Ongoing |

---

## Monitoring hooks (tie-in to GSC-MONITORING-PLAYBOOK-01)

| Metric | How to track |
|--------|----------------|
| Products without image | Weekly SQL on `product_images` gap |
| Image 404 rate | Monitor `shopsite:image_fallback` events / CDN 404 logs |
| Google Images clicks | GSC Performance → Search type = Image |
| CLS on PDP | Lighthouse / CrUX `largest-contentful-paint` |
| ALT regression | CI lint on `SeoListingProductImage` + smoke HTML sample |

---

## Appendix — key files

| Path | Role |
|------|------|
| `backend/utils/productImageThumbnails.js` | WebP + thumb_400/100 generation |
| `backend/controllers/ProductDetail.controller.js` | PDP image URL assembly |
| `frontend/lib/imageVariants.js` | `toThumb400` / `toThumb100` |
| `frontend/components/pages/ProductDetail.jsx` | PDP gallery (client) |
| `frontend/components/seo/SeoListingProductImage.jsx` | Listing cards — **empty alt** |
| `frontend/components/pages/home/HomeProductCard.jsx` | Home grid — good alt |
| `frontend/components/shopsite/ShopProductCard.jsx` | Shop cards — good alt |
| `frontend/components/seo/ProductJsonLd.jsx` | Product schema `image` |
| `frontend/next.config.mjs` | `img.otofine.com` remote pattern |

**No production code changes were made in this audit.**
