# GOOGLE-CRAWL-STATS-AUDIT-01

**Mode:** READ ONLY — no code/build/restart/config changes  
**Audit date:** 2026-06-28  
**Site:** https://otofine.com  
**Purpose:** Baseline for interpreting Google Search Console **Crawl Stats** after go-live monitoring

**Method:** Live probes with `Googlebot/2.1` UA, `robots.txt` review, sitemap inventory, read-only routing/middleware audit

---

## SECTION 1 — URL namespaces

| Namespace | Example URL(s) | Router / handler | In sitemap? | robots.txt |
|-----------|------------------|------------------|-------------|------------|
| **Homepage** | `/` | `app/page.js` (static ISR) | Yes (core index) | Allow `/` |
| **Category** | `/ma-phanh-o-to` | `app/[slug]/page.js` | Yes (core) | Allow |
| **Category × Brand (CB)** | `/ma-phanh-toyota` | `app/[slug]/page.js` | Yes (core) | Allow |
| **Category × Brand × Model (CBM/CBMY)** | `/ma-phanh-toyota-vios` | `app/[slug]/page.js` | Yes (core) | Allow |
| **Vehicle** | `/phu-tung-toyota-vios` | `app/[slug]/page.js` | Yes (core) | Allow `/phu-tung-` |
| **Location variants** | `/phu-tung-kia-tai-ha-noi`, `…-tai-{province}` | `app/[slug]/page.js` | Yes (location sitemap, 1,703 URLs) | Allow |
| **Year / year-range SEO** | `…-2018`, `…-2014-2020` | `app/[slug]/page.js` | Yes (governed) | Allow |
| **Product (canonical)** | `/loc-gio-dieu-hoa-toyota-altis-…-6537` | `app/[slug]/page.js` → product branch | Yes (products, 7,385 URLs) | Allow |
| **Shop subdomain** | `https://{slug}.otofine.com/` | `middleware.js` rewrite → `app/(shopsite)/shops/[slug]/` | Yes (shops, 407 URLs) | Same apex robots served |
| **Shop apex mirror** | `/shops/phutungoto355` | `app/(shopsite)/shops/[slug]/page.js` | No (canonical on subdomain) | **Disallow `/shop/`** — path is `/shops/` (allowed) |
| **Seller center** | `/shop/login`, `/shop/products`, … | `app/shop/**` | No | **Disallow `/shop/`** |
| **RFQ** | `/rfq/open`, `/rfq/new`, … | `app/rfq/**` | No | **Disallow `/rfq/`** |
| **Admin** | `/admin/seo-pages`, `/admin/login` | `app/admin/**` | No | **Disallow `/admin/`** |
| **Next API routes** | `/api/seo-page/{slug}`, `/api/cron/…` | `app/api/**/route.js` | No | **Disallow `/api/`** |
| **Backend API (proxied)** | `/api/products`, `/api/product/:id` | Express via nginx | No | **Disallow `/api/`** |
| **Legacy product** | `/product/{id}` | `app/product/[id]/page.js` | No | **Disallow `/product/`** |
| **Legacy short product** | `/p/{id}` | `app/p/[id]/page.js` | No (canonical in sitemap uses slug-id) | Allow |
| **Legacy phu-tung path** | `/phu-tung/{slug-id}` | `app/phu-tung/[slug]/page.js` | No | Allow |
| **Legacy `/product` (no id)** | `/product`, `/product/` | `middleware.js` → `/` | No | Disallow `/product/` |
| **Legacy `/xe/`** | `/xe/toyota-vios` | No route (404) | No | **Disallow `/xe/`** |
| **Legacy collection** | `/san-pham`, shop legacy paths | `middleware.js` 301 | No | Varies |
| **Search namespace** | `/search/foo` | No route (404) | No | **Disallow `/search/`** |
| **Faceted / query** | `/?q=…`, `?page=2`, `?pagenumber=` | Same page handlers | No | **Disallow `/*?*`** |
| **Sitemaps** | `/sitemap.xml`, `sitemap-*.xml` | `app/sitemap*.xml/route.js` | N/A | Allow |
| **Static assets** | `/_next/static/**`, fonts, favicon | Next.js static | No | Allow (not blocked) |
| **Unknown subdomain** | `{invalid}.otofine.com` | `middleware.js` → 404 | No | Allow host, page noindex |

**Sitemap index total:** **12,417** URLs (+ partitioned child sitemaps)

| Child sitemap | URLs | Notes |
|---------------|------|-------|
| `sitemap-products.xml` | 7,385 | Includes **7,002** `image:image` entries |
| `sitemap-marketplace-core.xml` | 2,922 | Home + CB/CBM/vehicle slugs |
| `sitemap-marketplace-location.xml` | 1,703 | Location permutations |
| `sitemap-shops.xml` | 407 | Shop subdomain home URLs |

---

## SECTION 2 — Expected Googlebot responses

Live probe summary (2026-06-28, Googlebot UA):

| Namespace | HTTP | Canonical | meta robots | Redirect | Cache-Control | Expected crawl behavior |
|-----------|------|-----------|-------------|----------|---------------|-------------------------|
| Homepage | **200** | `https://otofine.com` | `index, follow` | — | `s-maxage=3600, stale-while-revalidate=…` | **Crawl + index**; ISR cached |
| Category | **200** | Self | `index, follow` | — | `private, no-cache, no-store` | **Crawl + index**; dynamic SSR |
| Brand (CB) | **200** | Self | `index, follow` | — | `private, no-cache, no-store` | **Crawl + index** |
| Vehicle | **200** | Self | `index, follow` | — | `private, no-cache, no-store` | **Crawl + index**; large HTML (~105 KB) |
| Product | **200** | Self | `index, follow` | — | `private, no-cache, no-store` | **Crawl + index**; JS-heavy PDP |
| Shop subdomain | **200** | `https://{slug}.otofine.com` | `index, follow` | — | `private, no-cache, no-store` | **Crawl + index** (shop property); ~180 KB HTML |
| Shop apex mirror | **200** | Subdomain URL | **`noindex, follow`** | — | `private, no-cache, no-store` | **Crawl**, should not index |
| RFQ | **200** | — | `index, follow` | — | `private, no-cache, no-store` | **Discouraged** via robots `Disallow: /rfq/` |
| Next `/api/seo-page/test` | **200** JSON/HTML | — | — | — | — | **Discouraged** via robots; low HTML value |
| Backend `/api/products` | **200** JSON | — | — | — | — | **Discouraged**; JSON not primary index target |
| Admin | **200** | — | **`noindex, nofollow`** | — | `private, no-cache, no-store` | **Discouraged** via robots + meta |
| `/product/6537` | **308** | — | — | → canonical product | `private, no-cache` | **Redirect hop**; robots Disallow `/product/` |
| `/p/6537` | **308** | — | — | → canonical (1 hop) | same | **Redirect** then index canonical |
| `/phu-tung/{slug-id}` | **308** | — | — | → root canonical | same | **Redirect** (legacy backlink path) |
| `/xe/…` | **404** | — | `noindex` | — | `private, no-cache` | **Hard 404**; robots Disallow |
| `/search/…` | **404** | — | `noindex` | — | same | **Hard 404** |
| Unknown slug | **404** | — | `noindex` | — | same | **Hard 404** |
| Invalid product id slug | **404** | — | `noindex` | — | same | **Hard 404** |
| `/?q=toyota` | **200** | `/` (home) | `index, follow` | — | ISR cache | **Discouraged** via `Disallow: /*?*` |
| `?page=2` listing | **200** | Page 1 URL | `index, follow` | — | dynamic | **Discouraged** via `Disallow: /*?*` |
| `/_next/static/*.js` | **200** | — | — | — | `max-age=31536000, immutable` | **Asset crawl** (rendering) |
| `/_next/static/*.css` | **200** | — | — | — | `max-age=31536000, immutable` | **Asset crawl** (~72 KB/sample file) |

**X-Robots-Tag header:** Not observed on sampled HTML responses (reliance on `<meta name="robots">`).

---

## SECTION 3 — 404 audit

### Hard 404 (expected)

| Trigger | HTTP | meta robots | Example |
|---------|------|-------------|---------|
| Unknown marketplace slug | 404 | `noindex` | `/this-slug-does-not-exist-xyz-99999` |
| Invalid / non-product slug ending in id | 404 | `noindex` | `/fake-part-name-toyota-vios-9999999999` |
| Legacy `/xe/` namespace | 404 | `noindex` | `/xe/toyota-vios` |
| `/search/*` (no route) | 404 | `noindex` | `/search/foo` |
| Unknown shop subdomain | 404 | `noindex, nofollow` | `nonexistentshop999.otofine.com` |
| Invalid legacy product id (via redirect routes) | 404 | — | `/product/9999999999` (after route logic) |

### Expected 404 volume drivers

- External broken links to removed products/slugs
- Legacy `/xe/` bookmarks
- Probe/scanner traffic on random slugs
- Invalid shop subdomains (wildcard protection)

**Estimate:** **Low–moderate** share of total crawl requests (**~1–4%** predicted in Crawl Stats).

### Unexpected 404 (watch in GSC)

- Sitemap URLs returning 404 (should be **zero** — monitor weekly)
- High-traffic canonical product URLs 404 (inventory/archival changes)
- Shop subdomain URLs in `sitemap-shops.xml` returning 404

### Soft 404 (200 but “empty”)

| Pattern | Risk | Current evidence |
|---------|------|------------------|
| Listing with zero products | Medium | `urlGovernance` gates sitemap; thin pages may still 200 |
| Archived PDP | Low | Archive banner in UI; still 200 + index |
| RFQ / shop pages with login walls | Low | 200 but disallowed namespaces |

**Sample:** `/phu-tung-o-to-tai-ha-noi` → **200**, 32 KB, `index, follow` (not soft 404).

**Estimate:** **Low** soft-404 rate if sitemap governance holds; watch GSC “Soft 404” / “Crawled – currently not indexed” buckets.

---

## SECTION 4 — Redirect audit

### Inventory (live + code)

| Status | Where | Purpose |
|--------|-------|---------|
| **308** | `permanentRedirect()` — `/product/{id}`, `/p/{id}`, `/phu-tung/{slug}`, product slug drift on `[slug]` | Legacy → canonical product |
| **301** | `middleware.js` — shop sunset, legacy collection paths | Permanent taxonomy / shop migrations |
| **307** | `/product` (no id) → `/` | Temporary-style redirect to home |
| **302** | Not observed in production samples | — |

### Redirect chains (Googlebot, no auto-follow)

| Start | Chain | Hops |
|-------|-------|------|
| `/product/6537` | 308 → `/loc-gio-dieu-hoa-…-6537` → **200** | **1** |
| `/p/6537` | 308 → canonical → **200** | **1** |
| `/phu-tung/{slug-id}` | 308 → root canonical → **200** | **1** |

**No multi-hop chains** detected on legacy product paths (good).

### Expected Googlebot behavior

- Follows **308/301** to canonical product URLs
- May **fetch** `/product/*` despite content value = redirect; robots declares **Disallow `/product/`** → should reduce crawl frequency
- `/p/{id}` **allowed** — valid path for sitemap/id-only discovery → single 308 to canonical
- Middleware **301** on shop sunset sends to apex taxonomy/product URLs

**Predicted redirect % in Crawl Stats:** **~2–5%** (legacy backlinks + shop lifecycle; not dominant)

---

## SECTION 5 — Crawl budget risks

| Risk | Severity | Evidence |
|------|----------|----------|
| **Large HTML** | **Medium** | Vehicle ~**105 KB**; shop subdomain ~**180 KB**; category ~**34 KB** |
| **Duplicate URLs** | **Low–Medium** | Apex `/shops/{slug}` mirrors subdomain (noindex); canonical consolidation on products; paginated URLs canonicalize to page 1 |
| **Infinite URL space** | **Mitigated** | `urlGovernance.isIndexable()` + sitemap gating; robots blocks `/*?*` |
| **Faceted URLs** | **Mitigated** | `Disallow: /*?q=*`, `/*?pagenumber=*`, `/*?*` — intentional ([Google faceted navigation guidance](https://developers.google.com/search/docs/crawling-indexing/crawl-management/faceted-navigation)) |
| **JS rendering** | **Medium** | Product PDP + listing grids client-hydrated; Google renders JS but adds **render queue** latency |
| **JS/CSS asset volume** | **High (request count)** | Product page sample: **~15 CSS** + **~17 JS** chunk references per HTML; static assets `immutable` 1y cache |
| **Image URLs** | **Medium** | **7,002** image sitemap entries; product SSR has **0 `<img>`** — images loaded post-render / external (`img.otofine.com` on shops) |
| **Sitemap scale** | **Medium** | **12,417** HTML URLs — large but partitioned |
| **Robots conflicts** | **Low** | RFQ returns `index,follow` but robots Disallow `/rfq/` — crawl should be limited |
| **API JSON responses** | **Low–Medium** | `/api/products` returns **200** + **128 KB JSON** if crawled despite Disallow |

### Highest-impact areas for crawl efficiency

1. Vehicle + shop HTML payload size  
2. Per-page `_next/static` JS/CSS fan-out  
3. Parameter URLs if robots wildcard enforcement drifts  
4. Re-crawl of legacy redirect endpoints (`/product/`, `/p/`)

---

## SECTION 6 — Expected Crawl Stats baseline (predictions)

Based on: **12,417** sitemap HTML URLs, Next.js 15 App Router, ~15–20 JS + ~5 CSS refs/page, 7k image sitemap entries, redirect namespaces, robots blocks.

| Crawl Stats bucket | Predicted range | Rationale |
|--------------------|-----------------|-----------|
| **HTML** | **40–55%** | Primary discovery via sitemap + internal links; one HTML doc per URL |
| **JavaScript** | **25–35%** | Many `/_next/static/chunks/*.js` per page; required for rendering |
| **CSS** | **8–14%** | Multiple stylesheets per route (~70 KB/file) |
| **Image** | **5–12%** | Image sitemap + shop covers + lazy product images (often off-domain) |
| **Redirect** | **2–5%** | Legacy `/product/`, `/p/`, `/phu-tung/` + middleware 301s |
| **404** | **1–4%** | Unknown slugs, `/xe/`, `/search/`, invalid shops |
| **Other** | **2–5%** | Fonts, favicon, JSON API if hit, sitemap XML |

**Note:** Percentages are **predictions** for initial GSC baseline comparison — actual mix depends on crawl recency, backlink profile, and render retries.

### Host split (if GSC uses domain property)

- **otofine.com** — majority of HTML/JS/CSS  
- **\*.otofine.com** — shop subdomains (~407 sitemap URLs; larger HTML per page)

---

## SECTION 7 — Monitoring checklist (Search Console Crawl Stats)

### Weekly (first 4 weeks after baseline)

- [ ] **Total crawl requests** — trend up/down vs this audit baseline  
- [ ] **Average response time** — spike on category/vehicle routes (>2s TTFB warning)  
- [ ] **HTML vs JS ratio** — JS share rising may indicate render-heavy recrawls  
- [ ] **404 count** — spike → export top 404 URLs; cross-check sitemap  
- [ ] **Redirect count** — spike on `/product/` or `/p/` → legacy backlink wave  
- [ ] **Robots.txt blocked** — should correlate with `/rfq/`, `/admin/`, `?` params  
- [ ] **By file type** — confirm CSS/JS not blocked (robots allows `/_next/`)

### Bi-weekly

- [ ] **Crawl by purpose** (if available) — Discovery vs Refresh  
- [ ] **Host report** — subdomain vs apex split  
- [ ] **Soft 404 / Crawled-not-indexed** (Page indexing report) — correlate with thin listings  
- [ ] **Sitemap coverage** — 12,417 submitted vs indexed; zero sitemap 404s

### Monthly

- [ ] **Large HTML pages** — vehicle/shop p95 size vs crawl time  
- [ ] **Faceted URL leakage** — any `?q=` or `?page=` indexed despite robots (URL Inspection sample)  
- [ ] **Redirect chain regressions** — spot-check 10 legacy URLs for single-hop 308  
- [ ] **Shop sunset 301s** — closed shops still redirecting correctly  

### Alert thresholds (investigate if exceeded)

| Signal | Threshold |
|--------|-----------|
| 404 crawl share | **>8%** for 2 consecutive weeks |
| Redirect crawl share | **>10%** |
| Avg response time | **>1.5s** sustained |
| Sitemap URL 404 | **Any** top-100 sitemap URL |
| HTML share collapse | **<30%** with JS **>50%** (render stress) |

### Export to keep alongside this audit

1. GSC → Settings → Crawl stats → **Export** (CSV) — week 0 baseline  
2. Sitemap index URL counts (12,417 reference)  
3. This doc Section 2 probe table for regression comparison  

---

## Appendix — robots.txt (live)

```
User-Agent: *
Allow: /
Allow: /phu-tung-
Disallow: /xe/
Disallow: /rfq/
Disallow: /product/
Disallow: /shop/
Disallow: /admin/
Disallow: /api/
Disallow: /search/
Disallow: /*?q=*
Disallow: /*?pagenumber=*
Disallow: /*?*
Sitemap: https://otofine.com/sitemap.xml
```

**Note:** Simple robots parsers may over-report “allowed” for wildcard rules. Google’s crawler implements `*` per [Google robots.txt spec](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt). Treat **Disallow lines above as intended policy** regardless of third-party parser output.

---

## Appendix — HTML size reference (Googlebot)

| Page type | Bytes (2026-06-28) |
|-----------|-------------------|
| Homepage | 22,269 |
| Category | 34,114 |
| Vehicle | 105,092 |
| Product | 18,194 |
| Shop subdomain | 180,788 |

---

**Audit complete.** No source changes. Use this document as week-0 reference when opening Search Console → **Settings → Crawl stats**.
