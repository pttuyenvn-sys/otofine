# Phase 7.1 — Shop Discovery System

**Status:** shipped, smoke-tested.
**Commit:** `feat(shop-discovery): add supplier discovery and ranking foundation`

This phase turns the shopsite from "you already know the slug" into
a discoverable supplier network. Three new public surfaces, one
reusable ranking model, and one analytics taxonomy — all additive,
all behind the existing rate limiter + response cache.

---

## 0. Guarantees

| Concern                                       | Outcome                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Apex product SEO authority                    | **Unchanged** — `/product/[id]` canonical + `index,follow` preserved.                    |
| Existing public API contract                  | **Unchanged** — old endpoints respond identically; new endpoints are additive.            |
| Middleware / nginx / wildcard                 | **Not touched**.                                                                          |
| RFQ / auth / admin                            | **Not touched**.                                                                          |
| R2 pipeline                                   | **Not touched**.                                                                          |
| Storefront `noindex,nofollow`                 | **Unchanged** — `/shops/[slug]` storefronts still noindex.                                |
| Bundle size                                   | Directory JS 3.96 kB (filters island only); storefront +0 kB (RelatedShops is server).    |
| Cache stack                                   | Reuses LRU response cache + per-IP rate limiter (tiers: `list` / `query` / `read`).      |
| SEO duplicate-canonical risk                  | Eliminated — every filter variant of `/shops?…` canonicalises to `/shops`.                |

---

## 1. Discovery architecture

```
                    ┌───────────────────────────────────────────────┐
                    │  /api/public/shops                            │
                    │                                               │
                    │  GET /                          (list)        │
                    │  GET /_facets/provinces         (query)       │
                    │  GET /_facets/brands            (query)       │
                    │  GET /:slug              (read, existing)     │
                    │  GET /:slug/products     (list, existing)     │
                    │  GET /:slug/categories   (query, existing)    │
                    │  GET /:slug/fitments     (query, existing)    │
                    │  GET /:slug/contact      (read, existing)     │
                    │  GET /:slug/related             (read)  NEW   │
                    └───────────────────────────────────────────────┘
                                       │
                                       ▼
            ┌──────────────────────────────────────────────────┐
            │  shopDirectory.repository                        │
            │    listPublicShopsForDirectory(filters)          │
            │    countPublicShopsForDirectory(filters)         │
            │    listPublicShopProvinces()                     │
            │    listPublicShopBrands()                        │
            │    listRelatedShops({ shopId, limit })           │
            └──────────────────────────────────────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────┐
                       │  shopDirectory.service          │
                       │  ── enriches rows               │
                       │  ── applies rankShop()          │
                       │  ── projects to ShopCard DTO    │
                       └─────────────────────────────────┘

                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
  ┌────────────────────┐                              ┌────────────────────────┐
  │  /shops (apex SSR) │                              │  /shops/[slug] + bottom │
  │  ShopDirectory…    │                              │  <RelatedShops />       │
  │  + ShopCard grid   │                              │  + ShopCard grid        │
  └────────────────────┘                              └────────────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────┐
                       │ shopsiteAnalytics events:       │
                       │   storefront_impression         │
                       │   shop_card_click               │
                       │   directory_search              │
                       │   directory_filter              │
                       └─────────────────────────────────┘
```

### Files added

```
backend/domains/shopPublic/
  repositories/shopDirectory.repository.js        + 320 lines  (queries + bulk-loaders)
  ranking/shopRanking.js                          + 165 lines  (transparent score + breakdown)
  services/shopDirectory.service.js               + 165 lines  (sanitise → rank → sort → page)
  controllers/shopDirectory.controller.js         + 140 lines  (4 handlers + cache headers)
  index.js                                                modified  (barrel exports)
backend/routes/publicShop.routes.js                       modified  (3 new GET routes; old order preserved)

frontend/components/shopsite/
  ShopCard.jsx                                    + 160 lines  (reusable, impression-tracking optional)
  ShopDirectoryFilters.jsx                        + 220 lines  (URL-state, debounced search)
  RelatedShops.jsx                                +  65 lines  (server component, always renders)
  FeaturedShops.jsx                               +  55 lines  (homepage-ready, server component)
frontend/app/(shopsite)/shops/
  page.js                                         + 230 lines  (SSR directory + ItemList JSON-LD)
  loading.js                                      +  20 lines  (skeleton)
frontend/app/(shopsite)/shops/[slug]/page.js              modified  (mount <RelatedShops/>)
frontend/services/shopPublic.service.js                   modified  (8 new fetch helpers + Safe variants)
frontend/lib/shopsite/shopsiteAnalytics.js                modified  (4 new event types)

audit/shop-discovery-phase7.1.md                  this file
audit/screenshots/phase7.1/*.png                  6 screenshots
```

---

## 2. Ranking model — transparent + deterministic

`backend/domains/shopPublic/ranking/shopRanking.js`. Total weights
sum to **exactly 100**; the file fails loudly if a future signal
forgets to update `MAX_SCORE`.

### Weight table

| Group              | Signal                      | Max | Earned when                                              |
| ------------------ | --------------------------- | --: | -------------------------------------------------------- |
| Trust (35)         | Verified                    |  20 | `verified_at IS NOT NULL`                                |
|                    | Established years           |   5 | `min(years_since(published_at \|\| createdAt), 5)`       |
|                    | Responsive                  |   5 | phone present AND (zalo OR facebook) present             |
|                    | Branding completeness       |   5 | `round((avatar+cover+bio) / 3 * 5)`                      |
| Inventory (30)     | Product count tier          |  15 | `0 / 5 / 8 / 10 / 12 / 15` log-scaled from 0 / 1 / 5 / 20 / 50 / 200 |
|                    | Vehicle brand coverage      |  10 | `min(topBrands.length * 2, 10)`                          |
|                    | Freshness                   |   5 | `updatedAt` within 30 days                               |
| Storefront (20)    | Intro HTML present          |  10 | `intro_html \|\| descriptionHtml` non-empty              |
|                    | Facebook URL                |   5 | `facebook_url` set                                        |
|                    | Working hours               |   5 | `working_hours` set                                       |
| Discovery (15)    | Slug looks human            |   5 | length ≥ 4 AND contains a letter                          |
|                    | Province set                |   5 | `provinceId` is not null                                  |
|                    | Google Maps embed           |   5 | `map_embed_url` set                                       |
| **Total**          |                             | **100** |                                                       |

Each `rankShop()` result returns:

```js
{
  score: 81,             // integer 0..100
  max:   100,
  breakdown: [
    { key: "verified",         label: "Đã xác minh",          points: 20, max: 20 },
    { key: "establishedYears", label: "Hoạt động 5 năm",      points:  5, max:  5 },
    // …13 entries total, sum(points) === score
  ],
}
```

### Observed scores on production-shape rows

| Shape           | Score   |
| --------------- | ------- |
| Empty brand-new | **5**   |
| Mid shop        | **27**  |
| Verified deep   | **96**  |
| Stuffed-but-capped | **100** |

(see `/tmp/p7-rank-test.mjs` for reproducible fixtures.)

### Sort modes

| `sort` value | Behaviour                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------ |
| `rank` (default) | `score DESC, id ASC` — deterministic, never reordered by time-of-day jitter.            |
| `newest`     | `published_at DESC` (fallback `createdAt`), then `id ASC`.                                  |
| `name`       | `name` localeCompare("vi"), then `id ASC`.                                                  |

Tie-breaker is always `id ASC` so the same query at the same minute
always returns the same order — important for cache hit ratio and
for screenshot-diff testing.

---

## 3. Filters + search semantics

`backend/domains/shopPublic/services/shopDirectory.service.js`
sanitises every input before it touches SQL.

| Filter           | Accepted values                                       | SQL effect                                                     |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `q`              | string, max 60 chars                                  | `LIKE %q%` on `name` OR `bio`                                  |
| `brand`          | string, max 60 chars                                  | `EXISTS` join via `products → product_car_applications → car_models.hang_xe` |
| `provinceSlug` (also `province`)| `address.tinh_tp_slug` (lowercase)     | `EXISTS` join `address.id = shops.provinceId`                  |
| `verified`       | `true / 1 / yes` → true                               | `verified_at IS NOT NULL`                                      |
| `tier`           | `any / some / ten / fifty / hundred`                  | `(SELECT COUNT(*) FROM products WHERE shopId=s.id) >= N`       |
| `minProducts`    | integer (alternative to `tier`)                       | same                                                           |
| `sort`           | `rank / newest / name`                                | post-query in JS for the rank case                              |
| `page`           | integer 1..500                                        | slice                                                          |
| `perPage`        | integer 1..48 (default 12)                            | slice                                                          |

Garbage values (e.g. `?sort=evil&verified=lol&tier=hack`) → 200 with
defaults applied. Verified by the smoke matrix in §6.

### Search box UX

- 500 ms debounce on keystrokes, instant commit on Enter or "Tìm".
- URL becomes `?q=…` → SSR re-runs → filtered list comes back.
- Browser back/forward restores the search box value.
- Empty results render a friendly "Không tìm thấy shop phù hợp" state
  with a "Xoá bộ lọc" button → `/shops`.

---

## 4. Related shops

`listRelatedShops({ shopId, limit })` chooses candidates in this order:

1. shops that overlap on the seed shop's top 3 vehicle brands;
2. shops in the same `provinceId`;
3. wide fallback — any other public shop (so the section never goes
   blank on a sparse catalogue).

Each candidate is scored with a tiny relevance number:

```
relevance = (brandOverlapCount * 10) + (sameProvince ? 3 : 0)
```

Sort: `relevance DESC, id ASC`. Slice to `limit` (default 6).

If the catalogue is too small to suggest anything (current state of
production), the storefront's `<RelatedShops>` server component
gracefully renders the "Khám phá thêm shop" fallback that links to
`/shops`. Storefront pages are still `noindex,nofollow`, so this
extra link surface has zero SEO impact.

---

## 5. Analytics taxonomy

`frontend/lib/shopsite/shopsiteAnalytics.js` adds four event types
to the existing bus. All fire as `window.dispatchEvent(new
CustomEvent("shopsite:event", { detail }))`, identical shape to the
Phase 5.1 events; future PostHog/Segment integration just adds a
single `addEventListener` line.

| Event                   | Source                          | Payload                                                          |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `storefront_impression` | `ShopCard` IntersectionObserver | `{ shopSlug, listSource: "directory"\|"related"\|"featured", rank }` |
| `shop_card_click`       | `ShopCard.onClick`              | `{ shopSlug, listSource, rank }`                                  |
| `directory_search`      | `ShopDirectoryFilters` (debounced or Enter) | `{ q, resultCount }`                                  |
| `directory_filter`      | `ShopDirectoryFilters` (facet change) | `{ facet: "brand"\|"province"\|"verified"\|"tier"\|"sort", value }` |

Impression observer is **opt-in** per card via `trackImpression`
prop, so `ShopCard` reuse in places that already track view (e.g.
`ShopAnalyticsBoot` for the storefront itself) doesn't double-count.

The directory page always tracks impressions for grid cards
(`trackImpression`) so we can measure visibility-vs-click conversion.

---

## 6. SEO contract

| URL                                | canonical                       | robots               | JSON-LD                                                       |
| ---------------------------------- | ------------------------------- | -------------------- | ------------------------------------------------------------- |
| `https://otofine.com/shops`        | `https://otofine.com/shops`     | `index, follow`      | `ItemList` with apex shop URLs                                |
| `…/shops?sort=newest` (any filter) | `https://otofine.com/shops`     | `index, follow`      | `ItemList` reflecting current filter                          |
| `…/shops?page=2`                   | `https://otofine.com/shops`     | `index, follow`      | `ItemList` (different items, same canonical)                  |
| `https://otofine.com/shops/<slug>` | (unchanged from Phase 5.5)      | `noindex,nofollow`   | (unchanged)                                                   |
| `https://otofine.com/product/<id>` | (unchanged)                     | `index, follow`      | (unchanged)                                                   |

The single-canonical-for-all-filters rule was a deliberate choice:
filtered variants are query-string permutations of the same content
set, so consolidating SEO authority on `/shops` avoids fragmenting
ranking signal across thousands of `?brand=Toyota&province=ha-noi…`
combinations.

The `ItemList` JSON-LD is rendered in the SSR body (not `<head>`)
and reflects the **current page's visible cards** so the rich result
matches what the user sees.

---

## 7. Cache strategy

| Endpoint                                | Backend LRU TTL                  | `Cache-Control`                                  | Rate-limit tier |
| --------------------------------------- | -------------------------------- | ------------------------------------------------ | --------------- |
| `/api/public/shops`                     | 30 s (`TTL_MS.productsList`)     | `public, s-maxage=60, stale-while-revalidate=300` | `list` (180/min)|
| `/api/public/shops/_facets/provinces`   | 5 min (`TTL_MS.categories`)      | `public, s-maxage=300, stale-while-revalidate=600`| `query` (90/min)|
| `/api/public/shops/_facets/brands`      | 5 min (`TTL_MS.categories`)      | `public, s-maxage=300, stale-while-revalidate=600`| `query` (90/min)|
| `/api/public/shops/:slug/related`       | 5 min (`TTL_MS.categories`)      | `public, s-maxage=300, stale-while-revalidate=600`| `read` (240/min)|

Existing endpoints — `/shops/:slug`, `/products`, `/categories`,
`/fitments`, `/contact` — keep their Phase 5.7 cache headers
verbatim (verified by §8).

The directory's tight 60 s SWR balances "a seller publishes a new
shop and wants it visible today" against "a buyer hammering F5 on
the homepage shouldn't burn DB" — they hit the warm cache.

---

## 8. Test matrix (all currently passing)

### 8.1 New API endpoints

```
200   /api/public/shops
200   /api/public/shops?sort=newest
200   /api/public/shops?brand=Mazda
200   /api/public/shops?verified=true
200   /api/public/shops?q=phu
200   /api/public/shops/_facets/provinces
200   /api/public/shops/_facets/brands
200   /api/public/shops/phutungoto355/related
```

### 8.2 Zero regression on existing API endpoints

```
200   /api/public/shops/phutungoto355
200   /api/public/shops/phutungoto355/products
200   /api/public/shops/phutungoto355/categories
200   /api/public/shops/phutungoto355/fitments
200   /api/public/shops/phutungoto355/contact
404   /api/public/shops/zzznoexist                ← still hardened
```

### 8.3 Zero regression on apex / RFQ / auth

```
200   /
200   /product/2913
200   /shop/login
200   /rfq
```

### 8.4 New frontend pages

```
200   /shops
200   /shops?sort=newest
200   /shops?q=phu
200   /shops/phutungoto355                        ← now includes <RelatedShops/>
200   /shops/phutungoto355/san-pham
```

### 8.5 Filter tolerance (garbage values)

```
200   /shops?brand=NonExistent&sort=evil&verified=lol&tier=hack
```

(All garbage filters fall back to defaults; the page still renders.)

### 8.6 Canonical stability

| URL                                  | canonical                       |
| ------------------------------------ | ------------------------------- |
| `/shops`                             | `https://otofine.com/shops`     |
| `/shops?sort=newest`                 | `https://otofine.com/shops`     |
| `/shops?brand=Mazda`                 | `https://otofine.com/shops`     |
| `/shops?province=ha-noi`             | `https://otofine.com/shops`     |
| `/shops?verified=true&page=2`        | `https://otofine.com/shops`     |

### 8.7 Ranking model unit tests

`/tmp/p7-rank-test.mjs` covers: empty shop (5), mid shop (27),
verified deep (96), max-cap (100), determinism across calls. All
pass; weights sum to 100 exactly.

---

## 9. Screenshots

| File                                                                              | Surface                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------ |
| `audit/screenshots/phase7.1/directory-desktop.png`                                | `/shops` desktop — single shop card, full filters |
| `audit/screenshots/phase7.1/directory-mobile.png`                                 | `/shops` mobile (390px) — stacked filters         |
| `audit/screenshots/phase7.1/directory-filtered-verified.png`                      | `/shops?verified=true&sort=newest` desktop        |
| `audit/screenshots/phase7.1/directory-empty.png`                                  | empty-state "Không tìm thấy shop phù hợp"         |
| `audit/screenshots/phase7.1/storefront-with-related-desktop.png`                  | storefront w/ "Khám phá thêm shop" fallback       |
| `audit/screenshots/phase7.1/storefront-with-related-mobile.png`                   | mobile counterpart                                |

---

## 10. Future recommendation hooks (not implemented)

The architecture is laid out so each of these is additive:

| Future feature                | How it plugs in today                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Personalised "for you" ranking | `rankShop(row, now, { userPrefs })` — third arg pattern already supported via `now` injection.                   |
| ML re-ranker                  | The breakdown array is a feature vector. A future model can consume `breakdown` + click-through events.            |
| Real engagement signals       | Wire `shopsite:event` listener → metrics store → re-feed into the `Engagement` group of `rankShop` (currently absent). |
| Editorial picks               | `FeaturedShops` accepts `params` so a curated slice is one prop change away. Add a `featured_at` column when needed.|
| Sitemap entry                 | `frontend/lib/shopsite/shopSitemapBuilder.js` already exists (Phase 5.5); add the directory page when indexing is enabled. |
| Per-province landing pages    | `/shops?province=<slug>` already renders; promote to `/shops/tinh/<slug>` if SEO needs it.                        |
| Per-brand landing pages       | Same as above with `?brand=`.                                                                                     |
| Subdomain rollout for shops   | Phase 6A allowlist already gates this; no directory changes needed.                                              |

---

## 11. Rollback

| Scope                  | Action                                                              | Apex impact |
| ---------------------- | ------------------------------------------------------------------- | ----------- |
| Single endpoint        | Comment out the `router.get(...)` line in `publicShop.routes.js`; PM2 restart backend. | None |
| Directory page         | Delete `frontend/app/(shopsite)/shops/page.js` (the `[slug]` tree is unaffected); Next rebuild. | None |
| Related shops          | Delete the `<RelatedShops/>` block from `app/(shopsite)/shops/[slug]/page.js`.        | None |
| Whole phase            | `git revert <commit-sha>`; backend + frontend restart.              | None |

Each piece is independent — disabling the directory does NOT
affect the related-shops module on storefronts, and vice versa.
