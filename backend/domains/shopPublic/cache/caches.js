import { createLruTtlCache } from "./lruTtlCache.js";

/**
 * Two long-lived caches for the public shopsite. Both are PROCESS-local
 * (PM2 single instance) and survive across requests.
 *
 *   1. shopExistenceCache
 *      - keyed by slug
 *      - stores either the resolved shop row (existing) OR the special
 *        sentinel `MISS_SENTINEL` (non-existing / not-public)
 *      - existing TTL  = 5 min      (rare to publish-then-unpublish)
 *      - missing TTL   = 1 min      (faster recovery if a shop appears)
 *      - cap: 5,000 entries — well below any realistic shop count for a
 *        Vietnam-only marketplace; the LRU absorbs accidental scan
 *        attempts.
 *
 *   2. shopLifecycleCache
 *      - keyed by slug
 *      - stores `{ slug, public_status }` OR MISS_SENTINEL (unknown slug)
 *      - used by GET /api/public/shops/:slug/lifecycle for sunset routing
 *      - TTL mirrors shopExistenceCache (5 min hit / 1 min miss)
 *
 *   3. publicApiResponseCache
 *      - keyed by the full request URL (path+query)
 *      - stores `{ status, body }` for 2xx GET responses
 *      - per-route TTLs (see TTL_MS below)
 *      - tagged with `shop:<slug>` so the seller's PUT/upload flow can
 *        invalidate every cached response for that shop in one call.
 *      - cap: 2,000 entries.
 *
 * SECURITY:
 *   - Only `public_status = 'public'` shop rows are ever stored. The
 *     repository writes the MISS sentinel for `pending` / `suspended`
 *     so a transient suspension can't be served from cache.
 *   - Responses themselves are pre-filtered by the service layer (it
 *     only ever returns DTOs derived from public rows), so caching them
 *     does not expand the disclosure surface.
 */
export const MISS_SENTINEL = Object.freeze({ __miss: true });

export const TTL_MS = Object.freeze({
  existence:        5 * 60 * 1000, // resolved-to-public
  existenceMiss:    1 * 60 * 1000, // not-found / not-public
  shopInfo:         60 * 1000,
  categories:       5 * 60 * 1000,
  productsList:     30 * 1000,
  contact:          5 * 60 * 1000,
  fallback:         60 * 1000,
});

export const shopExistenceCache = createLruTtlCache({
  name: "shopExistence",
  max: 5_000,
  defaultTtlMs: TTL_MS.existence,
});

export const shopLifecycleCache = createLruTtlCache({
  name: "shopLifecycle",
  max: 5_000,
  defaultTtlMs: TTL_MS.existence,
});

export const publicApiResponseCache = createLruTtlCache({
  name: "publicApiResponse",
  max: 2_000,
  defaultTtlMs: TTL_MS.shopInfo,
});

/**
 * Invalidate every cached artifact that depends on a given shop slug.
 * Called from the seller controller on every successful PUT or upload.
 *
 * Cheap: one tagIndex lookup + at most N small deletes.
 */
export function invalidateShop(slug) {
  if (!slug) return { existence: false, lifecycle: false, apiEntries: 0 };
  const existenceDeleted = shopExistenceCache.delete(slug);
  const lifecycleDeleted = shopLifecycleCache.delete(slug);
  const apiEntries = publicApiResponseCache.invalidateTag(`shop:${slug}`);
  return {
    existence: existenceDeleted,
    lifecycle: lifecycleDeleted,
    apiEntries,
  };
}

export function allCacheStats() {
  return {
    shopExistence: shopExistenceCache.stats(),
    shopLifecycle: shopLifecycleCache.stats(),
    publicApiResponse: publicApiResponseCache.stats(),
  };
}
