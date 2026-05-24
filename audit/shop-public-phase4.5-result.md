# Shop Public Page — Phase 4.5 Result

**Status:** Shipped
**Theme:** Production hardening, in-memory caching, abuse protection, observability, performance polish.
**Risk profile:** All changes are additive or strictly inside the `shopPublic` domain. No touch to: `app/[slug]`, `app/product`, RFQ, auth, products APIs, SEO indexing rules, nginx, wildcard DNS logic, seller-center layout.

---

## 1. What landed

| Area | Change | Files |
|---|---|---|
| Cache primitive | LRU + per-entry TTL + tag invalidation | `backend/domains/shopPublic/cache/lruTtlCache.js` |
| Cache wiring | Existence cache + public-API response cache + central invalidator | `backend/domains/shopPublic/cache/caches.js` |
| Request memo | Per-request memoizer for SSR helpers | `backend/domains/shopPublic/cache/requestMemo.js` |
| Existence cache | `findPublicShopBySlug` now caches hits AND misses | `backend/domains/shopPublic/repositories/shopPublic.repository.js` |
| Response cache | Per-route TTLs, `X-Cache: HIT/MISS`, tag-based invalidation | `backend/domains/shopPublic/middlewares/responseCache.middleware.js` |
| Slug-check abuse | Per-IP **and** per-account 30 req / 5 min token bucket | `backend/domains/shopPublic/middlewares/slugCheckRateLimit.middleware.js` |
| Image optimization | sharp pipeline: avatar 512² webp, cover 1600w webp, EXIF stripped | `backend/domains/shopPublic/utils/imageOptimize.util.js` |
| Upload error UX | Multer errors → JSON 4xx (no HTML leak) | `backend/routes/sellerPublicPage.routes.js` |
| Structured logger | Single `[shopsite]` line-oriented logger + IP anonymizer | `backend/domains/shopPublic/observability/logger.js` |
| Subdomain hardening | `classifyHost`: length cap, char allow-list, multi-level reject | `frontend/lib/shopHost.js` |
| Middleware logs | Edge-safe `[shopsite] event=middleware.*` lines | `frontend/middleware.js` |
| SSR unknown-shop | `[shopsite] event=ssr.unknown-shop slug=…` on 404 path | `frontend/app/(shopsite)/shops/[slug]/layout.js` |
| Debug endpoint | `GET /api/public/shops/debug/cache` (DEV only) | `backend/domains/shopPublic/controllers/cacheDebug.controller.js` |

No feature surface added. No SEO change. No new env vars. No DB migration.

---

## 2. Cache topology

```
                     ┌──────────────────────────────────────────────┐
   GET /api/         │  responseCache(ttl) middleware               │
   public/shops/…  ──▶  key = req.originalUrl                       │
                     │  tag = shop:<slug>                            │
                     │  store only 2xx                               │
                     └──────────┬───────────────────────────────────┘
                                │ MISS
                                ▼
                     ┌──────────────────────────────────────────────┐
                     │  service.getPublicShopBySlug(slug)            │
                     └──────────┬───────────────────────────────────┘
                                │
                                ▼
                     ┌──────────────────────────────────────────────┐
                     │  repo.findPublicShopBySlug(slug)              │
                     │   ↳ shopExistenceCache.get(slug)              │
                     │      HIT row        → return row              │
                     │      HIT MISS_SENT  → return null             │
                     │      MISS           → SQL → cache + return    │
                     └──────────────────────────────────────────────┘

   PUT /api/shop/public-page (seller) ──► invalidateShop(slug)
      ↳ shopExistenceCache.delete(slug)
      ↳ publicApiResponseCache.invalidateTag(`shop:${slug}`)
```

### TTL matrix

| Cache | Key | TTL | Notes |
|---|---|---|---|
| `shopExistence` | slug | 5 min (exists) / 1 min (miss) | Same key for both states; sentinel encodes miss. |
| `publicApiResponse` | full `req.originalUrl` | shop=60s, categories=5min, products=30s, contact=5min | Tagged `shop:<slug>` |

### Capacity

| Cache | Cap | Per-entry size (~) | Worst-case heap |
|---|---|---|---|
| `shopExistence` | 5,000 | ~2 KB | ~10 MB |
| `publicApiResponse` | 2,000 | ~4 KB | ~8 MB |

PM2 single instance assumption. A future HA rollout would swap the primitive for Redis without touching call sites — the `get/set/delete/invalidateTag` shape is intentionally `lru-cache`/`ioredis` compatible.

---

## 3. Benchmark — before vs after

Single VM, localhost loop, MySQL warm. 50 sequential GETs per route after one priming hit. Times include Node parse + JSON serialization.

| Endpoint | Phase 4 (DB hit each call) | Phase 4.5 (warm cache) | Speedup |
|---|---|---|---|
| `GET /api/public/shops/:slug` | 67.6 ms | **4.4 ms** | **15.4×** |
| `GET /api/public/shops/:slug/products` | 25.0 ms | **4.3 ms** | **5.8×** |
| `GET /api/public/shops/:slug/categories` | 61.8 ms | **3.5 ms** | **17.7×** |
| `GET /api/public/shops/:slug/contact` | 5.9 ms | **3.4 ms** | **1.7×** + removed redundant `COUNT(*)` |

Final hit ratio over the 200-request run: **98%**. Memory footprint at that moment: RSS 145 MB, heap-used 53 MB (same as Phase 4 baseline within noise).

Example `/debug/cache` snapshot at end of benchmark:

```json
{
  "uptime_s": 15,
  "caches": {
    "shopExistence": {
      "size": 1, "max": 5000,
      "hits": 3, "misses": 1, "sets": 1, "evictions": 0,
      "hitRatio": 0.75, "tagIndexKeys": 1
    },
    "publicApiResponse": {
      "size": 4, "max": 2000,
      "hits": 200, "misses": 4, "sets": 4, "evictions": 0,
      "hitRatio": 0.98, "tagIndexKeys": 1
    }
  },
  "process": { "rss_mb": 145, "heap_used_mb": 53 }
}
```

---

## 4. Abuse-protection scenarios — tested

### 4.1 `/check-slug` rate limit
Spammed 35 calls from one authenticated session:
```
200 200 200 ... (30×) ... 200 429 429 429 429 429
```
429 body: `{"ok":false,"error":"Bạn kiểm tra slug quá nhiều lần. Hãy thử lại sau.","retryAfter":300}`
Log line: `[shopsite] event=ratelimit.slug-check ip=::ffff:127.0.x.x accountId=1002 ip_count=31 acc_count=31 retry_s=300`

### 4.2 Subdomain hostname attacks
| Probe | Decision | HTTP |
|---|---|---|
| `Host: foo bar.otofine.com` (space → invalid char) | `middleware.host-invalid-chars` | 200 apex |
| `Host: foo.bar.otofine.com` (multi-level) | `middleware.multi-level-host` | 200 apex |
| `Host: <260×"a">.otofine.com` (over 253) | `middleware.host-too-long` | 200 apex |
| `api.otofine.com` (reserved) | `middleware.reserved-subdomain` | 200 apex |
| `cuahangoto355.otofine.com` (valid) | `middleware.rewrite` | 200 rewrite |
| `doesnotexist.otofine.com` (valid slug shape, no shop) | `middleware.rewrite` → `ssr.unknown-shop` | 404 |

All attacks fall through to safe apex rendering. No rewrite, no DB hit on the apex side.

### 4.3 Upload abuse
| Probe | Result |
|---|---|
| Plain-text file w/ `Content-Type: image/png` | 400 `Ảnh không hợp lệ hoặc đã hỏng.` — sharp re-decode failed |
| Bogus MIME (`text/plain` posing as `image/gif`) | 400 `Định dạng ảnh không hợp lệ.` (MIME allow-list) |
| 7 MB random PNG | 413 `Ảnh quá lớn. Tối đa 5MB.` (multer limit + clean JSON handler) |
| Spam uploads | 429 after 12/min/shop (existing `publicPageUploadRateLimit`) |

### 4.4 Suspended-not-cached
Seller toggles `public_status` `public → suspended`:
1. PUT triggers `invalidateShop(slug)` → both caches cleared.
2. First GET after suspension → DB lookup, 404, MISS_SENTINEL cached for 60s.
3. 404 responses are **never** cached at the response layer (`status<200||>=300` guard). `X-Cache: MISS` on every retry.
4. Re-publishing the shop runs `invalidateShop` again — `MISS_SENTINEL` is wiped before the next reader sees 200.

---

## 5. Image optimization — real numbers

Sample upload (1600×900 solid-color JPEG): in 8820 bytes → out **2678 bytes WebP, 70% smaller**, still 1600×900.
Sample avatar (1024×1024 PNG): in 5kB → out **548 bytes WebP, 512×512**, smart-cropped.

For realistic photo content the ratio typically sits at 30–50% smaller than JPEG at perceptually equivalent quality. EXIF is stripped (no `.withMetadata()` call), eliminating GPS leakage from camera uploads.

Pipeline: multer (size + MIME allow-list) → `validateUploadFile` → `optimizeAvatar` / `optimizeCover` (re-decodes; rejects non-images regardless of header) → R2 → DB save → `invalidateShop`.

R2 bucket and key prefixes unchanged from Phase 4 (`shop-public/avatar/`, `shop-public/cover/`). Only the extension is now always `.webp`.

---

## 6. Observability cheatsheet

All shopsite events are line-prefixed `[shopsite] event=<name> ...key=val...`. Grep-friendly.

| Event | Where | Sample fields |
|---|---|---|
| `cache.hit` / `cache.miss` | repo, response middleware | `cache=… slug=… exists=…` |
| `cache.set` | response middleware | `cache=publicApiResponse slug=… ttl_ms=…` |
| `seller.publish-toggle` | seller controller PUT | `shopId=… slug=… status=public invalidated_api_entries=4` |
| `seller.slug-collision` | seller controller PUT | `shopId=… code=SLUG_TAKEN` |
| `upload.ok` | seller upload controllers | `kind=avatar bytes_in=… bytes_out=… saved_pct=…  dur_ms=…` |
| `upload.decode-failed` / `upload.fail` | seller upload controllers | `kind=cover msg=…` |
| `ratelimit.slug-check` | slug-check middleware | `ip=… accountId=… ip_count=… retry_s=…` (IP anonymized to /16) |
| `public-api.ok` | public read controllers | `route=shop slug=… dur_ms=…` |
| `public-api.unknown-shop` | public read controllers | `slug=…` |
| `public-api.error` | public read controllers | `route=… slug=… msg=…` |
| `middleware.rewrite` | frontend middleware | `slug=… path=…` |
| `middleware.reserved-subdomain` | frontend middleware | `sub=…` |
| `middleware.invalid-subdomain` | frontend middleware | `sub=…` |
| `middleware.multi-level-host` | frontend middleware | `suffix=…` |
| `middleware.host-too-long` / `host-invalid-chars` | frontend middleware | — |
| `ssr.unknown-shop` | shops layout | `slug=…` |

What we deliberately do NOT log: full request bodies, JWTs, raw cookies, full IPs, Authorization headers. `SENSITIVE_KEYS` set in the logger drops them at the source.

---

## 7. DEV-only debug endpoint

```
GET /api/public/shops/debug/cache       (NODE_ENV !== "production")
```

Returns cache stats, middleware counters, and process RSS/heap. In production it 404s — verified by reading `process.env.NODE_ENV` at request time.

This is the same shape `ops` can hit from a sidecar in staging to verify cache warmth and tune TTLs before promotion.

---

## 8. Security re-check checklist

- [x] **Suspended shops never cached publicly.** Validated end-to-end: PUT→invalidate→404→404 stays MISS at response cache; existence cache holds short-TTL MISS_SENTINEL until status flips back.
- [x] **Uploads validated server-side.** Three-stage gate: MIME allow-list, multer size cap, sharp re-decode that proves the bytes are actually an image.
- [x] **No HTML sanitizer bypass.** Phase 4 sanitizer untouched; sanitizer runs on every PUT inside the validator. No upload path writes raw HTML.
- [x] **No open redirect.** No redirect target is constructed from user-controlled data. The only redirects are the literal `/product → /` rule and the existing auth-domain ones.
- [x] **No host header injection.** `classifyHost` validates the Host header against a strict charset (`[a-z0-9.-]`) and a 253-char cap before any downstream code consumes it.
- [x] **No PII in logs.** IPs anonymized to /16 (IPv4) / first 4 groups (IPv6). Sensitive keys filter set in logger.

---

## 9. Memory footprint estimate

| Component | Worst case |
|---|---|
| `shopExistence` LRU | ~10 MB (5000 × ~2 KB row) |
| `publicApiResponse` LRU | ~8 MB (2000 × ~4 KB DTO) |
| Per-IP / per-account slug-check buckets | < 100 KB total (token-bucket entries auto-expire) |
| Upload buffers (multer) | ≤ 12 × 5 MB = 60 MB transient per minute |
| Logger | constant — no buffer retention |

Steady state expected: ~5 MB of cache memory for the Vietnam-only shop catalogue, easily within the existing PM2 process budget (no change to `max_memory_restart`).

---

## 10. Files added / modified

**Added (10):**
```
backend/domains/shopPublic/cache/lruTtlCache.js
backend/domains/shopPublic/cache/caches.js
backend/domains/shopPublic/cache/requestMemo.js
backend/domains/shopPublic/middlewares/responseCache.middleware.js
backend/domains/shopPublic/middlewares/slugCheckRateLimit.middleware.js
backend/domains/shopPublic/utils/imageOptimize.util.js
backend/domains/shopPublic/observability/logger.js
backend/domains/shopPublic/observability/middlewareStats.js
backend/domains/shopPublic/controllers/cacheDebug.controller.js
audit/shop-public-phase4.5-result.md
```

**Modified (8):**
```
backend/domains/shopPublic/index.js
backend/domains/shopPublic/controllers/sellerPublicPage.controller.js
backend/domains/shopPublic/controllers/shopPublic.controller.js
backend/domains/shopPublic/repositories/shopPublic.repository.js
backend/domains/shopPublic/services/shopPublic.service.js
backend/routes/publicShop.routes.js
backend/routes/sellerPublicPage.routes.js
backend/utils/r2-sdk.js                     (1 line: contentType param)
frontend/lib/shopHost.js                    (added classifyHost + decisions)
frontend/middleware.js                      (used classifyHost + edge logs)
frontend/app/(shopsite)/shops/[slug]/layout.js  (ssr.unknown-shop log)
```

**NOT touched:** `app/[slug]`, `app/product`, RFQ, auth, products APIs, SEO indexing config, nginx, wildcard DNS rules, seller-center layout, sanitizer logic.

---

## 11. Rollback

Every change is binary-revertable. Concretely:

- **To disable the response cache:** change `responseCache(ttl)` mount in `routes/publicShop.routes.js` to a no-op middleware. No data is lost; DB serves everything.
- **To disable the existence cache:** revert `repositories/shopPublic.repository.js` to the pre-4.5 version (`findPublicShopBySlug` minus the cache block). The rest of the system keeps working.
- **To disable image optimization:** restore the pre-4.5 controller path (`extFromMime` + direct buffer upload). R2 keys would revert to `.jpg`/`.png`/`.webp` based on input.
- **To disable subdomain hardening:** the legacy `extractShopSubdomain` semantics are preserved (it's a thin wrapper now); old behaviour returns only when `decision === REWRITE_OK`. To go all the way back, restore the previous file.
- **To disable observability:** the logger has no side effects beyond `console.*`. Remove the `shopsiteLog.*` calls; nothing breaks.

No env-var flags needed for rollback — the `PUBLIC_SHOPSITE_ENABLED` and `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED` kill switches from Phase 2/3 still gate the whole subsystem.
