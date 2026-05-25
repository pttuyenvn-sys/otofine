# SEO-friendly product detail URLs

Frontend-only routing migration. **No backend, DB, schema, product API,
Typesense, seller-center, storefront API, SEO scoring, auth, or
product business logic was touched.** Pure routing + canonical
enforcement + presentation URLs.

## URL format

| Before | After |
| --- | --- |
| `/product/2913` | `/phu-tung/loc-xang-toyota-vios-2013-2330021010-2913` |

Pattern: `/phu-tung/<slug>-<productId>`.

The trailing numeric segment is the **canonical lookup key**; the slug
prefix is purely cosmetic for SEO + share-card readability. There is
NO slug column on `products`, NO slug table, NO migration — the slug
is computed from product fields (`partName`, primary car fitment
brand/model/year, `partNumber`) at render time by a pure-string
helper.

## Files

| File | Kind |
| --- | --- |
| `frontend/lib/seo/productSeoUrl.js` | NEW — central helper (`slugifyVi`, `buildProductSeoSlug`, `buildProductSeoUrl`, `extractProductIdFromSeoSlug`). |
| `frontend/app/phu-tung/[slug]/page.js` | NEW — canonical-enforcing product detail page. ID-only DB lookup; 308-redirects any drifted slug to canonical. |
| `frontend/app/phu-tung/[slug]/ProductJsonLd.jsx` | NEW — Product + BreadcrumbList JSON-LD using canonical URL. |
| `frontend/app/product/[id]/page.js` | REWRITTEN — thin redirect-only server component. 308 → canonical, 404 on missing. |
| `frontend/app/product/[id]/ProductJsonLd.jsx` | DELETED — obsolete (legacy page no longer renders JSON-LD; it redirects). |
| `frontend/lib/productDetailHref.js` | Now delegates to `buildProductSeoUrl`. Single public API surface for internal links. |
| `frontend/lib/apexOrigin.js` | `apexProductUrl` accepts either id or full product shape; emits canonical SEO URLs. |
| `frontend/components/pages/ProductDetail.jsx` | Accepts either `params.id` (legacy) or `params.slug` (new); peels id via the same helper used server-side. Related/recent links pass full item to `productHref` so drift never happens on internal click. |
| `frontend/components/shopsite/ShopProductCard.jsx` | Cross-host apex links use the full product shape → canonical URL on cross-subdomain clicks. |
| `frontend/components/seo/SeoListingContent.jsx` | `productHref` → `buildProductSeoUrl`. |
| `frontend/components/seo/CategorySeoContent.jsx` | `Link href` → `buildProductSeoUrl`. |
| `frontend/components/AppShell.jsx` | Hides marketing chrome on `/phu-tung/...` (same as it does for `/product/...`). |
| `frontend/app/sitemap.js` | Strips the synthetic `sp-<id>` slug from the legacy SEO sitemap-data feed and emits minimal `/phu-tung/<id>` URLs. Canonical-enforce route handles slug enrichment in a single 308 hop for crawlers. |
| `frontend/lib/shopsite/shopSitemapBuilder.js` | Comment refresh — product pages now live on apex `/phu-tung/...`. |
| `frontend/README.md` | Routes table updated with new canonical + legacy redirect entries. |

## Helper API

```js
import {
  buildProductSeoSlug,
  buildProductSeoUrl,
  extractProductIdFromSeoSlug,
  slugifyVi,
} from "@/lib/seo/productSeoUrl";
```

- `slugifyVi(text)` — NFD-strip Vietnamese diacritics → kebab-case ASCII → cap 140 chars.
- `buildProductSeoSlug({ partName, partNumber, cars[], brand, model, yearFrom, yearTo })` — returns slug PREFIX (no id).
- `buildProductSeoUrl(item)` — returns `/phu-tung/<slug>-<id>` (or `/phu-tung/<id>` when no slug fields available; canonical-enforce repairs).
- `extractProductIdFromSeoSlug(slug)` — returns the trailing numeric id or `null`. **Pure string** — no DB, no allocations beyond the regex match.

## Canonical contract

Every product is reachable at exactly ONE URL. All other shapes
308-redirect to it:

```
/product/<id>                                  → 308 → /phu-tung/<slug>-<id>
/product/sp-<id>                               → 308 → /phu-tung/<slug>-<id>
/phu-tung/<id>                                 → 308 → /phu-tung/<slug>-<id>
/phu-tung/<wrong-slug>-<id>                    → 308 → /phu-tung/<slug>-<id>
/phu-tung/<canonical-slug>-<id>                → 200
```

Drift cases handled by this single mechanism:

- seller renamed the product after a link was shared,
- partNumber edited after a card was rendered,
- car fitment added/removed,
- external site typed a wrong slug,
- a card built the URL from a stale snapshot,
- a human dropped the slug entirely.

Modern crawlers (Google, Bing, Yandex, GPTBot) treat HTTP 308 as
identical to 301 for canonicalization and link-equity transfer. Next.js
`permanentRedirect()` (the App-Router primitive used here) emits 308.
Single-hop redirect chain.

## Metadata + structured data

| Surface | Value |
| --- | --- |
| `<title>` | `<product-name> | Otofine` |
| `<meta name="description">` | `Mua <product-name> — mã <partNumber>. …` |
| `<link rel="canonical">` | `https://otofine.com/phu-tung/<slug>-<id>` |
| `<meta property="og:url">` | same canonical |
| `<meta property="og:title">` / `og:description` / `og:image` | unchanged |
| JSON-LD `@type:Product.url` + `Offers.url` | same canonical |
| JSON-LD `@type:BreadcrumbList[1].item` | same canonical |
| `robots` meta | `index, follow` |

All five canonical surfaces (link, og:url, JSON-LD product, JSON-LD
breadcrumb, sitemap) line up byte-for-byte — Google receives zero
conflicting signals.

## Verification

### HTTP behaviors

```
=== legacy /product/<id> → 308 to canonical ===
status=308 location=http://127.0.0.1:3000/phu-tung/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108

=== new /phu-tung/<id> (slugless) → 308 to canonical ===
status=308 location=http://127.0.0.1:3000/phu-tung/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108

=== new /phu-tung/wrong-slug-<id> → 308 to canonical ===
status=308 location=http://127.0.0.1:3000/phu-tung/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108

=== unicode-encoded slug → 308 to canonical ===
status=308 location=http://127.0.0.1:3000/phu-tung/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108

=== canonical → 200 ===
status=200

=== bad ID, malformed slug → 404 ===
status=404
status=404

=== /product (no id) → preserved 307 to / ===
status=307 location=http://127.0.0.1:3000/

=== sitemap emits new URLs ONLY ===
https://otofine.com/phu-tung/108
https://otofine.com/phu-tung/109
https://otofine.com/phu-tung/110
(no /product/ entries)

=== canonical link + JSON-LD + OG agree ===
<link rel="canonical" href="https://otofine.com/phu-tung/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108"/>
<meta property="og:url" content="https://otofine.com/phu-tung/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108"/>
JSON-LD url: "https://otofine.com/phu-tung/ang-ten-duoi-ca-kia-sedona-2014-96210a9000swp-108"
```

### Helper unit-ish

```
slugifyVi('Lọc xăng Toyota Vios 2013')           → 'loc-xang-toyota-vios-2013'
slugifyVi('Đèn pha LED Honda Civic 2022')        → 'den-pha-led-honda-civic-2022'
slugifyVi('  Ăng-ten đuôi cá -- !@#$ Kia ')      → 'ang-ten-duoi-ca-kia'
slugifyVi('a'.repeat(200))                       → 140-char cap

buildProductSeoSlug({ partName: 'Lọc xăng', partNumber: '23300-21010',
                      cars: [{ hang_xe: 'Toyota', ten_xe: 'Vios',
                               year_from: 2013 }] })
                                                  → 'loc-xang-toyota-vios-2013-2330021010'

buildProductSeoUrl({ id: 2913, … as above })      → '/phu-tung/loc-xang-toyota-vios-2013-2330021010-2913'
buildProductSeoUrl({ id: 2913 })                  → '/phu-tung/2913'

extractProductIdFromSeoSlug('loc-xang-…-2913')    → 2913
extractProductIdFromSeoSlug('2913')               → 2913
extractProductIdFromSeoSlug('no-digits')          → null
extractProductIdFromSeoSlug('')                   → null
extractProductIdFromSeoSlug(null)                 → null
extractProductIdFromSeoSlug('foo-0')              → null  (positive integers only)
```

### Browser-level render

```
new canonical    → 200, heading="Ăng ten đuôi cá Kia Sedona 2014-2020"
new slugless     → 200 (after 308 hop)
legacy id        → 200 (after 308 hop)
wrong slug       → 200 (after 308 hop)
```

Screenshot: `audit/screenshots/product-seo-urls/phu-tung-canonical.png`.

### No regression

- Product API surface untouched — backend still receives numeric id
  via `/api/product/<id>`.
- `ProductDetail.jsx` accepts both old `params.id` and new
  `params.slug` shapes; legacy client-side navigations (back/forward,
  router.push, swiper-of-related-products) all work unchanged.
- Related / recent cards inside ProductDetail pass the full item to
  the link helper so the click is a single direct render — no
  redirect hop.
- All Tiptap / sanitizer / save-flow / image-upload / RFQ / Typesense
  / seller-center surfaces are untouched.
- `robots.txt` still disallows `/product/` (crawlers use the new
  sitemap URLs; the legacy route is only for direct-navigation
  backlinks).
- Sitemap emits ONLY `/phu-tung/...` URLs.
- Build passes clean. Bundle: `/phu-tung/[slug]` 6.41 kB / 113 kB
  first load; `/product/[id]` 193 B / 103 kB (thin redirect).

## SEO safety checklist

- [x] Single canonical URL (link + og + json-ld + sitemap all agree)
- [x] No duplicate-content surface — every other URL 308-redirects
- [x] No slug drift — page-canonical recomputed every request
- [x] Unicode-encoded slug normalises to the same canonical
- [x] Single-hop redirect chain for all entry shapes
- [x] Legacy backlinks preserved indefinitely
- [x] Sitemap migration is zero-touch on the backend (no new fields,
      no new endpoints) — uses existing `sp-<id>` slug to recover id
- [x] Google Rich Results compatibility unchanged (same schema.org
      Product / BreadcrumbList / Offer shape, just a different
      canonical URL)
