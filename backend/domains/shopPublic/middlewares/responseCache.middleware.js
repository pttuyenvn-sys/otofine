import {
  publicApiResponseCache,
  TTL_MS,
} from "../cache/caches.js";
import { validateShopSlugParam } from "../validators/shopPublic.validators.js";
import { shopsiteLog } from "../observability/logger.js";

/**
 * Generic response-cache middleware for the public shopsite GET API.
 *
 * Per-route TTL is supplied at mount time:
 *
 *   router.get("/:slug", responseCache(TTL_MS.shopInfo), handler)
 *
 * Behaviour:
 *   - Only GET requests (other methods bypass).
 *   - Only 2xx JSON responses are cached (errors NEVER cached).
 *   - Cache key = `req.originalUrl` (includes query string).
 *   - Tagged with `shop:<slug>` so the seller's invalidation API
 *     evicts every cached response for that shop in O(k).
 *   - On hit, sets `X-Cache: HIT` and serves the captured body.
 *   - On miss, hooks into `res.json` to capture the response, then
 *     hands control to the next middleware.
 */
export function responseCache(ttlMs) {
  const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : TTL_MS.fallback;

  return function responseCacheMiddleware(req, res, next) {
    if (req.method !== "GET") return next();

    const slug = validateShopSlugParam(req.params?.slug);
    if (!slug) {
      // Validator will return 404 downstream; nothing to cache.
      return next();
    }

    const key = req.originalUrl || req.url;
    const cached = publicApiResponseCache.get(key);
    if (cached) {
      res.set("X-Cache", "HIT");
      res.set("Cache-Control", cached.cacheControl || "public, s-maxage=60, stale-while-revalidate=300");
      shopsiteLog.info("cache.hit", { cache: "publicApiResponse", slug, key });
      return res.status(cached.status).json(cached.body);
    }

    res.set("X-Cache", "MISS");
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // We must capture BOTH the status (already set by handler) and
      // the body. Only cache 2xx; anything else (404, 500) is volatile.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        publicApiResponseCache.set(
          key,
          {
            status: res.statusCode,
            body,
            cacheControl: res.getHeader("Cache-Control"),
          },
          { ttlMs: ttl, tags: [`shop:${slug}`] },
        );
        shopsiteLog.info("cache.set", {
          cache: "publicApiResponse",
          slug,
          key,
          ttl_ms: ttl,
        });
      }
      return originalJson(body);
    };
    next();
  };
}
