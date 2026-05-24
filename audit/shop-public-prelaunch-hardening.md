# Shopsite — Pre-Launch Hardening (Phase 5.7)

Goal: prepare the storefront infrastructure for wildcard public rollout
without changing routing, redesigning UI, or touching apex product SEO.

This phase is **additive + stabilization only**. Every change either:

- adds a new file (rate-limit middleware, abuse detector, ShopImage,
  sanitizer regression tests),
- or hardens an existing file with null guards, graceful fallbacks,
  and accessibility attributes — without changing behavior on the
  happy path.

---

## 1. Public API rate limiting

### File

`backend/domains/shopPublic/middlewares/publicApiRateLimit.middleware.js`

### Design

Per-IP, in-memory token bucket with three tiers. The tier names map to
endpoint *types*, not individual routes, so we can keep the cap honest
even when we add more endpoints later.

| Tier  | Cap (req/min/IP) | Routes                                  |
|-------|------------------|-----------------------------------------|
| read  | 240              | `GET /:slug`, `GET /:slug/contact`      |
| list  | 180              | `GET /:slug/products`                   |
| query |  90              | `GET /:slug/categories`, `/:slug/fitments` |

Caps were sized so:

- A real buyer browsing 20 products/page across 5 pages with a couple
  of filter changes consumes <10% of the read tier.
- A scraper hammering fitments (heavy SQL) gets choked off in <90 req.

### Response contract on limit hit

```
HTTP/1.1 429 Too Many Requests
Retry-After: 55
X-RateLimit-Tier: query
Content-Type: application/json; charset=utf-8

{"error":"Quá nhiều yêu cầu. Vui lòng thử lại sau.","retryAfter":55}
```

**Always JSON. Never HTML.** The Express default error pages are
explicitly bypassed.

### Smoke-test result

```
$ for i in $(seq 1 100); do
    curl -s -o /dev/null -w "%{http_code} " \
      "http://127.0.0.1:5000/api/public/shops/phutungoto355/fitments?_=$i"
  done | tr -s ' '
200 200 200 ... (x90) ... 429 429 429 429 429 429 429 429 429 429
```

Exactly 90 OK then 10 429s — limiter behaves correctly with bucket
boundary at the documented cap.

---

## 2. Slug enumeration hardening

### Existing guarantees (preserved)

`backend/domains/shopPublic/controllers/shopPublic.controller.js#notFound`
returns the exact same response for:

- invalid slug (fails `SLUG_REGEX`)
- unknown slug (no row in DB)
- suspended / pending slug (row exists but `public_status != 'public'`)
- reserved slug (`api`, `admin`, etc.)

```
HTTP/1.1 404 Not Found
Content-Type: application/json
{"error":"Shop không tồn tại"}
```

No timing-based oracle: the existence cache stores a `MISS_SENTINEL`
for missing rows on the same TTL window, so cache-hit-vs-miss timing is
identical between "unknown shop" and "known shop served from cache".

### New: 404 scan logging

Every 404 now feeds the abuse detector (see §3). A single IP exceeding
8 `404`s inside a 60s window emits exactly one warn line per 30s
cooldown:

```
[shopsite] event=storefront.bot-suspected reason=404-scan ip=1.2.x.x not_found=8 reqs=8 window_ms=60000 path=/nonexistent-8
```

The cooldown prevents log-flooding from a sustained scan while keeping
the dashboard signal alive.

---

## 3. Bot / scraper detection (observability only)

### File

`backend/domains/shopPublic/observability/abuseDetector.js`

### Signals

| Reason       | Trigger                                                        |
|--------------|----------------------------------------------------------------|
| `ua`         | UA regex matches `curl|wget|python-(urllib\|requests)|scrapy|httpie|node-fetch|axios|headlesschrome|puppeteer|playwright|ahrefs|semrush|...` AND is NOT on the search-engine allow-list (Googlebot, Bingbot, Facebook, Zalo, Twitter, Slack, ...). |
| `404-scan`   | ≥ 8 404s from one IP within 60s.                               |
| `hot-rate`   | ≥ 240 req/min sustained for two consecutive 60s windows.       |

**Logging only — no blocking.** This is intentional for Phase 5.7;
once we have a few weeks of real traffic data we can tune the
thresholds and decide whether to harden into 403s.

### Cooldown

Each `(ip, reason)` tuple emits at most one log line per 30s. A scan
of 1,000 slugs from one IP still produces only a handful of warn
lines, but the abuse-stats counter records every request.

### Snapshot endpoint (dev-only)

```
GET /api/public/shops/debug/cache
{
  "rate_limit": { "window_ms": 60000, "tiers": {…}, "top": [{"tier":"query","ip":"1.2.x.x","count":99,…}] },
  "abuse":      { "tracked_ips": 1, "top": [{"ip":"1.2.x.x","reqs":150,"not_found":12,…}] },
  ...
}
```

Returns 404 in production.

---

## 4. Cache-Control review

### Per-route tuning

| Endpoint                  | Before                                       | After                                          |
|---------------------------|----------------------------------------------|------------------------------------------------|
| `/api/public/shops/:slug` | `public, s-maxage=60, swr=300`               | `public, s-maxage=60,  swr=300`               |
| `…/:slug/products`        | `public, s-maxage=60, swr=300`               | `public, s-maxage=30,  swr=120`                |
| `…/:slug/categories`      | `public, s-maxage=60, swr=300`               | `public, s-maxage=300, swr=600`                |
| `…/:slug/fitments`        | `public, s-maxage=60, swr=300`               | `public, s-maxage=300, swr=600`                |
| `…/:slug/contact`         | `public, s-maxage=60, swr=300`               | `public, s-maxage=300, swr=600`                |

Rationale:

- `products` shortened so a freshly published product surfaces in
  ≤30s on the storefront grid.
- `categories` / `fitments` / `contact` extended — these change by
  weeks, not minutes; the seller's PUT already invalidates the
  in-process LRU on save.
- `shop` left at 60s so toggling public status / changing cover
  propagates within a minute.

`stale-while-revalidate` doubled in each lengthened route so a CDN
can keep serving the previous version while it warms a new one in
the background.

### Other surfaces (not changed)

- **R2 images** — Cloudflare R2 default `Cache-Control` is set per
  bucket policy. Not in this PR.
- **Next.js SSR HTML** — defaults to `private, no-cache, no-store`.
  We leave this alone: page-level `fetch(..., { next: { revalidate:
  60 } })` is the cache layer, and HTML caching at the CDN risks
  serving stale shop-specific markup during the next phase.
- **`/api/public/shops/debug/cache`** — `Cache-Control: no-store`.

---

## 5. Security regression tests

### File

`backend/domains/shopPublic/utils/htmlSanitize.test.js`

24 cases covering:

- Hard XSS (`<script>`, `javascript:`, `on*`, `data:`, http: img, `<style>`, form/input, svg/math)
- Sneaky XSS (mixed case, whitespace-stuffed schemes, encoded events)
- Iframe abuse (arbitrary src, missing src, javascript: src)
- Iframe allow-list (YouTube / TikTok / Facebook plugin)
- Class allow-list (whitelisted `shop-cta--*`, dropped `absolute inset-0`)
- Auto-injection of `rel="noopener noreferrer"` and `loading="lazy"`

```
$ node backend/domains/shopPublic/utils/htmlSanitize.test.js
PASS  strips <script> tag and body
...
Total: 24  passed: 24  failed: 0
```

The runner is bare-bones (no Jest dep tree). Migrate to Vitest when
the broader backend test push happens.

---

## 6. Image resilience

### File

`frontend/components/shopsite/ShopImage.jsx`

Universal storefront image with:

- Graceful fallback when `src` is empty OR `onError` fires; renders the
  branded gradient placeholder instead of the browser's broken-icon.
- `decoding="async"` everywhere.
- `loading="lazy"` by default, `loading="eager"` + `fetchpriority="high"`
  when `priority={true}` (mount on the cover image — the LCP element).
- Detaches `onerror` after the first failure so a flaky URL can't loop.
- Fires `shopsite:event` `image_fallback` on the analytics bus.

Migrated callers:

- `ShopHeader.jsx` — cover + avatar
- `ShopProductCard.jsx` — product image
- `app/(shopsite)/shops/[slug]/gioi-thieu/page.js` — cover

LCP improvement was measurable — see §9.

---

## 7. Error resilience (graceful degradation)

### File

`frontend/services/shopPublic.service.js` — added `*Safe` wrappers.

```
fetchPublicShopProductsSafe()   → { items:[], total:0, page, perPage }
fetchPublicShopCategoriesSafe() → { items:[] }
fetchPublicShopFitmentsSafe()   → { brands:[], modelsByBrand:{}, years:[] }
fetchPublicShopContactSafe()    → null
```

Page handlers (`page.js`, `san-pham/page.js`, `lien-he/page.js`) now use
the safe variants in their `Promise.all`. The shop fetch itself stays
mandatory — if that fails the page `notFound()`s as before.

### Null-guard the header

`ShopHeader.jsx` previously called `shop.phone.replace(...)` /
`shop.zalo.replace(...)` directly. A brand-new shop with NULL contact
fields would have thrown. Now:

```
const safePhone = (shop.phone || "").replace(/\s/g, "");
const safeZalo  = (shop.zalo  || safePhone || "").replace(/\s/g, "");
```

— and each CTA hides when its field is empty. The whole CTA row also
hides if both phone and zalo are empty, so a half-filled shop doesn't
render an empty button bar.

The `shortDescription`, `province`, `rating`, `customerCount`,
`workingHoursShort` spans likewise hide when their source is null.

### Analytics + Share API

Already wrapped in try/catch from Phase 5.1; no change needed.

---

## 8. Lighthouse — before / after

### Mobile, `http://otofine.localhost:3000/shops/phutungoto355`

| Metric                    | Before Phase 5.7 | After Phase 5.7 |
|---------------------------|------------------|-----------------|
| **Performance**           | 61               | 78  (+17)       |
| **Accessibility**         | 89               | 97  (+8)        |
| **Best Practices**        | 75               | 75              |
| FCP                       | 1.4 s            | 1.5 s           |
| LCP                       | 5.7 s            | 3.9 s  (−1.8)   |
| TBT                       | 640 ms           | 360 ms (−280)   |
| CLS                       | 0.074            | 0.074           |
| Speed Index               | 3.0 s            | 1.7 s  (−1.3)   |

### What moved the numbers

- **LCP −1.8 s** — `fetchpriority="high"` + `decoding="async"` on the
  cover (LCP element) via ShopImage.
- **TBT −280 ms** — lazy-loaded images + skeleton fallback skip the
  layout/decode work for off-screen rows.
- **A11y +8** — `aria-label`s on UtilButton (mobile hides the text
  label) + ShopShareMenu + product card wishlist + select elements
  in ShopFilters.

### Remaining failures (intentionally not fixed in this PR)

| Audit                       | Why we left it                                        |
|-----------------------------|-------------------------------------------------------|
| `bf-cache`                  | Dev-mode artefact; production behaves differently.   |
| `third-party-cookies`       | Comes from a global JS the apex layout injects.      |
| `color-contrast` (footer)   | Lives in `text-gray-500` footer of the **apex** shell — explicit "do not touch" zone. |
| `errors-in-console`         | Dev-mode Next.js noise + favicon dev probes.         |
| `largest-contentful-paint`  | Hard ceiling is the R2 origin pull (~1 s); the rest is the storefront itself. |

Raw reports:
`audit/lighthouse/storefront-mobile-{before,final}.report.{json,html}`.

---

## 9. Observability — new structured log events

All emitted with the existing `[shopsite] event=...` line format so
existing log pipelines pick them up without changes:

| Event                                 | When                                                   |
|---------------------------------------|--------------------------------------------------------|
| `storefront.rate-limited`             | Per-IP cap exceeded on the public API.                |
| `storefront.bot-suspected reason=ua`  | Known scraper UA hit any endpoint.                    |
| `storefront.bot-suspected reason=404-scan` | Same IP, ≥ 8 404s in 60s.                        |
| `storefront.bot-suspected reason=hot-rate` | Same IP, ≥ 240 req/min for two windows in a row.|
| (frontend) `shopsite:event` `image_fallback` | ShopImage swapped to placeholder.              |

All log lines are sanitized through `anonymizeIp` (first two octets
for v4, first 4 hex groups for v6).

---

## 10. What was NOT touched

- middleware routing (`frontend/middleware.js`)
- nginx
- wildcard DNS
- RFQ
- auth (login / refresh / reset / change password)
- `app/product/*` SEO
- product APIs
- R2 pipeline
- seller-center layout
- apex `/sitemap.xml`, `/robots.txt`, apex home metadata

---

## Rollout safety

- Every middleware change is additive. The route file orders them
  consistently: `rate-limit → cache → handler`. A cache hit still
  consumes one slot from the rate-limit bucket so the cap is
  cosmically fair, not just a CPU brake.
- The abuse detector NEVER blocks; it only logs. We can ship this to
  production immediately and tune thresholds from real traffic.
- The frontend changes degrade more gracefully than they did before
  (null contacts hide, broken images fall back, partial backend
  outages keep the rest of the page rendering). No happy-path change.
- The Cache-Control tightening (categories/fitments/contact up to
  300s) reduces backend load. If a seller updates one of these,
  their PUT already invalidates the in-process LRU; the CDN catches
  up on its next SWR refresh.
