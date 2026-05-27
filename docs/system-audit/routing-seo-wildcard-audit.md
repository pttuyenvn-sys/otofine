# Otofine — Routing, SEO & Wildcard Infrastructure Audit

> **Phase:** Structural Observation Only  
> **Date:** 2026-05-26  
> **Scope:** Read-only. No refactor suggestions. No fixes proposed. Reflects current production architecture as-is.  
> **Sources:** Verbatim file reads of 60+ source files across frontend and backend.

---

## Table of Contents

1. [Wildcard Storefront Request Flow](#1-wildcard-storefront-request-flow)
   - [Request Lifecycle Overview](#11-request-lifecycle-overview)
   - [Middleware Execution Order](#12-middleware-execution-order)
   - [Hostname Parsing & Classification](#13-hostname-parsing--classification)
   - [Shop Resolution](#14-shop-resolution)
   - [Route Resolution & Rewrite Map](#15-route-resolution--rewrite-map)
   - [Storefront Rendering Path](#16-storefront-rendering-path)
2. [Canonical SEO Flow](#2-canonical-seo-flow)
   - [Product Slug Generation](#21-product-slug-generation)
   - [Canonical URL Contract](#22-canonical-url-contract)
   - [Redirect Chain](#23-redirect-chain)
   - [Metadata Generation](#24-metadata-generation)
   - [Sitemap Generation](#25-sitemap-generation)
   - [Robots Configuration](#26-robots-configuration)
   - [Vehicle & Category SEO Flows](#27-vehicle--category-seo-flows)
   - [Backend SEO Composers](#28-backend-seo-composers)
   - [Retired SEO Routes](#29-retired-seo-routes)
3. [Storefront Rendering Dependencies](#3-storefront-rendering-dependencies)
   - [Shop Homepage](#31-shop-homepage-apexslugpage--subdomainpage)
   - [Products Tab](#32-products-tab-san-pham)
   - [About Tab](#33-about-tab-gioi-thieu)
   - [Contact Tab](#34-contact-tab-lien-he)
   - [Shop Directory](#35-shop-directory-shops)
   - [Analytics Chain](#36-analytics-chain)
   - [Owner Strip](#37-owner-strip)
   - [RFQ Entry Point](#38-rfq-entry-point-from-storefront)
4. [Routing-Critical Files](#4-routing-critical-files)
5. [SEO-Critical Files](#5-seo-critical-files)
6. [Single-Point-of-Failure Modules](#6-single-point-of-failure-modules)
7. [Dangerous Coupling in Storefront Rendering](#7-dangerous-coupling-in-storefront-rendering)

---

## 1. Wildcard Storefront Request Flow

### 1.1 Request Lifecycle Overview

```
Browser → DNS (*.otofine.com wildcard) → Nginx → Next.js (port 3000)
                                                        │
                                              middleware.js (Edge)
                                                        │
                                          ┌─────────────┴──────────────┐
                                     Subdomain?                    Apex domain?
                                          │                             │
                                  Rewrite to                      Pass through
                               /shops/<slug>/...               (normal routing)
                                          │
                                   App Router
                                 (shopsite) group
                                          │
                                 SSR fetches shop data
                              via shopPublic.service.js
                                          │
                                   Render storefront
```

**Feature flag:** The entire subdomain rewrite is gated by `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED`. When `false` or unset, `middleware.js` is a no-op for all subdomain logic. The legacy `/product` → `/` redirect still runs regardless of the flag.

**Staged rollout:** An additional per-slug allowlist `PUBLIC_SHOPSITE_ALLOWED_SLUGS` controls which specific shops receive the subdomain treatment. Slugs not on the allowlist fall through to apex routing silently (no 404 — apex `/shops/<slug>` still works).

### 1.2 Middleware Execution Order

`frontend/middleware.js` — 158 lines — runs on every non-asset request.

**Execution sequence:**

```
1. Check pathname === "/product" || "/product/"
   → If yes: redirect to "/"   (unconditional, runs before flag check)

2. Check SHOPSITE_SUBDOMAIN_FLAG
   → If false: NextResponse.next()

3. Read Host header

4. classifyHost(host)
   → Emits structured edge log for any non-SHOP decision

5. resolveShopRewrite({ host, pathname, flagEnabled: true })
   → Returns null (pass through) or { slug, internalPath, blocked? }

6. If decision.blocked === "not-allowlisted":
   → Log middleware.allowlist-skip
   → NextResponse.next() (falls to apex routing)

7. Else (valid shop subdomain):
   → Clone request.nextUrl
   → url.pathname = decision.internalPath
   → NextResponse.rewrite(url)
   → Set response header: x-otofine-shop-slug = decision.slug
```

**Matcher pattern:**
```
/((?!_next/|api/|favicon\.ico|robots\.txt|sitemap\.xml|images/|uploads/|assets/|.*\.(png|jpg|jpeg|gif|webp|svg|ico|js|css|map|woff|woff2|ttf|json)$).*)
```
Excludes: `_next`, `api`, favicon, robots, sitemap, static file extensions.

> Note: The matcher excludes `api/` — meaning `middleware.js` does NOT intercept API calls from subdomain pages. API calls from subdomains go through `next.config.mjs`'s `/api/*` rewrite rule instead.

### 1.3 Hostname Parsing & Classification

Two files jointly define the host classification logic:

**`frontend/lib/shopHost.js`** (273 lines) — pure, edge-safe, no DB/filesystem access.

Key constants:

| Constant | Contents |
|---|---|
| `ROOT_HOSTS` | `otofine.com`, `www.otofine.com`, `localhost`, `.localhost`, `.vercel.app`, `*.ngrok.*` |
| `RESERVED_SUBDOMAINS` | `www`, `api`, `admin`, `shop`, `rfq`, `mail`, `smtp`, `ftp`, `dev`, `staging`, `test`, `next`, `preview`, `cdn`, `assets`, `static`, `img`, `media`, `support`, `help`, `docs`, `blog`, `status`, `app`, `mobile`, `m` |
| `SUBDOMAIN_SLUG_REGEX` | `/^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$/` |
| `SHOP_REWRITE_PATHS` | `/`, `/san-pham`, `/gioi-thieu`, `/lien-he` |

`HOST_DECISIONS` enum:
- `SHOP_SUBDOMAIN` — valid shop slug
- `RESERVED_SUBDOMAIN` — matches reserved list
- `INVALID_SUBDOMAIN` — fails regex
- `MULTI_LEVEL` — 3+ label host
- `HOST_TOO_LONG` — > 253 chars
- `HOST_INVALID_CHARS` — fails basic charset
- `APEX` — matches ROOT_HOSTS
- `PASS_THROUGH` — other

Key exports:
- `classifyHost(host)` → `{ decision, slug? }`
- `extractShopSubdomain(host)` → slug string or `null`
- `resolveShopRewrite({ host, pathname, flagEnabled })` → rewrite descriptor or `null`
- `isShopSubdomainHost(host, slug)` → boolean
- `getShopAllowlist()` → Set from `PUBLIC_SHOPSITE_ALLOWED_SLUGS`

**`frontend/lib/shopsite/isWildcardStorefrontHost.js`** (39 lines) — server-only (uses `next/headers`).

```
async isWildcardStorefrontHost()
  → reads Host header via next/headers
  → calls extractShopSubdomain(host)
  → returns true iff result is non-empty string
```

Used in `app/(shopsite)/shops/[slug]/page.js` to hide marketplace cross-discovery widgets (`RelatedShops`) when rendering on a subdomain.

**Drift warning:** `RESERVED_SUBDOMAINS` in `shopHost.js` includes labels (`next`, `preview`, etc.) not present in the backend's `RESERVED_SHOP_SLUGS` in `domains/shopPublic/config/publicShop.config.js`. Both files contain comments noting they should stay in sync.

### 1.4 Shop Resolution

After the middleware rewrites the pathname, shop data is resolved server-side in `app/(shopsite)/shops/[slug]/layout.js`.

**Resolution chain:**

```
layout.js (Server Component)
  → await fetchPublicShop(slug)           ← services/shopPublic.service.js
     → GET {API_BASE}/public/shops/{slug} ← next.config.mjs rewrites to backend
        → publicShop.routes.js            ← backend Express router
           → responseCache middleware      ← in-memory GET cache, tagged shop:<slug>
           → publicApiRateLimit middleware
           → shopPublic.controller.js → DB query
              → returns shop DTO

  → if shop === null: notFound()          ← hard 404, no fallback
```

**`services/shopPublic.service.js`** — server-only Next.js fetch wrapper.

- Base fetch TTL: `revalidate: 60` seconds
- `fetchPublicShop` — **no safe wrapper** — 404 → `null`, non-200 → throws (intentional: forces `notFound()` if DB is down)
- All secondary fetches (products, categories, fitments, contact) have `*Safe` variants that catch errors and return empty sentinels
- `getShopBasePath(slug)` — server-only — returns `""` on subdomain, `/shops/<slug>` on apex. Used so all in-shop nav links stay sticky on the current host.
- `getShopCanonicalUrl(slug, subPath)` — server-only — on subdomain: canonical points to subdomain; on apex: canonical points to `https://otofine.com/shops/<slug>/...`

**Backend response cache** (`domains/shopPublic/middlewares/responseCache.middleware.js`):
- In-memory cache, keyed by `originalUrl`
- Tagged `shop:<slug>` for targeted invalidation
- GET-only, caches 2xx JSON only
- Sets `X-Cache: HIT` or `X-Cache: MISS` response header

### 1.5 Route Resolution & Rewrite Map

**Subdomain → internal path mapping** (handled by `resolveShopRewrite` in `shopHost.js`):

| Browser URL (subdomain) | Internal Next.js path |
|---|---|
| `{slug}.otofine.com/` | `/shops/{slug}` |
| `{slug}.otofine.com/san-pham` | `/shops/{slug}/san-pham` |
| `{slug}.otofine.com/gioi-thieu` | `/shops/{slug}/gioi-thieu` |
| `{slug}.otofine.com/lien-he` | `/shops/{slug}/lien-he` |
| All other paths | Pass through (no rewrite) |

**Rewrite type:** `NextResponse.rewrite` — browser URL stays on subdomain. Not a redirect.

**`next.config.mjs`** API proxy rewrite:
```
/api/:path* → {backendOrigin}/api/:path*
```
Backend origin resolved from `API_INTERNAL_ORIGIN` → `API_PROXY_TARGET` → `http://127.0.0.1:5000`.

**Image optimization remote patterns:**
- `https://img.otofine.com` — CDN
- `https://*.r2.dev` — Cloudflare R2

### 1.6 Storefront Rendering Path

```
Next.js App Router (shopsite) group

app/(shopsite)/layout.js               ← Outer shell: gray bg, max-w-screen-xl
  └── app/(shopsite)/shops/[slug]/layout.js   ← Per-shop tenant layout (201 lines)
        │
        ├── fetchPublicShop(slug)       ← Must succeed or notFound()
        ├── generateMetadata()          ← buildShopMetadata()
        ├── ShopHeader                  ← Mapped from shop DTO via mapToHeaderShape()
        ├── ShopTabs                    ← Navigation: home/san-pham/gioi-thieu/lien-he
        ├── ShopJsonLd                  ← buildShopJsonLd() → @graph JSON-LD
        ├── StorefrontOwnerStrip        ← Client island, useStorefrontOwnerState
        ├── StorefrontAnalyticsForwarder← Client island, forwards events to backend
        ├── ShopAnalyticsBoot           ← Client island, fires storefront_view
        └── {children}
              ├── app/(shopsite)/shops/[slug]/page.js       (shop homepage)
              ├── app/(shopsite)/shops/[slug]/san-pham/     (products tab)
              ├── app/(shopsite)/shops/[slug]/gioi-thieu/   (about tab)
              └── app/(shopsite)/shops/[slug]/lien-he/      (contact tab)
```

**Client islands mounted in layout:**

| Component | Trigger | API call |
|---|---|---|
| `ShopAnalyticsBoot` | Mount (once, Strict Mode guarded) | None — emits `shopsite:event` locally |
| `StorefrontAnalyticsForwarder` | `shopsite:event` CustomEvent | `POST /api/storefront-events/track` |
| `StorefrontOwnerStrip` | `useStorefrontOwnerState` detects owner | `GET /api/shop/metrics/overview` |

**SEO indexing gate** (in `buildShopMetadata.js`):
```
robots = noindex,nofollow  (default)
     UNLESS:
       NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED === "1"
       AND shop.seoEligible === true
```
Both conditions must be true simultaneously for a storefront page to be indexed.

---

## 2. Canonical SEO Flow

### 2.1 Product Slug Generation

**Frontend:** `frontend/lib/seo/productSeoUrl.js` (307 lines)

Key functions:

| Function | Input | Output |
|---|---|---|
| `slugifyVi(text, compact?)` | Vietnamese string | URL-safe ASCII slug |
| `buildProductSeoSlug(product)` | Product object with `name`/`brand`/`model`/`cars`/`partNumber` | `{slug}` string (no id) |
| `buildProductSeoUrl(product)` | Product object | `/{slug}-{id}` or `/p/{id}` fallback |
| `extractProductIdFromSeoSlug(slug)` | `/{slug}-{id}` string | numeric id |
| `looksLikeProductSlug(slug)` | URL slug string | boolean discriminator |

The discriminator `looksLikeProductSlug` is the fast-path guard in `app/[slug]/page.js` that determines whether the apex route slug is a product or a SEO landing page, without an API call.

**Backend:** `backend/utils/productSlug.js` (45 lines)

| Function | Output |
|---|---|
| `buildSeoProductSlug(product)` | `{base}-{id}` |
| `legacySlugForId(id)` | `sp-{id}` (for sitemap legacy shape) |

> Both frontend and backend independently implement `slugifyVi`. They are separate implementations. Any divergence in slug generation between the two would produce a redirect loop on the canonical enforcement check in `app/[slug]/page.js`.

### 2.2 Canonical URL Contract

| URL Pattern | Role | Status |
|---|---|---|
| `/{slug}-{id}` | **Root canonical** — indexed, authoritative | ✅ Active |
| `/p/{id}` | Short product URL | ✅ Active — 308 to canonical |
| `/product/{id}` | Legacy product URL | ✅ Active — 308 to canonical |
| `/phu-tung/{slug}-{id}` | Legacy part URL | ✅ Active — 308 to canonical |

**Product links from storefront subdomains:** `lib/apexOrigin.js` (60 lines) resolves the apex origin (`NEXT_PUBLIC_APEX_URL` → `NEXT_PUBLIC_SITE_URL` → `https://otofine.com`) and exposes `apexProductUrl(productOrId)`. When a full product object is available, it calls `buildProductSeoUrl` directly to emit `/{slug}-{id}` on the apex domain, saving one redirect hop.

**Site URL resolution:** `lib/seo/siteUrl.js` (21 lines) — `getSiteUrl()` from `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `https://otofine.com`. Used by sitemap and metadata generators.

### 2.3 Redirect Chain

**Full redirect map:**

```
/product/{id}            → 308 → buildProductSeoUrl(product)  = /{slug}-{id}
/p/{id}                  → 308 → buildProductSeoUrl(product)  = /{slug}-{id}
                                  (loop guard: stays /p/{id} if builder returns /p/{id})
/phu-tung/{slug}-{id}    → 308 → /{slug}-{id}                 (one hop, direct)
/{slug}-{id} (stale slug)→ 308 → /{newSlug}-{id}              (canonical enforcement)
```

**Canonical enforcement** in `app/[slug]/page.js`:
```
canonicalSlug = buildProductSeoSlug({ ...product, cars })
canonicalPath = canonicalSlug ? /${canonicalSlug}-${id} : /p/${id}
requestedPath = /${slug}
if requestedPath !== canonicalPath → permanentRedirect(canonicalPath)
```

This means a product whose slug-generating fields change (name, brand, model) will trigger a 308 on the next visit to the old URL.

### 2.4 Metadata Generation

**`app/[slug]/page.js` — `generateMetadata`:**

Execution order mirrors the page render:
1. `tryRenderProduct(slug)` — if product match: title, description, canonical, OG, `robots: index+follow`
2. `getVehicleSeoPage(slug)` — if vehicle SEO: custom title, custom intro, canonical to apex slug
3. Neither match: returns `{}` (empty metadata)

**`app/(shopsite)/shops/[slug]/layout.js` — `generateMetadata`:**
→ `buildShopMetadata(shop, { subPath, canonical })`

**`lib/shopsite/buildShopMetadata.js`** (169 lines):
- Title: `{shop.name} — {tagline}` with fallback patterns
- Description: from `shop.description` or generated stub
- Canonical: from `getShopCanonicalUrl` (subdomain or apex depending on current host)
- OG image: first gallery image or logo fallback
- `robots`: `noindex,nofollow` by default; `index,follow` only when `NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED === "1"` AND `shop.seoEligible === true`
- Twitter card: `summary_large_image`

**`lib/shopsite/buildShopJsonLd.js`** (181 lines):
- `@graph` array with `AutoPartsStore`, `LocalBusiness`, `Organization`
- Parses `shop.address` → `PostalAddress`
- Parses `shop.openingHours` → `OpeningHoursSpecification`
- Parses `shop.social` → `sameAs` array

### 2.5 Sitemap Generation

**`app/sitemap.js`** (96 lines) — Next.js `MetadataRoute.Sitemap`:

| Entry type | URL format | Source | Priority |
|---|---|---|---|
| Homepage | `{base}/` | Static | 1.0 |
| Part base | `{base}/phu-tung-o-to` | Static (`SEO_BASE_SLUG`) | 0.95 |
| Products | `{base}/p/{id}` | `GET /api/seo/sitemap-data` | 0.75 |
| Vehicle brand+model | `{base}/{brand}-{model}-o-to` | `buildVehicleSlug` | 0.80 |
| Vehicle brand only | `{base}/{brand}-o-to` | `buildVehicleSlug` | 0.78 |
| Category | `{base}/{name}-o-to` | `categoryLandingSlugFromName` | 0.65 |

> **Observation:** Sitemap lists products as `/p/{id}` (short URL), not the canonical `/{slug}-{id}`. Crawlers following these URLs receive a 308 redirect to the canonical. This is one extra hop for sitemap-discovered product URLs.

> **Observation:** `lib/shopsite/shopSitemapBuilder.js` exists and is fully implemented but is **explicitly not imported** from `app/sitemap.js`. Its comment states it is "PREPARED but NOT exposed" pending Phase 5.6+ wildcard DNS + indexing enablement. Storefront pages are currently absent from the sitemap.

Sitemap data fetch: `GET {API_BASE}/seo/sitemap-data` — 24-hour revalidate.

### 2.6 Robots Configuration

**`app/robots.js`** (38 lines):

```
Allow:    /
          /phu-tung-
Disallow: /xe/
          /rfq/
          /product/
          /shop/
          /admin/
          /api/
          /search/
          /*?q=*
          /*?pagenumber=*
          /*?*        ← blocks ALL query string URLs
Sitemap:  {getSiteUrl()}/sitemap.xml
```

> **Observation:** `/*?*` disallows all query string URLs. This includes filtered product listing URLs. Storefront filter URLs (`/shops/{slug}/san-pham?category=...`) would be disallowed on apex. On subdomains, storefront pages are currently noindex regardless.

### 2.7 Vehicle & Category SEO Flows

**Vehicle SEO request chain:**

```
Browser → /{brand}-{model}-o-to (or brand/year variants)
  → app/[slug]/page.js
     → looksLikeProductSlug(slug) = false
     → getVehicleSeoPage(slug)
        → GET {API_BASE}/api/vehicle-seo/{slug}
           → vehicleSeo.routes.js → vehicleSeo.service.js
              → parse slug (brand/model/year/location)
              → load car model from DB
              → load vehicle_seo_content
              → load faults, maintenance, specs, related cars
              → top products (Typesense or DB)
              → buildVehicleSeoArticle(data) → articleHtml
              → return full seoPage object
     → render <Home premiumArticle={...} initialVehicleFilter={vehicleSeo} />
```

**`lib/seo/parseLandingSlug.js`** (203 lines):
- Classifies slugs as `vehicle` | `category` | `invalid`
- Vehicle slugs: `phu-tung-o-to[-{brand}[-{model}[-{year}]]]`
- Category slugs: `{anything}-o-to`
- Fetches brand/model allowlists from backend API for validation
- Returns: `{ type, filters, h1, breadcrumb }`

**`lib/seo/homePageTitle.js`** (106 lines) — `classifyListingTier`:

| Tier | Conditions |
|---|---|
| 1 | Part + car + year + city |
| 2 | Part + car + year |
| 3 | Part + car |
| 4 | Part + city |
| 5 | Part only |
| 6 | Car + city |
| 7 | Generic / homepage |

**Category SEO chain:**

```
app/[slug]/page.js → parseLandingSlug → type=category
  → Home with categorySlug filters
     → backend /api/category-seo/{category}
        → categorySeoComposer.js → generateCategorySeoContent()
```

### 2.8 Backend SEO Composers

**`services/seoComposer.js`** (668 lines):
- `composePartArticle(part)` — profile-aware HTML (brake, filter, ignition, etc.) from `part_knowledge` fields
- Target length: ~1100+ words
- `composeIntroHtml(part)` — hero summary paragraph

**`services/seoSlugResolver.service.js`** (407 lines):
- `resolveSeoSlugWithRanking(slug, context)` — scores active `part_knowledge` rows against slug variants/aliases
- Prefix match fast path
- Compares against `seo_routes` table
- Exports `stripOtoSuffix`
- ⚠️ **Known bug (line ~270):** `return empty` — `empty` is not defined in scope. This would throw a `ReferenceError` at runtime on an empty slug input.

**`services/vehicleSeo.service.js`** (222 lines):
- `getVehicleSeoPage(slug)` — full vehicle SEO page assembly
- Loads from `vehicle_seo_content`, car model table, faults, maintenance tables
- Calls `buildVehicleSeoArticle` (in `utils/buildVehicleSeoArticle.js`)

**`services/categorySeoComposer.js`** (420 lines):
- `generateCategorySeoContent(category)` — category-profile templates
- Produces FAQ items, buying guide, technical content, maintenance guide
- Related categories

**`utils/seoRouteVariants.js`** (68 lines):
- `normalizePrimarySlug`, `parseAliasesJson`, `withOTo`, `collectVariantSlugs`
- Aligned with `seedSeoRoutes.js` variant rules

### 2.9 Retired SEO Routes

| Route | File | Current behavior |
|---|---|---|
| `POST /api/seo/refresh` | `app/api/seo/refresh/route.js` | Returns **410 Gone** — "Legacy template SEO file cache refresh is retired." |
| `GET /api/cron/seo-ai-nightly` | `app/api/cron/seo-ai-nightly/route.js` | Returns **410 Gone** — "Legacy nightly SEO AI cron route is retired." |
| `POST /api/seo/registry/upsert` | `app/api/seo/registry/upsert/route.js` | Present, not confirmed retired |
| `GET /api/seo/registry` | `app/api/seo/registry/route.js` | Present, not confirmed retired |
| `POST /api/seo/ai-article/queue` | `app/api/seo/ai-article/queue/route.js` | Present, not confirmed retired |
| `POST /api/seo/ai-article/execute` | `app/api/seo/ai-article/execute/route.js` | Present, not confirmed retired |

> `vercel.json` still references `/api/cron/seo-ai-nightly` as a scheduled cron. That endpoint now returns 410. The cron is effectively dead but still being scheduled.

---

## 3. Storefront Rendering Dependencies

### 3.1 Shop Homepage (`/shops/{slug}/page.js`)

**SSR parallel fetch block:**

```javascript
const [shop, productData, categoryData, fitmentData] = await Promise.all([
  fetchPublicShop(slug),
  fetchPublicShopProductsSafe(slug, productQuery),
  fetchPublicShopCategoriesSafe(slug),
  fetchPublicShopFitmentsSafe(slug),
]);
```

| Fetch | Endpoint | Failure behavior |
|---|---|---|
| `fetchPublicShop` | `GET /public/shops/{slug}` | Throws on non-200; `notFound()` on 404 |
| `fetchPublicShopProductsSafe` | `GET /public/shops/{slug}/products` | Returns `{ items: [], total: 0 }` on error |
| `fetchPublicShopCategoriesSafe` | `GET /public/shops/{slug}/categories` | Returns `{ items: [] }` on error |
| `fetchPublicShopFitmentsSafe` | `GET /public/shops/{slug}/fitments` | Returns `{ brands: [], modelsByBrand: {}, years: [] }` on error |

**Additional server checks:**
- `isWildcardStorefrontHost()` → hides `RelatedShops` on subdomains
- `getShopBasePath(slug)` → determines href prefix for in-shop navigation

**Components rendered:**
- `ShopHeader` (from layout)
- `ShopTabs` (from layout)
- `ShopGallery` (from `storefrontVisuals`)
- `ShopProductGridState` (product cards)
- `ShopMobileFilters` + `ShopFilters`
- `ShopSocialProofPills`
- `ShopTrustBadges`
- `ShopLiveActivityStrip`
- `ShopResponseScoreChip` (from `deriveShopResponseScore`)
- `RelatedShops` (apex only — hidden on subdomain)
- `ShopQuickRfqLauncher` (floating CTA)
- `ShopJsonLd` (from layout)

### 3.2 Products Tab (`san-pham/page.js`)

**SSR fetches:**

```javascript
const [shop, productData, categoryData, fitmentData] = await Promise.all([
  fetchPublicShop(slug),
  fetchPublicShopProductsSafe(slug, query),
  fetchPublicShopCategoriesSafe(slug),
  fetchPublicShopFitmentsSafe(slug),
]);
```

Same fetch pattern as homepage. Products tab is a full SSR page render (not a client-side filter).

**Query parameters passed to backend:** `page`, `perPage`, `category`, `brand`, `model`, `year` (derived from URL search params).

### 3.3 About Tab (`gioi-thieu/page.js`)

**SSR fetches:**

```javascript
const [shop, contactData] = await Promise.all([
  fetchPublicShop(slug),
  fetchPublicShopContactSafe(slug),
]);
```

**Visual dependency:** `buildStorefrontVisuals(shop)` — extracts hero images, gallery images, banner images from shop DTO fields. Falls back to Unsplash placeholder images by category if none present.

**Components:** `ShopGallery`, `ShopIntroClamp`, `ShopContactCard`, `ShopRichContentRenderer`, `ShopTrustBadges`, `ShopWhyChooseUs`.

### 3.4 Contact Tab (`lien-he/page.js`)

**SSR fetches:**

```javascript
const [shop, contactData] = await Promise.all([
  fetchPublicShop(slug),
  fetchPublicShopContactSafe(slug),
]);
```

**Components:** `ShopContactCard`, `ShopMapVisualBlock`, `ShopSocialButtons`, `ShopFloatingMobileCTA`.

### 3.5 Shop Directory (`/shops/page.js`)

**Route config:** `force-dynamic` (no static generation).

**SSR fetches:**

```javascript
const [directoryData, provinces, brands] = await Promise.all([
  fetchPublicShopDirectorySafe(queryParams),
  fetchPublicShopProvincesSafe(),
  fetchPublicShopBrandsSafe(),
]);
```

| Fetch | Endpoint | Failure |
|---|---|---|
| `fetchPublicShopDirectorySafe` | `GET /public/shops` | Returns empty page |
| `fetchPublicShopProvincesSafe` | `GET /public/shops/_facets/provinces` | Returns `{ items: [] }` |
| `fetchPublicShopBrandsSafe` | `GET /public/shops/_facets/brands` | Returns `{ items: [] }` |

**SEO:** Canonical fixed to `/shops` with no query string (filters are search params not path segments). `ItemList` JSON-LD schema.

### 3.6 Analytics Chain

```
ShopAnalyticsBoot (client)
  → fires trackShopsiteEvent("storefront_view", { shopSlug })
     → shopsiteAnalytics.js: window.dispatchEvent("shopsite:event", detail)
        → StorefrontAnalyticsForwarder (client, listener)
           → POST /api/storefront-events/track
              → next.config.mjs rewrites to backend
              → storefrontEvents.routes.js → storefrontEvents.controller.js
                 → validate: slug, type, IP rate limit
                 → INSERT event row
                 → always responds 204

Any user interaction (phone_click, zalo_click, rfq_cta_click, etc.)
  → withTrack() wrapper in component
  → trackShopsiteEvent(type, { shopSlug, ... })
  → same chain as above
```

**`StorefrontAnalyticsForwarder`** (126 lines):
- Listens for `shopsite:event` CustomEvent on `window`
- Forwards to `POST /api/storefront-events/track`
- No blocking — fire and forget
- Includes shop slug from component prop, not re-derived from host

**`ShopAnalyticsBoot`** (28 lines):
- Fires exactly once per mount (React Strict Mode guard: uses `useRef` fired flag)
- No polling, no subsequent events from this component

**`storefrontEvents.controller.js`** (144 lines):
- Validates: `slug` present, `type` in allowlist
- Rate limits per IP (in-memory)
- `INSERT` event row
- Always responds `204 No Content`

### 3.7 Owner Strip

```
app/(shopsite)/shops/[slug]/layout.js
  → <StorefrontOwnerStrip shopId={shop.id} shopSlug={slug} />

StorefrontOwnerStrip (client island)
  → useStorefrontOwnerState(shopId)
     → reads JWT from cookie via sellerOwnerCookie.js
     → decodes JWT (jwt-decode, no verify)
     → compares decoded.shopId === shopId
     → returns { isOwner, shop }
  → if isOwner: fetch GET /api/shop/metrics/overview
     → renders today's views, inquiry count, product count
  → renders "Manage storefront" shortcut → seller center
```

**`useStorefrontOwnerState.js`** (102 lines):
- Purely client-side JWT decode (no signature verification)
- If cookie is absent or decode fails: `isOwner = false`
- Gated on `typeof window !== "undefined"`

### 3.8 RFQ Entry Point from Storefront

```
ShopQuickRfqLauncher (client, shopsite page)
  → renders floating "Yêu cầu báo giá" button
  → listens for "shopsite:openQuickRfq" CustomEvent
  → dynamically imports ShopQuickRfqModal on first open

ShopQuickRfqModal (lazy-loaded client)
  → buyer fills form (part name, vehicle, phone)
  → POST /api/rfq/create
     → next.config.mjs rewrites to backend RFQ module
     → router.navigate to /rfq/success (with rfqId)
```

> **Observation:** `ShopQuickRfqModal` does NOT use the `storefront-events` analytics pipeline. It calls the RFQ API directly. The `rfq_cta_click` event (defined in `ShopsiteEvents`) is tracked via `trackShopsiteEvent` in the launcher button click handler, but the actual submission is a separate direct POST to `/api/rfq/create`.

---

## 4. Routing-Critical Files

These files directly control how requests are routed. A failure or misconfiguration in any of these affects all traffic in the relevant path.

| File | Lines | Scope | Risk |
|---|---|---|---|
| `frontend/middleware.js` | 158 | **All requests** to Next.js | CRITICAL — single entry point for subdomain routing; failure affects all storefronts |
| `frontend/lib/shopHost.js` | 273 | Subdomain classification logic | CRITICAL — all routing decisions for wildcard subdomains derived here |
| `frontend/next.config.mjs` | 55 | All API calls + image optimization | HIGH — `/api/*` rewrite misconfiguration breaks all data fetching |
| `frontend/app/[slug]/page.js` | 231 | All apex dynamic routes | HIGH — handles product detail, vehicle SEO, category SEO, and unknown slugs |
| `frontend/app/(shopsite)/shops/[slug]/layout.js` | 201 | All shop page renders | HIGH — `notFound()` if shop fetch fails |
| `frontend/lib/seo/productSeoUrl.js` | 307 | Product canonical URL contract | HIGH — any change breaks the redirect chain |
| `frontend/services/shopPublic.service.js` | 248 | All storefront SSR data | HIGH — `fetchPublicShop` failure = storefront 404 |
| `backend/routes/publicShop.routes.js` | 116 | All storefront API traffic | HIGH — feature flag guard at route level |
| `backend/domains/shopPublic/index.js` | 87 | Backend shopPublic domain barrel | MEDIUM — all shopPublic exports pass through here |
| `backend/server.js` | — | All backend routing | CRITICAL — mounts all Express routes |

---

## 5. SEO-Critical Files

These files control indexed content, canonical signals, and structured data.

| File | Lines | Scope |
|---|---|---|
| `frontend/lib/seo/productSeoUrl.js` | 307 | Product canonical URL generation — foundation of all product SEO |
| `frontend/lib/seo/parseLandingSlug.js` | 203 | Apex slug classification — determines if slug is vehicle, category, or invalid |
| `frontend/app/sitemap.js` | 96 | Global sitemap — what Googlebot discovers |
| `frontend/app/robots.js` | 38 | Crawl budget and indexing rules |
| `frontend/app/[slug]/page.js` | 231 | Canonical enforcement + metadata for all product/vehicle/category pages |
| `frontend/lib/shopsite/buildShopMetadata.js` | 169 | All storefront page metadata + robots gate |
| `frontend/lib/shopsite/buildShopJsonLd.js` | 181 | JSON-LD for all storefronts |
| `frontend/lib/shopsite/shopSitemapBuilder.js` | 71 | Storefront sitemap — **DORMANT, not yet wired** |
| `frontend/lib/seo/siteUrl.js` | 21 | Canonical origin for all absolute URLs |
| `backend/services/seoComposer.js` | 668 | Part article HTML generation |
| `backend/services/seoSlugResolver.service.js` | 407 | Slug → SEO page matching — **contains known `ReferenceError` bug** |
| `backend/services/vehicleSeo.service.js` | 222 | Vehicle SEO page assembly |
| `backend/services/categorySeoComposer.js` | 420 | Category SEO content generation |
| `backend/utils/seoRouteVariants.js` | 68 | Slug variant collection for `seo_routes` |
| `backend/utils/productSlug.js` | 45 | Backend product slug builder |

---

## 6. Single-Point-of-Failure Modules

Modules whose failure or misconfiguration has outsized cascading effects:

### F1. `frontend/middleware.js` — Subdomain Entry Point
All wildcard subdomain traffic passes through this single file. The flag `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED` being misconfigured (`false` → all storefronts become inaccessible via subdomain). There is no fallback routing if the middleware throws.

### F2. `frontend/lib/shopHost.js` — Host Classification Logic
Imported exclusively by `middleware.js` and `isWildcardStorefrontHost.js`. Every subdomain routing decision is derived here. `RESERVED_SUBDOMAINS` list governs which subdomains never receive shop rewrites. Changes to this list (e.g., adding a new infrastructure subdomain) must be coordinated with the backend `RESERVED_SHOP_SLUGS` list.

### F3. `frontend/services/shopPublic.service.js` — Storefront Data Layer
`fetchPublicShop` (no safe wrapper) is the hard dependency for every storefront page render. Backend downtime on `/public/shops/{slug}` → `notFound()` on all storefront routes. The `revalidate: 60` means a backend recovery propagates within 60 seconds, but during downtime all shop pages serve 404.

### F4. `backend/domains/shopPublic/middlewares/responseCache.middleware.js` — In-Memory Cache
In-memory response cache with no persistence. A backend process restart flushes the entire cache. Cache is per-process — in a multi-process deployment, each PM2 worker has its own cache island. Cache is applied per `originalUrl` including query strings.

### F5. `frontend/lib/seo/productSeoUrl.js` — Canonical URL Contract
`buildProductSeoUrl` and `buildProductSeoSlug` define the canonical URL shape for all products. Any change to slugification output creates stale canonical URLs across the entire product catalogue. The canonical enforcement redirect in `app/[slug]/page.js` would trigger for every product on the next visit.

### F6. `frontend/app/sitemap.js` — Crawl Discovery
Products are listed as `/p/{id}` (not canonical). The backend endpoint `GET /api/seo/sitemap-data` is the single source for all product, vehicle, and category sitemap entries. If this endpoint is slow or fails, the sitemap build degrades gracefully to a static set of only home and base slug.

### F7. `backend/services/seoSlugResolver.service.js` — Slug Matching (Known Bug)
`return empty` on line ~270 references `empty` which is not defined. This is a live runtime `ReferenceError` triggered when an empty slug is passed to `resolveSeoSlugWithRanking`. The exact call sites for this code path are not determined at structure-audit level.

---

## 7. Dangerous Coupling in Storefront Rendering

### C1. Subdomain Rewrite Bypasses `notFound()` on Unknown Shops

When `middleware.js` rewrites `{slug}.otofine.com/` to `/shops/{slug}`, the middleware does not verify the shop exists. Shop existence is only checked in `layout.js` via `fetchPublicShop`. This means:
- DNS + rewrite succeed for any non-reserved slug
- The 404 is deferred to SSR (adds one full SSR render cycle before notFound)
- During the 60-second revalidate window after a shop is deleted, the cache serves the old shop data

### C2. `shopHost.js` ↔ `publicShop.config.js` Reservation Drift

`RESERVED_SUBDOMAINS` (frontend, 25+ labels) and `RESERVED_SHOP_SLUGS` (backend, fewer labels) define the same concept independently. A subdomain that is reserved in the frontend but not in the backend would:
- Be correctly rejected at the middleware layer (no rewrite)
- But could still be registered as a shop slug in the DB via the seller center slug-picker
- The mismatch is documented in comments in both files

### C3. `getShopCanonicalUrl` Dual Canonical Surface

`services/shopPublic.service.js:getShopCanonicalUrl` emits different canonical URLs depending on the current request host:
- Subdomain request → canonical = `{slug}.otofine.com/san-pham`
- Apex request → canonical = `https://otofine.com/shops/{slug}/san-pham`

Two separate canonical URLs point to the same content. Currently gated by `noindex` (no active indexing), but once indexing is enabled this creates a duplicate canonical surface unless exactly one is consistently returned.

### C4. `buildShopMetadata` Indexing Gate Has Two Independent Conditions

```
NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED === "1"   (env flag — process-wide)
AND
shop.seoEligible === true                    (per-shop DB field)
```

If the env flag is deployed `true` globally, all shops with `seoEligible=true` become indexed simultaneously. There is no per-shop staged rollout below this — the only granularity below the env flag is `seoEligible` on the shop record.

### C5. `StorefrontAnalyticsForwarder` Derives Shop Slug from Props, Not Host

`StorefrontAnalyticsForwarder` receives `shopSlug` as a prop from the layout. This is the slug from the DB, not from the subdomain host. On a subdomain, the subdomain slug and the DB slug should be identical, but any mismatch (e.g., redirected slug after a shop changes its slug) would cause analytics events to be attributed to the old/wrong slug silently.

### C6. `ShopQuickRfqModal` Submits to RFQ API Without Storefront Context

`ShopQuickRfqModal` calls `POST /api/rfq/create` directly. The shop slug is passed as a form field, not a route parameter. The modal does not inherit any of the storefront's current filter state (selected vehicle, category) as pre-fill context. The RFQ submission is decoupled from the storefront session.

### C7. Owner Strip JWT Decode Is Client-Side Only (No Verification)

`useStorefrontOwnerState.js` decodes the JWT from a cookie using `jwt-decode` — which does NOT verify the JWT signature. A malformed or expired token is silently treated as `isOwner=false`. A crafted token could trigger `isOwner=true` client-side, causing the owner strip UI to render, but the subsequent API call to `/api/shop/metrics/overview` is backend-auth-guarded (requires valid JWT in `Authorization` header), so data exposure is contained. The UI strip is the only consequence.

### C8. `shopSitemapBuilder.js` Is Dormant but Imported

`lib/shopsite/shopSitemapBuilder.js` is fully implemented but explicitly not imported from `app/sitemap.js`. Once wired, it would add shop URLs to the global sitemap. This is a deferred activation — the current sitemap does not include any storefront URLs. Any accidental import of this module into `sitemap.js` would immediately expose all `seoEligible` shop URLs to crawlers.

### C9. `resolveShopRewrite` Returns Path Only for 4 Fixed Segments

`SHOP_REWRITE_PATHS` in `shopHost.js` is a closed set: `/`, `/san-pham`, `/gioi-thieu`, `/lien-he`. Any new storefront route segment added to `app/(shopsite)/shops/[slug]/` must also be added to this set, or subdomain visitors will receive the pass-through behaviour (content may be served from apex routing or a different handler) rather than the storefront layout.
