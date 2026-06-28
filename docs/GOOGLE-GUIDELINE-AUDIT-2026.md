# GOOGLE-GUIDELINE-AUDIT-2026

**Site:** https://otofine.com  
**Mode:** READ ONLY — no code/build/restart/config changes  
**Audit date:** 2026-06-28  
**Method:** Live production probes (Googlebot UA) + read-only architecture review  
**Scope:** Current production architecture only (ignore historical migrations)

**Official references used (Google Search Central only):**

- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Large site managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget)
- [Robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt)
- [Robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Canonicalization](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicates)
- [Sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)
- [Faceted navigation](https://developers.google.com/search/docs/crawling-indexing/crawl-management/faceted-navigation)
- [Links and crawlability](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Merchant listing structured data](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Google Images best practices](https://developers.google.com/search/docs/appearance/google-images)
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)

---

## SECTION 1 — Search Essentials

| Check | Result | Evidence |
|-------|--------|----------|
| Crawlability | **PASS** | Key templates return HTTP 200 for Googlebot: `/`, `/ma-phanh-o-to`, `/ma-phanh-toyota`, `/phu-tung-toyota-vios`, product canonical URL |
| Indexability | **WARNING** | Most pages emit `index, follow`; homepage + product listing rely heavily on JS rendering (see §4) |
| Accessibility (technical) | **PASS** | HTML responses, UTF-8, no hard 5xx on sampled URLs |
| HTTP status | **PASS** | 200 on canonical URLs; legacy `/product/{id}` and `/p/{id}` correctly **308** → canonical |
| Canonical | **PASS** | Single `<link rel="canonical">` on all sampled page types |
| Robots | **WARNING** | `robots.txt` + meta robots present; SearchAction target conflicts with query disallow (see §6, §8) |
| Spam compliance | **WARNING** | Visually hidden (`sr-only`) discovery nav with crawl-only prominence — review against hidden-link guidance |

**Result:** **WARNING**  
**Confidence:** **88%**

*Google basis:* [Search Essentials — technical requirements](https://developers.google.com/search/docs/essentials); [Spam policies — hidden links](https://developers.google.com/search/docs/essentials/spam-policies#hidden-links-and-text)

---

## SECTION 2 — Crawling (natural graph)

### Sampled crawl chain (production, 2026-06-28)

| Step | URL | HTTP | SSR internal links to next step |
|------|-----|------|----------------------------------|
| Homepage | `/` | 200 | 12 `<a href>` in discovery nav (`sr-only`); FAQ JSON-LD |
| Category | `/ma-phanh-o-to` | 200 | 5 brand discovery links (`/ma-phanh-toyota`, …) |
| Brand (CB) | `/ma-phanh-toyota` | 200 | 7 vehicle links (`/ma-phanh-toyota-vios`, …) |
| Vehicle | `/phu-tung-toyota-vios` | 200 | **22+** canonical product `/<slug>-<id>` links in article HTML |
| Product | `/loc-gio-dieu-hoa-toyota-altis-…-6537` | 200 | **No** vehicle/category links in initial HTML |
| Back to vehicle | — | — | **Dead end / weak return path** in SSR HTML |

### Crawl depth

- **Sitemap path:** Home → marketplace URLs in sitemap → product (depth 1–2 via sitemap, not HTML graph)
- **HTML path depth to product:** Home → Category → Brand → Vehicle → Product ≈ **4 hops** (within normal range)
- **Alternate path:** Sitemap lists **7,385** product URLs directly (depth bypass)

### Dead ends

| Page type | Issue |
|-----------|-------|
| Product detail | Initial HTML has **~7** internal hrefs (assets only); no SSR links back to vehicle/category or to related products |
| Category / Brand listing | **0** product `/<slug>-<id>` links in SSR HTML (grid is client-rendered) |

### Orphan risk

- **Low** for products in sitemap (7,385 URLs)
- **Moderate** for products discoverable only via client-side listing pagination/filter (not in initial HTML)

**Result:** **WARNING**  
**Confidence:** **85%**

*Google basis:* [Links crawlable](https://developers.google.com/search/docs/crawling-indexing/links-crawlable); [JavaScript SEO — use SSR for important content](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

---

## SECTION 3 — Internal Linking

| Factor | Assessment |
|--------|------------|
| Anchor text | Vehicle article links use descriptive part names; discovery nav uses category/brand labels |
| href quality | Vehicle layer uses root canonical `/<slug>-<id>` (0 `/product/` in vehicle HTML post C1) |
| Navigation | Global header links present on listing pages; homepage main grid is JS-dependent |
| Breadcrumbs | Product JSON-LD `BreadcrumbList` present; **no visible HTML breadcrumb** on product SSR |
| Contextual links | Strong on **vehicle** pages (article + price table); weak on **category/brand** SSR |
| Footer links | Minimal in sampled SSR |
| Hidden navigation | Homepage + category + brand use `sr-only` discovery `<nav>` (12 / 5 / 7 links) |
| JS navigation | Category/product listings rely on client hydration for product anchors |
| SSR links | **Strong:** vehicle, discovery graph; **Weak:** homepage main listing, category product grid, product detail |

**Link graph quality:** **B-** — hub-and-spoke via sitemap + vehicle articles; listing layers under-linked in SSR.

**Result:** **WARNING**  
**Confidence:** **87%**

*Google basis:* [SEO Starter Guide — help Google find pages](https://developers.google.com/search/docs/fundamentals/seo-starter-guide); [Link best practices](https://developers.google.com/search/docs/crawling-indexing/links)

---

## SECTION 4 — JavaScript SEO

| Check | Production finding |
|-------|-------------------|
| CSR | Homepage: `BAILOUT_TO_CLIENT_SIDE_RENDERING` in HTML; category/brand product grids not in initial HTML |
| SSR | Vehicle SEO article, discovery nav, metadata, JSON-LD server-rendered |
| Hydration | Next.js App Router + dynamic `Home` component with `ssr: true` but bailout on homepage |
| Progressive enhancement | Title/meta/JSON-LD available without JS; main product grid and product UI are JS-dependent |
| Googlebot rendering | Google can render JS ([official guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)), but **important links/content should be in HTML** |
| Homepage bailout | **Present** — primary marketplace UI deferred |
| Dynamic rendering | Not used (standard Next SSR/CSR) |
| Streaming / Suspense | Homepage wrapped in `<Suspense>` with loading skeleton |

**Result:** **WARNING**  
**Confidence:** **90%**

*Google basis:* [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) — *“Use SSR or static rendering for critical content.”*

---

## SECTION 5 — Canonical

| Check | Result |
|-------|--------|
| One canonical per page | **PASS** — count = 1 on all sampled URLs |
| Self-referencing canonical | **PASS** — product, category, brand, vehicle canonicals match URL |
| Redirect consistency | **PASS** — `/product/6537` → 308 → `/loc-gio-dieu-hoa-…-6537`; `/p/6537` → same |
| Canonical loops | **None detected** |
| Cross-domain | Shop subdomain self-canonical (`https://phutungoto355.otofine.com`); apex product canonical on apex |
| Duplicate canonical tags | **None** in samples |

**Pagination note:** `/ma-phanh-o-to?page=2` canonical = `https://otofine.com/ma-phanh-o-to` (page 1). Aligns with [consolidate duplicates](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicates) approach for paginated sets.

**Result:** **PASS**  
**Confidence:** **92%**

---

## SECTION 6 — Robots

### robots.txt (live)

```
Allow: /
Allow: /phu-tung-
Disallow: /xe/, /rfq/, /product/, /shop/, /admin/, /api/, /search/
Disallow: /*?q=*
Disallow: /*?pagenumber=*
Disallow: /*?*
Sitemap: https://otofine.com/sitemap.xml
```

| Check | Result |
|-------|--------|
| robots.txt reachable | **PASS** (200) |
| meta robots | **PASS** — `index, follow` on indexed samples |
| X-Robots-Tag | Not observed on samples |
| Blocked URLs | Legacy `/product/` blocked (OK — redirect-only); all `?query` URLs declared blocked |
| Blocked resources | CSS/JS **not** blocked — **PASS** ([Google: don't block rendering resources](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)) |

**Conflict:** `WebSite` JSON-LD `SearchAction` target = `https://otofine.com/?q={search_term_string}` but robots declares `Disallow: /*?q=*` and `Disallow: /*?*`. Search box structured data expects a crawlable results URL.

**Result:** **WARNING**  
**Confidence:** **91%**

*Google basis:* [Robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt); [Sitelinks search box](https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox)

---

## SECTION 7 — Sitemaps

| Metric | Value |
|--------|-------|
| Index | 4 child sitemaps |
| `sitemap-products.xml` | 7,385 URLs, 7,002 `image:image` entries |
| `sitemap-marketplace-core.xml` | 2,922 URLs (includes homepage) |
| `sitemap-marketplace-location.xml` | 1,703 URLs |
| `sitemap-shops.xml` | 407 URLs |
| **Total** | **~12,417** URLs |
| Duplicates (products ∩ core sample) | **0** in 10,307 cross-check |
| Partitioning | **PASS** — by entity type |
| lastmod | Present on all entries; index lastmod uniform (same timestamp) |
| priority | Present (0.5–1.0) — Google **ignores** priority ([sitemap guidelines](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)) |
| Canonical consistency | Product sitemap URLs match live canonical pattern `/<slug>-<id>` |

**Result:** **PASS** (minor lastmod accuracy note)  
**Confidence:** **89%**

---

## SECTION 8 — Structured Data

| Type | Present | Notes |
|------|---------|-------|
| Organization | ✅ | Global layout |
| WebSite + SearchAction | ✅ | Search target vs robots conflict (§6) |
| FAQPage | ✅ | Homepage |
| BreadcrumbList | ✅ | Product pages (JSON-LD) |
| Product | ✅ | Product pages |
| Offer | ✅ | Price + availability in JSON-LD |
| ItemList | ❌ | Not in category/brand SSR samples |
| Merchant listing | ⚠️ Partial | Marketplace model; Offer present, not full Merchant return policy schema |
| Brand in Product | ⚠️ | JSON-LD `brand.name` = **shop name**, not vehicle/part brand |

**Validation readiness:** Product pages likely validate core Product/Offer; SearchAction URL may fail practical eligibility; brand field may not match [Product snippet requirements](https://developers.google.com/search/docs/appearance/structured-data/product).

**Result:** **WARNING**  
**Confidence:** **84%**

---

## SECTION 9 — Helpful Content

| Signal | Assessment |
|--------|------------|
| Unique value | **Strong** on vehicle pages (faults, maintenance, pricing tables, long-form article) |
| Thin pages | Category/brand pages are **template-heavy** until JS loads product evidence |
| Duplicate templates | Many marketplace permutations; mitigated by `urlGovernance` indexability thresholds |
| SEO-only pages | Low-product-count URLs gated from sitemap via governance |
| AI-generated signals | Vehicle articles appear editorial; no production evidence of mass unreviewed AI thin content |

**Result:** **PASS** (with listing-page thin-SSR caveat)  
**Confidence:** **80%**

*Google basis:* [Helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

---

## SECTION 10 — Image SEO

| Check | Product page | Vehicle page |
|-------|-------------|--------------|
| `<img>` in SSR HTML | **0** | Inline article images in HTML |
| alt text | N/A in SSR | Present in article figures |
| lazy loading | N/A in SSR | Used in article markup |
| Image sitemap | 7,002 product image URLs in sitemap | — |
| OpenGraph | Homepage/product metadata includes `/logo.png` | — |
| Google Images indexability | Product hero images likely JS-loaded | Article images crawlable in HTML |

**Result:** **WARNING** (product detail images not in initial HTML)  
**Confidence:** **86%**

*Google basis:* [Google Images](https://developers.google.com/search/docs/appearance/google-images); [Image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)

---

## SECTION 11 — Pagination

| Check | Finding |
|-------|---------|
| `?page=` | Used on listing pages (`SeoListingContent`) |
| Canonical | Page 2 → canonical page 1 (**consistent**) |
| robots | `Disallow: /*?*` — paginated URLs declared non-crawlable |
| Crawl budget | Intentional — products reached via sitemap + page-1 SSR discovery |
| Google recommendation | [Faceted navigation](https://developers.google.com/search/docs/crawling-indexing/crawl-management/faceted-navigation) — block/low-priority param URLs; acceptable if canonicals consolidate |

**Result:** **PASS** (by design)  
**Confidence:** **88%**

---

## SECTION 12 — Faceted Navigation

| Facet | URL pattern | Handling |
|-------|-------------|----------|
| Brand / model / year | Path-based SEO slugs (`/ma-phanh-toyota-vios`) | Indexable when inventory thresholds met |
| Location | `-tai-{province}` suffix | In sitemap + governance |
| Query `?q=` | Homepage search | **Disallowed** in robots |
| Query filters | Various | **Disallowed** via `/*?*` |
| Infinite combinations | Mitigated by `urlGovernance.isIndexable()` namespace rules | |
| Duplicate URLs | Canonical enforcement + 308 redirects on product slug drift | |

**Result:** **PASS**  
**Confidence:** **87%**

*Google basis:* [Faceted navigation best practices](https://developers.google.com/search/docs/crawling-indexing/crawl-management/faceted-navigation)

---

## SECTION 13 — Product Pages

Sample: `https://otofine.com/loc-gio-dieu-hoa-toyota-altis-2006-2016-8713906080-6537`

| Element | SSR status |
|---------|------------|
| `<title>` | ✅ “Lọc gió điều hòa Toyota Altis 2006-2016 \| Otofine” |
| `<h1>` | ❌ **0** in initial HTML |
| Price | ⚠️ In JSON-LD; “Giá” text not in SSR body sample |
| Availability | ✅ Offer availability in JSON-LD |
| Brand / part number | ✅ In title + JSON-LD sku (part number) |
| Breadcrumbs | JSON-LD only |
| Related products | ❌ Not in SSR |
| Fitment | Text tokens in HTML payload; structured fitment links weak |
| Structured data | Product + Offer + BreadcrumbList |

**Result:** **WARNING**  
**Confidence:** **88%**

*Google basis:* [SEO Starter Guide — write good titles](https://developers.google.com/search/docs/fundamentals/seo-starter-guide); [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)

---

## SECTION 14 — Performance (crawl/index impact only)

Google states slow responses can affect crawl rate ([Large site crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget)).

| URL | Approx TTFB (Googlebot) | HTML size |
|-----|------------------------|-----------|
| `/` | ~0.05s (cached prerender) | 21 KB |
| `/ma-phanh-o-to` | ~2.7s | 33 KB |
| `/phu-tung-toyota-vios` | ~0.11s | 105 KB |
| Product canonical | ~0.07s | 18 KB |

| Issue | Crawl/index relevance |
|-------|----------------------|
| Category TTFB ~2.7s | **WARNING** — may reduce crawl rate on large-scale recrawl |
| Vehicle HTML 105 KB | Acceptable; content-rich |
| Homepage prerender cache | **Positive** — fast bot response |
| Render-blocking JS | Present (`/_next/static/chunks/…`) — Google can render if not blocked in robots |

**Result:** **WARNING** (category latency only)  
**Confidence:** **82%**

---

## SECTION 15 — Large Site Best Practices

| Google guidance | Otofine implementation |
|-----------------|------------------------|
| Submit sitemaps | ✅ ~12k URL partitioned index |
| Manage crawl budget | ✅ robots blocks param faceting; governance gates thin URLs |
| Strong URL structure | ✅ Semantic slugs with canonical enforcement |
| Server stability | ✅ 200 on samples |
| Duplicate control | ✅ Canonical + 308 |
| Monitoring | Out of scope (GSC assumed) |

**Result:** **PASS**  
**Confidence:** **86%**

*Google basis:* [Managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget)

---

## SECTION 16 — Marketplace-specific Review

| Surface | Canonical owner | Index signals | Notes |
|---------|----------------|---------------|-------|
| Apex marketplace | `otofine.com` | index, follow | Primary SEO property |
| Category / CB / CBM | Path-owned slugs | Governed by inventory | Discovery graph in SSR |
| Vehicle pages | `/phu-tung-{model}` | Rich SSR content + product links | Strongest HTML hub |
| Product pages | `/<slug>-<id>` | index; sitemap + redirects | Weak SSR linking back |
| Discovery graph | sr-only nav | Crawlable anchors | See hidden-link warning |
| Shop subdomains | `{slug}.otofine.com` | index; separate sitemap (407) | Product cards link to apex canonical |

**Result:** **PASS** with SSR linking gaps  
**Confidence:** **85%**

---

## SECTION 17 — What Google Would Likely Like

1. **Clear canonical product URLs** at root `/<descriptive-slug>-<id>` with 308 from legacy paths — aligns with [consolidate duplicates](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicates).
2. **Partitioned sitemap index** (~12k URLs) with **image sitemap** for products — aligns with [large site sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps).
3. **Faceted URL blocking** via `robots.txt` for query parameters — aligns with [faceted navigation](https://developers.google.com/search/docs/crawling-indexing/crawl-management/faceted-navigation).
4. **Inventory-gated indexability** (`urlGovernance`) — reduces thin/empty listing index bloat.
5. **Vehicle SEO articles** with substantive, people-first content — aligns with [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).
6. **Server-rendered metadata** (`title`, `canonical`, `robots`) on all sampled templates.
7. **HTTP 200/308 discipline** — no redirect chains on sampled product canonicalization.

---

## SECTION 18 — What Google Would Likely Dislike

| # | Google guideline | Current implementation | Risk | Priority | Confidence |
|---|------------------|------------------------|------|----------|------------|
| 1 | [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) — critical content in HTML | Category/brand **product grids have 0 product hrefs** in SSR; homepage **BAILOUT** CSR | Product discovery depends on JS render | **P1** | 90% |
| 2 | [Links crawlable](https://developers.google.com/search/docs/crawling-indexing/links-crawlable) — important links in `<a href>` | Product pages: **no SSR links** back to vehicle/category/related | Weak internal PageRank flow | **P1** | 88% |
| 3 | [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) — use meaningful headings | Product SSR: **0 `<h1>`** | Heading signals rely on JS | **P2** | 88% |
| 4 | [Spam policies — hidden links](https://developers.google.com/search/docs/essentials/spam-policies#hidden-links-and-text) | Discovery nav: **`sr-only`** category/brand/vehicle links not visible to sighted users | Manual action / link scheme perception | **P2** | 75% |
| 5 | [Sitelinks search box](https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox) — target URL crawlable | `SearchAction` → `/?q={term}` but robots **Disallow: /*?q*`** | Search box rich result ineligible | **P3** | 91% |
| 6 | [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product) — accurate brand | JSON-LD `brand` = shop name, not part manufacturer | Rich result quality / validation | **P3** | 84% |
| 7 | [Google Images](https://developers.google.com/search/docs/appearance/google-images) — images in HTML | Product detail: **0 `<img>`** in SSR | Image indexing delayed until render | **P3** | 86% |
| 8 | [Large site crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — efficient crawling | Category pages **~2.7s TTFB** | Slower recrawl of listing namespace | **P3** | 82% |

---

## SECTION 19 — Overall Score

| Dimension | Score (0–100) | Rationale |
|-----------|---------------|-----------|
| Architecture | **82** | Strong URL/canonical/sitemap design; JS-heavy listing layer |
| Crawlability | **78** | Sitemap excellent; HTML graph gaps on listings/products |
| Indexability | **80** | Proper robots/canonicals; CSR defers key listing content |
| Content | **85** | Vehicle articles strong; listing SSR thin |
| Discovery | **76** | Discovery graph + sitemap; hidden nav + CSR concerns |
| Structured Data | **74** | Core schemas present; SearchAction + Product brand issues |
| Performance (crawl-relevant) | **83** | Fast product/home; slow category sample |
| Large-site readiness | **86** | Partitioned sitemap, governance, param blocking |

### **Overall score: 80 / 100**

**Summary verdict:** Otofine’s **URL architecture, canonical strategy, sitemap, and faceted-navigation controls** align well with official Google large-site guidance. The primary gaps versus Google documentation are **JavaScript-dependent listing/product content**, **weak SSR internal linking on product pages**, and **SearchAction vs robots.txt conflict**. Vehicle-layer SEO content and post-C1 canonical product links in vehicle HTML are clear strengths.

---

## Audit methodology notes

- All HTTP/HTML probes used `Googlebot/2.1` user agent against live `https://otofine.com`.
- No local/staging substitutes.
- Scores reflect **current production** only; historical `/product/` migration issues excluded per brief.
- Findings cite Google Search Central docs only; no third-party SEO heuristics used as primary evidence.
