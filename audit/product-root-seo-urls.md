# SEO URL refinement — root-level canonical product URLs

**Date:** 2026-05-25
**Status:** Implemented. Build green. Verified end-to-end via curl + Playwright.
**Scope:** Frontend routing + URL builders + sitemap + robots + minimal copy. Zero backend touch.

## 1. Goal

Move canonical product detail URLs from the namespaced

```
/phu-tung/<slug>-<id>
```

to the shorter root-level form

```
/<slug>-<id>
```

Concrete canonical example:

```
https://otofine.com/loc-xang-toyota-vios-2013-2330021010-2913
```

Reasons:

* shorter URLs → measurably higher SERP CTR (well-known SEO finding)
* standard ecommerce convention (Amazon /<asin>, Shopee /<slug>-<id>)
* trailing numeric productId already guarantees uniqueness; the
  `/phu-tung/` namespace carries no routing weight
* one canonical surface → cleaner index, smaller crawl budget, less
  link-equity dilution

## 2. The hard constraint

The Next.js apex `app/[slug]/page.js` is a **shared namespace**. It
already owns:

* vehicle SEO landings (`phu-tung-o-to-toyota-vios-2013`)
* category SEO landings (`loc-gio-o-to`)
* the SEO base hub (`phu-tung-o-to`)
* CMS / marketing content slugs
* future apex slug routes

Adding products to the apex namespace **must not** collide with these
existing routes.

## 3. Two-step product-detection contract

The apex `[slug]/page.js` performs the following on each request:

```
SlugHomePage(slug) {
  // ① Pure-string discriminator — zero DB cost
  if (looksLikeProductSlug(slug)) {
    const id = extractProductIdFromSeoSlug(slug);
    const data = await getProductDetailCached(id);

    if (data?.product) {
      // ② Canonical enforcement
      const canonical = buildProductSeoUrl({ ...data.product, cars: data.cars });
      if (currentPath !== canonical) permanentRedirect(canonical);  // 308
      return <ProductDetail productId={id} />;
    }
    // false-positive (rare): no product with that id → fall through
  }

  // Existing vehicle/category SEO landing branch (unchanged)
  return <Home premiumArticle={…} />;
}
```

### `looksLikeProductSlug` — the pure-string discriminator

`frontend/lib/seo/productSeoUrl.js`

A slug is treated as product if and only if **all** of:

1. ends in `-<positive-integer>` with non-empty descriptive prefix
2. is NOT `phu-tung-o-to` (SEO base hub)
3. does NOT start with `phu-tung-o-to-` (vehicle landing branch)
4. does NOT end with `-o-to` (category landing)
5. is NOT a year-only trailing pattern with no other digits anywhere
   in the prefix (catches `toyota-vios-2025` → SEO landing, not a
   product with id 2025)

Property-test cases (all green, see commit verification):

| input | result |
|-------|--------|
| `loc-xang-toyota-vios-2013-2330021010-2913` | **product** |
| `abc-999` | **product** |
| `toyota-vios-2025-2913` | **product** (id 2913, year 2025 in prefix) |
| `2913` | landing (bare numeric → no slug prefix) |
| `phu-tung-o-to` | landing |
| `phu-tung-o-to-toyota-vios-2013` | landing |
| `phu-tung-bac-balie-o-to` | landing (category) |
| `toyota-vios-2025` | landing (year-only trailing, no other digits) |
| `gioi-thieu`, `shop`, `rfq` | landing |
| `foo-007` (leading zero) | landing |
| `toyota-vios` (no trailing digits) | landing |

The discriminator is pure string — no DB call, no allocations beyond
the trailing-id regex match. False positives self-heal: the product
fetch returns null and execution falls through to the existing SEO
branch in a single cached round-trip.

## 4. URL surface (final state)

| URL | Status | Notes |
|---|---|---|
| `/<slug>-<id>` | **canonical, 200** | rendered by `app/[slug]/page.js` product branch |
| `/<wrong-slug>-<id>` | 308 → `/<canonical-slug>-<id>` | same apex page, canonical-enforce |
| `/p/<id>` | 308 → `/<slug>-<id>` | dedicated short fallback for sitemap + id-only callers |
| `/phu-tung/<slug>-<id>` | 308 → `/<slug>-<id>` | legacy namespace, redirect-only |
| `/phu-tung/<id>` | 308 → `/<slug>-<id>` | legacy id-only path |
| `/product/<id>` | 308 → `/<slug>-<id>` | original legacy form |
| `/<missing-id>` | apex SEO landing fallback (200) | discriminator + 404-from-DB → falls through |
| `/p/<missing-id>` | 404 | dedicated short-form 404 (better crawl signal than redirect-to-404) |

**Every legacy form lands on the final canonical in exactly one 308 hop. No redirect chains.**

## 5. Files touched

```
frontend/lib/seo/productSeoUrl.js         (+ looksLikeProductSlug, root-level URL emission)
frontend/lib/apexOrigin.js                (apexProductUrl id-fallback → /p/<id>)
frontend/lib/productDetailHref.js         (docs)
frontend/lib/shopsite/shopSitemapBuilder.js (docs)

frontend/app/[slug]/page.js               (product detection branch added, additive)
frontend/app/phu-tung/[slug]/page.js      (rewritten as 308 → root canonical)
frontend/app/phu-tung/[slug]/ProductJsonLd.jsx (deleted — moved to components/seo/)
frontend/app/p/[id]/page.js               (new — short fallback redirect)
frontend/app/product/[id]/page.js         (docs — already uses buildProductSeoUrl transitively)
frontend/app/sitemap.js                   (emits /p/<id> entries)
frontend/app/robots.js                    (kept /phu-tung/ and /p/ crawlable for redirect-following)

frontend/components/seo/ProductJsonLd.jsx (new home — schema unchanged, URL switches to root canonical via builder)
frontend/components/AppShell.jsx          (added /p/ to hideLayout list)
frontend/components/pages/ProductDetail.jsx (productHref fallback → /p/<id>, docs)
frontend/components/shopsite/ShopProductCard.jsx (docs)
frontend/components/seo/SeoListingContent.jsx (docs)

frontend/README.md                        (route table updated)
```

## 6. SEO surfaces alignment

A single `buildProductSeoUrl(product)` call produces the canonical
URL across every surface; there is one source of truth.

Verified on `http://localhost:3000/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108`:

| Surface | Value |
|---|---|
| Page render | 200, full product UI |
| `<link rel="canonical">` | `https://otofine.com/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108` |
| `og:url` | identical to canonical |
| JSON-LD `Product.url` | identical to canonical |
| JSON-LD `Product.offers.url` | identical to canonical |
| JSON-LD `BreadcrumbList[1].item` | identical to canonical |
| `/head` references to `/phu-tung/` | **0** (verified via grep) |

## 7. Redirect chain — verified single-hop

```text
$ curl -sLI -o /dev/null \
    -w "hops: %{num_redirects} | final: %{url_effective}\n" \
    http://localhost:3000/product/108
hops: 1 | final: http://localhost:3000/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108

$ curl -sLI -o /dev/null \
    -w "hops: %{num_redirects} | final: %{url_effective}\n" \
    http://localhost:3000/phu-tung/whatever-108
hops: 1 | final: http://localhost:3000/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108

$ curl -sLI -o /dev/null \
    -w "hops: %{num_redirects} | final: %{url_effective}\n" \
    http://localhost:3000/p/108
hops: 1 | final: http://localhost:3000/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108

$ curl -sLI -o /dev/null \
    -w "hops: %{num_redirects} | final: %{url_effective}\n" \
    http://localhost:3000/totally-wrong-slug-108
hops: 1 | final: http://localhost:3000/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108
```

All entry points: exactly **1 hop** to the canonical. Zero chains.

## 8. Existing routes NOT broken — verified

| URL | Expected | Actual |
|---|---|---|
| `/phu-tung-o-to` | 200 (SEO base hub) | 200 |
| `/phu-tung-o-to-toyota-vios` | 200 (vehicle landing) | 200 |
| `/phu-tung-o-to-toyota-vios-2013` | 200 (vehicle landing) | 200 |
| `/loc-gio-o-to` | 200 (category landing) | 200 |
| `/toyota-vios-2025` | 200 (year-only landing, NOT product) | 200 |
| `/108` (bare numeric) | 200 (no slug prefix → not product) | 200 |
| `/shops` | 200 (shop directory) | 200 |
| `/rfq/new` | 200 (RFQ flow) | 200 |

## 9. Sitemap

`frontend/app/sitemap.js` emits `/p/<id>` per product (one line per
product, no slug enrichment needed). Each `/p/<id>` 308-redirects to
the canonical `/<slug>-<id>` in a single hop, so Google indexes only
the canonical destination. The sitemap migration required **no
backend change** — the legacy sitemap-data endpoint's synthetic
`sp-<id>` slug is parsed to extract the numeric id and that's it.

Verified sample sitemap output:

```xml
<url>
  <loc>https://otofine.com/p/108</loc>
  <lastmod>2026-05-25T09:03:48.938Z</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.75</priority>
</url>
```

## 10. Robots

* `/product/` stays disallowed (pre-migration policy preserved).
* `/phu-tung/` and `/p/` remain crawlable (NOT disallowed) so
  Googlebot can follow the 308 from sitemap `/p/<id>` entries to the
  canonical, and pass link-equity from legacy `/phu-tung/...`
  backlinks through the redirect.

## 11. Performance

* Discriminator: pure-string regex, O(1), no allocations beyond the
  regex match.
* Apex `[slug]` route: zero overhead added for SEO landings — the
  discriminator short-circuits on the apex-marketing slug prefix
  (`phu-tung-o-to-`, `-o-to`) before any DB call.
* Product render: identical to prior `/phu-tung/[slug]` route — same
  cached `getProductDetailCached(id)` call, same `ProductDetail`
  component, same JSON-LD shape.

## 12. Rollback

Trivial: revert this commit. The legacy `/phu-tung/[slug]` page is
still in the codebase (now redirect-only) and the new helper still
supports building `/phu-tung/...` URLs if the prefix is restored in
`buildProductSeoUrl`. No DB migration, no irreversible state.

## 13. Out of scope (deliberately)

* Backend API contract — unchanged.
* Sitemap-data endpoint — unchanged.
* Product schema / slug column — none added.
* SEO scoring / RFQ matching / supplier discovery — untouched.
* Authentication, storefront, marketplace routing — untouched.
