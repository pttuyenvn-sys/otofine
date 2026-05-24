# Shop Public Pages — SEO Strategy

**Companion to:** `shop-public-pages-overview.md`
**Status:** Proposal — no changes to existing SEO surfaces yet.

The number-one SEO risk of this work is **duplicate content**. The
apex `otofine.com` is already ranked for product slugs and SEO
landing pages; we must NOT cannibalize that ranking by serving the
same products under N new subdomain origins. This document spells
out the exact rules that keep us safe.

---

## 1. Canonical URL contract

For **every product**, the only canonical URL the entire system is
allowed to declare is:

```
https://otofine.com/product/<id>
```

Implications:

1. Per-shop product cards link directly to that apex URL (absolute,
   not relative). `Link href="https://otofine.com/product/<id>"`.
2. The apex `app/product/[id]/page.js` continues to emit
   `<link rel="canonical" href="https://otofine.com/product/<id>">`
   — already does, do not change.
3. Per-shop pages that mention a product (homepage featured,
   `/san-pham` cards) include `rel="canonical"` only on the LIST
   page, pointing to the list page itself
   (`https://<slug>.otofine.com/san-pham`). Individual cards do NOT
   re-emit a product canonical because they aren't product detail
   pages.
4. The apex `[slug]` SEO landing pages continue to own keyword-
   ranked URLs like `/phu-tung-bo-loc-gio` — shop subdomains do NOT
   replicate them.

There is therefore **one** canonical URL per product and **one**
canonical URL per SEO landing. Shop home/list/about/contact are
canonical for themselves only.

---

## 2. Per-shop SEO contract (positive case)

Each shop subdomain owns four canonical URLs:

| URL                                              | Canonical for                                | Indexed |
| ------------------------------------------------ | -------------------------------------------- | ------- |
| `https://<slug>.otofine.com/`                    | Shop home                                    | ✅ yes  |
| `https://<slug>.otofine.com/gioi-thieu`          | Shop about                                   | ✅ yes  |
| `https://<slug>.otofine.com/san-pham`            | Shop product listing (first page)            | ✅ yes  |
| `https://<slug>.otofine.com/san-pham?page=N`     | Listing page N                               | ✅ yes (with `rel="next"` / `rel="prev"`) |
| `https://<slug>.otofine.com/lien-he`             | Shop contact                                 | ✅ yes  |
| `https://<slug>.otofine.com/sitemap.xml`         | Sitemap                                      | n/a    |
| `https://<slug>.otofine.com/robots.txt`          | Crawl policy                                 | n/a    |

Everything else under a shop subdomain MUST 404 or 301 to apex (see
`shop-subdomain-routing.md §5`).

---

## 3. `robots.txt` strategy

### 3.1 Apex (unchanged)

`app/robots.js` currently disallows
`/xe/`, `/rfq/`, `/product/`, `/shop/`, `/admin/`, `/api/`,
`/search/`, `/*?q=*`, `/*?pagenumber=*`, `/*?*`, allowing only `/`
and `/phu-tung-`. We do NOT touch this file.

### 3.2 Per-shop (new)

`app/(shopsite)/robots.ts` (NEW) reads `x-shop-slug` from
`next/headers` and emits:

```
User-agent: *
Allow: /
Allow: /gioi-thieu
Allow: /san-pham
Allow: /lien-he
Disallow: /api/
Disallow: /shop/
Disallow: /admin/
Disallow: /rfq/
Disallow: /product/
Disallow: /*?*

Sitemap: https://<slug>.otofine.com/sitemap.xml
```

Two important things:

1. Even though shop subdomains don't expose `/shop/`, `/admin/`,
   `/rfq/`, `/product/` to humans (middleware 301s them), we still
   list them in `Disallow:` so crawlers that probe URLs don't crawl
   the redirect targets via the wrong host.
2. The `Sitemap:` line uses the absolute per-shop URL.

### 3.3 What we WILL NOT do

We will NOT serve `Disallow: /` on shop subdomains. They are
intentionally indexable; the only protection against duplicate
content is the canonical contract from §1, not robots blocking.

---

## 4. `sitemap.xml` strategy

### 4.1 Apex (unchanged)

`app/sitemap.js` continues to call backend
`GET /api/seo/sitemap-data` and emit products + brand/model URLs
under `https://otofine.com`. **No shop URLs are added to the apex
sitemap.** Each shop's storefront pages live in their own per-shop
sitemap (see §4.3). This keeps the apex sitemap stable for ranking
products + landing pages.

### 4.2 New apex aggregator: `sitemap-index.xml`

Optional, Phase 2 or later. We can add a `sitemap-index.xml` at
`https://otofine.com/sitemap-index.xml` that references both the
apex `sitemap.xml` and each public shop's `sitemap.xml`. This is the
standard way to advertise multi-tenant sitemaps. Keep it OFF until
the demo shop is healthy.

### 4.3 Per-shop sitemap

`app/(shopsite)/sitemap.ts` (NEW) calls
`GET /api/public/shops/:slug/sitemap` and emits:

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://<slug>.otofine.com/</loc>
       <changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://<slug>.otofine.com/gioi-thieu</loc>
       <changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>https://<slug>.otofine.com/san-pham</loc>
       <changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>https://<slug>.otofine.com/lien-he</loc>
       <changefreq>monthly</changefreq><priority>0.5</priority></url>

  <!-- NOTE: product detail URLs are CANONICAL on the apex.
       The per-shop sitemap lists shop pages only. Products live
       in the apex sitemap to avoid duplicate indexing. -->
</urlset>
```

Crucially: per-shop sitemap does NOT list product URLs because:

- Product canonical is on apex (`https://otofine.com/product/<id>`),
- The apex sitemap already advertises those URLs,
- Listing them in two sitemaps doesn't help discovery and confuses
  attribution reports in Google Search Console.

---

## 5. `<head>` metadata per page

### 5.1 Storefront home `/`

```html
<title>{{shop.name}} — Phụ tùng ô tô | Otofine</title>
<meta name="description" content="{{shop.bio | truncate 160}}">
<link rel="canonical" href="https://<slug>.otofine.com/">
<meta property="og:type" content="website">
<meta property="og:title" content="{{shop.name}} — Phụ tùng ô tô">
<meta property="og:description" content="{{shop.bio | truncate 160}}">
<meta property="og:url" content="https://<slug>.otofine.com/">
<meta property="og:image" content="{{shop.cover or default}}">
<meta name="twitter:card" content="summary_large_image">
```

### 5.2 About `/gioi-thieu`

```html
<title>Giới thiệu — {{shop.name}} | Otofine</title>
<meta name="description" content="{{intro_html | strip-tags | truncate 160}}">
<link rel="canonical" href="https://<slug>.otofine.com/gioi-thieu">
```

### 5.3 Products `/san-pham[?page=N]`

```html
<title>Sản phẩm — {{shop.name}} | Otofine</title>
<meta name="description" content="Khám phá {{N}} sản phẩm phụ tùng ô tô của {{shop.name}} — {{categories[0,3] | join ', '}}.">
<link rel="canonical" href="https://<slug>.otofine.com/san-pham">
{% if page > 1 %}
<link rel="prev" href="?page={{page-1}}">
{% endif %}
{% if page < lastPage %}
<link rel="next" href="?page={{page+1}}">
{% endif %}
```

When filters are active (`?brand=toyota&year=2020`):
- The canonical stays `https://<slug>.otofine.com/san-pham` (NOT the
  filtered URL) so we don't index parameter combinations.
- Robots already disallows `/*?*` per §3.2 so the filter URLs are
  not crawlable in the first place.

### 5.4 Contact `/lien-he`

```html
<title>Liên hệ — {{shop.name}} | Otofine</title>
<meta name="description" content="Liên hệ {{shop.name}} qua điện thoại, Zalo, hoặc Facebook.">
<link rel="canonical" href="https://<slug>.otofine.com/lien-he">
```

### 5.5 Default OG image

If a shop hasn't uploaded a cover, OG image falls back to
`https://img.otofine.com/site/og-shop-default.png` (a new static
asset; not a code dependency).

---

## 6. Structured data (JSON-LD)

### 6.1 On shop home `/`

```json
{
  "@context": "https://schema.org",
  "@type": "Store",
  "name": "{{shop.name}}",
  "url": "https://<slug>.otofine.com/",
  "image": "{{shop.cover or default}}",
  "logo": "{{shop.avatar or default}}",
  "description": "{{shop.bio}}",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "{{addressDetail}}",
    "addressLocality": "{{wardLabel}}",
    "addressRegion": "{{provinceLabel}}",
    "addressCountry": "VN"
  },
  "telephone": "{{phone}}",
  "openingHours": "{{working_hours_schema_format}}",
  "parentOrganization": {
    "@type": "Organization",
    "name": "Otofine",
    "url": "https://otofine.com"
  },
  "sameAs": [
    "{{facebook_url}}",
    "https://otofine.com/cua-hang/{{slug}}"  // optional apex back-link if we add one
  ]
}
```

### 6.2 On `/lien-he`

Same as 6.1 plus an additional `LocalBusiness` block when `lat`/`lng`
columns are populated:

```json
{
  "@type": "LocalBusiness",
  "geo": { "@type": "GeoCoordinates", "latitude": ..., "longitude": ... }
}
```

### 6.3 On `/san-pham`

Optional `ItemList` block enumerating the visible product cards
(IDs + apex canonical URLs). NOT a `Product` block — that's owned by
the apex detail page.

### 6.4 What we do NOT emit

- **No `Product` JSON-LD on per-shop pages.** Only the apex detail
  page is allowed to emit `Product` schema.
- **No `BreadcrumbList`** pointing to apex URLs from shop pages
  (that would cross-host and confuse Google).
- **No `Organization` block** — apex layout already emits one;
  duplicating per-shop creates conflicting signals.

---

## 7. Cross-host link strategy

- Every product card on a shop subdomain links to the apex product
  detail. **Absolute URL**. `target` is unset (same tab).
- The apex SEO landing pages (`/phu-tung-*`) MAY in Phase 3 add a
  "Bán bởi" link to the seller subdomain. Out of scope for Phase 1.
- The apex product detail page (`/product/<id>`) already embeds shop
  avatar + name. We may add an optional "Xem tất cả sản phẩm của
  shop" link to `https://<slug>.otofine.com/san-pham` once the
  feature is GA — Phase 2.
- Per-shop nav DOES include a discreet "← Về Otofine" link in the
  footer (`<ShopFooter>`). This is a one-way back-link to the apex
  home page; it does NOT cannibalize any SEO ranking.

---

## 8. Crawl & indexing playbook

| Action                                | When             | How                                                   |
| ------------------------------------- | ---------------- | ----------------------------------------------------- |
| Verify ownership of `*.otofine.com`   | Before Phase 1   | Google Search Console domain property for `otofine.com` already covers subdomains (verified by DNS TXT record one-time) |
| Submit per-shop sitemap               | After each shop goes public | POST `https://<slug>.otofine.com/sitemap.xml` URL to GSC under the `otofine.com` domain property |
| Monitor duplicate content             | Weekly during Phase 2 | GSC "Coverage" report filter by host; expect ≤ 5 "duplicate, alternate page with proper canonical" entries per shop (these are expected, not errors) |
| Block indexing of unfinished shops    | All phases       | `shops.public_status = 'pending'` → backend returns 404 → page never reachable → never indexed |

---

## 9. Risk register (SEO-specific)

| Risk                                                                                  | Severity | Mitigation                                                                    |
| ------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Shop subdomain product card incorrectly links to a per-shop product page             | CRITICAL | Hard rule + lint: all `ShopProductCard` `href` start with `https://otofine.com/product/`; CI check `rg "href=.*<slug>.*?product"` blocks merge |
| Apex `[slug]` SEO landings ranking drops because of duplicate content                | CRITICAL | Per-shop pages never use the same H1 / title patterns as `[slug]` landings; per-shop home is `<shop.name> — Phụ tùng ô tô`, never `Phụ tùng X` |
| Per-shop `robots.txt` accidentally blocks `/` (shop home not indexable)              | HIGH     | Snapshot test in CI for the generated robots output                           |
| Sitemap-index references shops that have been blocked/suspended                       | HIGH     | Aggregator filters `WHERE public_status = 'public'` AND `slug IS NOT NULL`    |
| Soft 404 on `/san-pham` when shop has 0 products                                     | MEDIUM   | Render an explicit "Shop chưa có sản phẩm" message + 200 status code (NOT 404) so the page indexes; once seller adds products, content updates |
| Cover image absolute URL leaks shopId in path (`shops/123/cover.png`)                | LOW      | Acceptable — shopId is not a secret; the only secret is the JWT |
| Same shop has multiple subdomains (DNS misconfiguration)                              | MEDIUM   | One `slug` per row, UNIQUE constraint on `shops.slug`; nginx wildcard pattern only matches one form |
| Google indexes shop subdomain "thin" pages (no products, default bio)                 | MEDIUM   | Phase 1 gates `public_status='public'` on admin pre-moderation; require ≥ 5 products before allowing the flip |

---

## 10. SEO definition of done

A shop subdomain is ready to be flagged `public_status='public'` when:

1. `slug` matches the regex `^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$` and
   is not reserved.
2. `name` and `bio` are non-empty.
3. `avatar` AND `cover` are set (we serve defaults if missing, but
   for indexing we require both).
4. Shop has ≥ 5 published products.
5. `intro_html` is at least 200 characters of plain text after
   sanitization.
6. `phone` is set; at least one of `zalo` / `facebook_url` is set.
7. Backend `GET /api/public/shops/:slug` returns HTTP 200.
8. Per-shop `/sitemap.xml` validates against the W3C sitemap schema.
9. `robots.txt` allows `/`, `/gioi-thieu`, `/san-pham`, `/lien-he`.
10. Apex sitemap still includes the shop's products under apex
    `/product/<id>` URLs (sanity check — apex unaffected).
