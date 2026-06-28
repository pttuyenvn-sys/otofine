# SLUG-PAGE-CACHE-READINESS-AUDIT-01

**Date:** 2026-06-22  
**Mode:** Read-only — no code changes  
**Target:** `frontend/app/[slug]/page.js` and downstream loaders  
**Context:** Post `YEAR-RANGE-LINKS-DATASET-OPTIMIZATION-IMPLEMENT-01` (~114 KB) and `HOME-FILTER-IMMEDIATE-NAVIGATION-RESTORE-01` (~0.4–0.7 s/pick warm).

---

## Executive summary

| Question | Answer |
|----------|--------|
| Is `force-dynamic` still the main bottleneck? | **Partially.** It blocks **Full Route / ISR page cache**, but **fetch-level Data Cache** already makes warm server renders **~50–80 ms TTFB**. |
| Can slug pages move toward ISR safely? | **Yes for vehicle/category listing slugs** with a **hybrid** approach (segment or route split + `revalidate` 15–60 min). **Not as-is** for the monolithic `[slug]` route (products + knowledge + redirects share one file). |
| Biggest remaining user-visible cost | **Client listing cascade** (~0.35–0.5 s parallel APIs + hydration), not slug RSC shell. |
| **Recommendation** | **Scenario 2 — Hybrid:** remove `force-dynamic` for listing slugs only, enable ISR/`revalidate` on SEO shell; keep products/facets client-fetched; keep robots metadata on shorter TTL fetch cache. |

---

## Current page config

```25:26:frontend/app/[slug]/page.js
export const dynamic = "force-dynamic";
export const revalidate = 3600;
```

`force-dynamic` **overrides** `revalidate = 3600` — ISR / Full Route Cache is **disabled**. Individual `fetch(..., { next: { revalidate } })` calls still use Next.js **Data Cache** on dynamic renders.

---

## Render dependency graph

```mermaid
flowchart TD
  subgraph entry["app/[slug]/page.js"]
    MD[generateMetadata]
    PG[SlugHomePage default export]
  end

  subgraph resolve["resolveSeoEntity (React cache)"]
    PROD{product slug?}
    CBMY[parseCbmyListingSlug]
    LOC[parseLocationOnlyVehicleSlug]
    VSEO[getVehicleSeoPage]
    LAND[parseLandingSlug]
    CAT[tryResolveCategoryEntity]
    KNOW[loadPartSeoPage no-store]
  end

  subgraph metaOnly["generateMetadata only"]
    SEOID[seoIdentityFromMarketplaceEntity]
    ROBOTS[buildListingRobotsMetadata]
  end

  subgraph pageOnly["page body only"]
    REDIR[permanentRedirect canonical check]
    YRL[resolveListingYearRangeLinks]
    HOME[Home client component SSR shell]
  end

  subgraph client["Home.jsx client-only after hydration"]
    SEED[fetchListingCatalogSeed]
    FACETS[fetchListingFilterSnapshot Nhóm B]
    LIST[GET /api/products]
    SEOCLIENT[SeoContent / dynamic JSON-LD]
  end

  MD --> resolve
  MD --> SEOID
  MD --> ROBOTS
  PG --> resolve
  PG --> REDIR
  PG --> YRL
  PG --> HOME
  HOME --> client

  PROD -->|yes| PDET[getProductDetailCached]
  PROD -->|yes| PD[ProductDetail + ProductJsonLd]
  CBMY --> BR[/filter/brands + /product-categories + /filter/models]
  LOC --> PROV[/address/provinces]
  VSEO --> VAPI[/vehicle-seo/:slug DB-heavy]
  LAND --> BR
  LAND --> PROV
  LAND --> CATROWS[/product-categories]
  CAT --> CATROWS
  KNOW --> SEOAPI[/seo-page/:slug no-store]
  ROBOTS --> PCOUNT[/products or /product-categories count]
  ROBOTS --> LOCS[/locations/available]
  YRL --> YRLAPI[/seo/year-range-links ~114 KB]
```

### Entity routing order (`resolveSeoEntity`)

1. Product slug → `getProductDetailCached` → `ProductDetail`
2. CBMY slug → category catalog + brand/model parsers
3. Location-only vehicle → provinces catalog
4. `getVehicleSeoPage` → `/api/vehicle-seo/:slug`
5. `parseLandingSlug` → vehicle landing fallback
6. Category resolution → category catalog
7. Knowledge → `loadPartSeoPage` (`cache: "no-store"`)
8. Unknown → `notFound()`

---

## Cache-readiness matrix

| Dependency | Loader / consumer | Current mode | Class | `fetch` revalidate | `unstable_cache` | ISR (full page) | Rec. TTL | Risk |
|------------|-------------------|--------------|-------|-------------------|------------------|-----------------|----------|------|
| Brand list | `resolveSeoEntity` → `/filter/brands` | Data Cache 3600 s | **A — STATIC** | ✅ Already | ✅ Optional wrap | ✅ Safe | 1 h | Stale brand rename rare |
| Province catalog | `fetchLocationCatalog` | Data Cache 3600 s | **A** | ✅ | ✅ | ✅ | 1 h | Low |
| Product category catalog | `fetchProductCategoryRows` (~1 MB) | Data Cache 3600 s | **A** | ✅ | ✅ | ✅ | 1 h | Category renames lag |
| Vehicle SEO page | `getVehicleSeoPage` (~13–26 KB, DB joins) | Data Cache 3600 s | **B — SEMI** | ✅ | ✅ | ✅ with TTL | 15–60 min | Stale H1/article/product stats in `premiumArticle` |
| Year-range link inventory | `fetchYearRangeLinksInventory` (~114 KB) | Data Cache 3600 s + backend Redis 1 h | **A** | ✅ | ✅ | ✅ | 1 h | Link set drift vs sitemap if products move |
| Year-range link projection | `resolveListingYearRangeLinks` (CPU filter) | Per-request | **A** | N/A | ✅ cache by slug | ✅ bundled in page ISR | 1 h | Low — pure function on cached inventory |
| Landing slug parse | `parseLandingSlug` | Uses cached catalogs | **A** | ✅ upstream | ✅ | ✅ | 1 h | Low |
| Product detail (product slugs) | `getProductDetailCached` | Data Cache 600 s | **B** | ✅ | ✅ | ⚠️ per-slug ISR | 5–15 min | Price/stock/visibility stale |
| Part knowledge SEO | `loadPartSeoPage` | **`cache: "no-store"`** | **C — DYNAMIC** | ❌ forces dynamic | ⚠️ if switched to revalidate | ❌ poisons shared route | 5–15 min if changed | Admin edits expect freshness |
| Robots index/noindex | `buildListingRobotsMetadata` | Data Cache **120 s** on count APIs | **B** | ✅ | ✅ | ⚠️ metadata stale | **2–15 min** | **Medium** — thin pages may stay indexed too long |
| Canonical redirect | `permanentRedirect` in page | Request-time compare | **C** | N/A | N/A | ⚠️ must run before cache serve | — | **Medium** — wrong slug could 301 from stale cache if not validated at edge |
| Meta title/description | `seoIdentityFromMarketplaceEntity` | Derived from entity | **A/B** | via upstream | ✅ | ✅ | 1 h | Low for listings |
| H1 / initial filters | Server props → `Home` | From entity | **A/B** | via upstream | ✅ | ✅ | 15–60 min | Client `pageTitle` overrides after hydration |
| Product grid | `Home.jsx` `useEffect` | Client `fetch` no Next cache | **C** | N/A (client) | N/A | N/A (by design) | Real-time OK | None for ISR — always fresh client-side |
| Facets (models/years/specs) | `fetchListingFilterSnapshot` | Client TTL 60–120 s | **B** | Could move server | Optional | Optional SSR snapshot | 2–5 min | Low |
| JSON-LD (listings) | `SeoArticleBlock` client after products | Client-composed | **C** | N/A | N/A | N/A | Live with products | Not in RSC today |
| JSON-LD (products) | `ProductJsonLd` server | From cached product | **B** | ✅ 600 s | ✅ | ⚠️ | 5–15 min | Price/availability stale |
| Sitemap parity | Separate `sitemap-*.xml` routes | 24 h route revalidate | **A** | ✅ | ✅ | Independent | 24 h | ISR on page does not affect sitemap |

---

## Measurements (2026-06-22, PM2 production stack)

Environment: `127.0.0.1:3000` / `127.0.0.1:5000`, ~7,385 public products.

### HTML document TTFB (`curl`)

| Slug | Cold (post `pm2 restart`) | Warm (repeat) |
|------|---------------------------:|--------------:|
| `/phu-tung-toyota` | **413 ms** | **53 ms** |
| `/phu-tung-toyota-vios` | **145 ms** | **61 ms** |
| `/phu-tung-toyota-vios-2020` | **79 ms** | **51 ms** |

Cold first hit pays compilation + cold Data Cache; subsequent slugs warm quickly via shared catalogs.

### User-visible (Playwright)

**Filter picks** (`validate-home-filter-immediate-navigation-restore-01.mjs`):

| Step | ms |
|------|---:|
| Toyota | 365 |
| Vios | 639 |
| 2020 | 640 |
| **Total** | **1,644** |

**Direct slug `goto`** (same session):

| Slug | ms to products |
|------|---------------:|
| `/phu-tung-toyota` | 758 |
| `/phu-tung-toyota-vios` | 435 |
| `/phu-tung-toyota-vios-2020` | 489 |

Gap vs ~50 ms server TTFB → **client hydration + listing cascade** dominates.

### Backend dependencies (warm)

| Endpoint | Latency | Payload |
|----------|--------:|--------:|
| `/api/seo/year-range-links` | ~7–11 ms | **114 KB** |
| `/api/vehicle-seo/toyota` | ~66 ms | 13 KB |
| `/api/vehicle-seo/toyota-vios` | ~105 ms | 26 KB |
| `/api/filter/brands` | ~7–92 ms | 0.8 KB |
| `/api/product-categories` | ~84 ms | **1.0 MB** |
| `/api/product-categories/canonical?…` | ~160–310 ms | ~3 KB |

### Parallel client listing cascade (simulated `curl` wall)

| Filter state | Wall time |
|--------------|----------:|
| Toyota | 396 ms |
| Toyota + Vios | 482 ms |
| Toyota + Vios + 2020 | 387 ms |

### Historical comparison

| Era | Slug server work | Notes |
|-----|-----------------|-------|
| Pre year-range opt | **~2.2–2.8 s** RSC | 8.9 MB `sitemap-data` per render |
| **Current warm** | **~50–100 ms** HTML TTFB | Data Cache + 114 KB year-range-links |
| Playwright per pick | **~0.4–0.7 s** | Mostly client APIs + paint |

---

## SEO safety analysis

| Signal | Source | ISR / stale risk | Mitigation |
|--------|--------|------------------|------------|
| **Canonical** | `seoIdentityFromMarketplaceEntity` + redirect | Alias slug may serve wrong canonical until revalidate | Keep redirect logic **outside** cached shell or short TTL for alias slugs |
| **Meta title / description** | SSR metadata | Stale custom vehicle SEO copy | 15–60 min TTL; `revalidateTag` on admin SEO edit |
| **robots index** | `buildListingRobotsMetadata` → live product count | Thin page stays indexed if count drops | Keep **≤15 min** TTL on count fetch; do not bundle robots into 1 h page ISR without segment split |
| **JSON-LD** | Product: server; Listing: **client after products** | Listing schema follows live grid (OK) | No change needed for listings |
| **Breadcrumbs** | Client / vehicle SEO props | Low | Accept 1 h staleness or client rebuild |
| **H1** | `initialListingFilters` + `ListingHero` | Low | Matches URL identity; stale only if SEO content overrides lag |
| **Product counts** (governance + copy) | Robots + vehicle `productStats` | Medium | Shorter TTL for governance metrics |
| **Sitemap parity** | Independent loaders (`loadMarketplaceSitemapData`, year-range service) | None from page ISR | Sitemap already 24 h cached |

---

## Scenarios

### 1. Keep `force-dynamic` (status quo)

| Pros | Cons |
|------|------|
| Zero SEO/stale risk from page cache | No Full Route Cache — every navigation re-executes server component tree |
| Canonical redirects always fresh | ~50–400 ms server work per pick (cold up to ~400 ms) |
| Robots metadata always uses ≤120 s count cache | Playwright still **~0.4–0.7 s**/pick — user bottleneck shifts to client |
| Simplest ops | `revalidate = 3600` on page is **dead code** today |

**When to choose:** If team prioritizes zero cache-invalidation complexity over marginal server savings.

---

### 2. Hybrid — dynamic shell boundaries, cached SEO data (**recommended**)

| Pros | Cons |
|------|------|
| Enable ISR / `revalidate` for **vehicle + category listing** slugs | Requires **route split** or `dynamicParams` strategy — knowledge `no-store` and product slugs should not share one forced-static segment |
| Cold TTFB **413 ms → ~20–50 ms** on full page cache hit | Must wire `revalidatePath` / tags on product publish, SEO admin, category edits |
| Cuts server CPU on high-traffic B/M/Y filter navigation | robots/canonical need explicit shorter-TTL metadata segment |
| Products stay client-fetched — inventory always live | Two code paths to test (cached listing vs dynamic product/knowledge) |

**Sketch (no implementation):**

- `app/[slug]/page.js` — remove `force-dynamic`; `export const revalidate = 1800` (30 min) for listing entities only.
- Split `app/[slug]/page.js` → `app/(listing)/[slug]` vs keep products/knowledge on dynamic route **or** gate with `export const dynamic = 'force-static'` + `dynamicParams = true` for listing slugs only.
- Wrap `resolveSeoEntity` listing branch in `unstable_cache` keyed by slug (tags: `seo-entity`, `vehicle-seo`).
- Keep `buildListingRobotsMetadata` on `revalidate: 120–300` fetch — optionally move to separate `generateMetadata` cache tier.

---

### 3. Full ISR / `revalidate` on monolithic `[slug]`

| Pros | Cons |
|------|------|
| Maximum TTFB reduction for crawlers and users | **High risk:** product price/stock, robots noindex, knowledge `no-store`, canonical redirects |
| Best server CPU savings at scale | **Thousands** of marketplace URLs — cache storage + invalidation complexity |
| Aligns with existing `revalidate = 3600` intent | Single catch-all mixes **4 entity kinds** with different freshness needs |

**When to choose:** Only after route split and invalidation webhooks exist. Not recommended on current monolithic file.

---

## Expected performance gains (if Hybrid implemented)

| Metric | Current warm | Hybrid ISR estimate | Notes |
|--------|-------------|---------------------|-------|
| **TTFB** (listing slug) | ~50–80 ms | **~10–30 ms** on full cache hit | Diminishing returns — already fast |
| **Cold first slug** | ~400 ms | **~50–100 ms** | Largest win for crawlers / post-deploy |
| **RSC / server CPU** | Re-run tree each nav | **~80–95% skip** on cache hit | Meaningful under concurrent filter traffic |
| **Home filter navigation** | ~365–640 ms/pick | **~300–550 ms/pick** (~10–20% ) | Dominated by client product/facet fetch — ISR does not remove Nhóm B |
| **Playwright total B→M→Y** | ~1.6 s | **~1.3–1.5 s** | Unless facets/products move to SSR snapshot |

**Bottom line:** ISR is **worth doing for server economics and cold crawls**, not as the next big UX win. Client listing cascade (`product-categories/canonical` ~160–310 ms) is the next filter-navigation target.

---

## Risk assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Stale `noindex` when inventory drops | **High** (SEO) | Medium | Short TTL on governance fetches; separate metadata cache |
| Cached non-canonical slug without 301 | **High** (SEO) | Low | Run redirect check before cache or exclude alias slugs from ISR |
| Knowledge page `no-store` blocks static segment | **Medium** | Certain on monolithic route | Route split |
| Product price stale on product slugs | **Medium** | Medium | Keep product slugs dynamic or 5 min TTL |
| Sitemap vs year-range link drift | **Low** | Low | Shared backend builders; aligned 1 h TTL |
| Cache stampede on deploy | **Low** | Medium | `stale-while-revalidate` (default ISR behavior) |

---

## Final recommendation

### **Proceed with Scenario 2 (Hybrid) — phased, not monolithic ISR**

1. **Phase A (low risk):** Remove dead `revalidate = 3600` **or** remove `force-dynamic` **only after** confirming no `cookies()`/`headers()` in slug tree (confirmed: none). Start with `revalidate = 1800` on listing slugs; keep product + knowledge paths dynamic via route split.
2. **Phase B:** Add cache tags + `revalidatePath` hooks on product publish, `vehicle_seo_content` admin saves, and category catalog changes.
3. **Phase C (UX):** Optionally SSR a minimal product list snapshot — bigger gain than page ISR for filter picks (~150 ms categories API).

**Do not** enable full ISR on the current monolithic `app/[slug]/page.js` without splitting entity kinds.

**Do not** revert year-range-links optimization — it removed the original 2 s bottleneck regardless of ISR.

---

## Inventory scale (ISR planning)

| Dataset | Approx. size |
|---------|----------------|
| Year-range BMY rows | 106 |
| Year-range CBMY rows | 651 |
| Product category catalog | ~1 MB / all rows |
| Marketplace sitemap | Multi-part index (`sitemap-products`, `marketplace-core`, `marketplace-location`) |

Full static generation of all combinations is **impractical**; use **on-demand ISR** with `dynamicParams: true` and 30–60 min `revalidate`.

---

## Methodology

| Signal | Method |
|--------|--------|
| Code inventory | Static trace of `page.js` → `resolveSeoEntity` → loaders |
| HTML TTFB | `curl` warm/cold after `pm2 restart otofine-frontend` |
| User-visible | Playwright headless (filter script + direct `goto`) |
| API latency | `curl` / Node `fetch` to backend |
| Listing cascade | Parallel `curl` simulation |

**No code changes made.**
