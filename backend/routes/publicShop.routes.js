import express from "express";
import {
  publicShopsiteEnabledOrNotFound,
  handleGetShop,
  handleGetShopProducts,
  handleGetShopCategories,
  handleGetShopContact,
  handleGetShopFitments,
  handleGetShopLifecycle,
  handleGetCacheDebug,
  handleListShops,
  handleListProvinces,
  handleListBrands,
  handleListRelatedShops,
  responseCache,
  publicApiRateLimit,
  TTL_MS,
} from "../domains/shopPublic/index.js";

/**
 * Public shopsite read-only API.
 * Mounted in server.js at `/api/public/shops` and ONLY when the flag
 * is enabled at boot. The `publicShopsiteEnabledOrNotFound` middleware
 * is a second safety net.
 *
 * Middleware order on each storefront route:
 *
 *   1. publicApiRateLimit(tier)  — per-IP token bucket (Phase 5.7).
 *      Runs BEFORE the cache so a single IP can't hammer cached
 *      responses for free; the cap is also a fairness signal.
 *   2. responseCache(ttl)        — in-memory LRU + TTL.
 *      `X-Cache: HIT` / `MISS` for ops.
 *   3. handler                   — controller; persists DB queries
 *      on cache miss, emits structured logs, and feeds the abuse
 *      detector after the response is sent.
 *
 * Per-route TTLs live in `TTL_MS` (see cache/caches.js); per-route
 * tier budgets live in `PUBLIC_API_TIERS` (publicApiRateLimit.*).
 */
const router = express.Router();

router.use(publicShopsiteEnabledOrNotFound);

/**
 * Debug endpoint — registered BEFORE the `:slug` catchall so the
 * route-level guard in the controller (NODE_ENV check) is the only
 * thing that can serve real cache state.
 */
router.get("/debug/cache", handleGetCacheDebug);

/**
 * Phase 7.1 — directory + facets. MUST be registered BEFORE the
 * `/:slug` catchall below, otherwise Express resolves `_facets` and
 * the unprefixed `/` (directory root) as slugs and 404s.
 *
 * The directory root uses the `list` tier (heavier query, similar
 * cost to /:slug/products) and the facets use the `query` tier
 * (rare, heavy aggregations).
 */
router.get(
  "/",
  publicApiRateLimit("list"),
  responseCache(TTL_MS.productsList),
  handleListShops,
);
router.get(
  "/_facets/provinces",
  publicApiRateLimit("query"),
  responseCache(TTL_MS.categories),
  handleListProvinces,
);
router.get(
  "/_facets/brands",
  publicApiRateLimit("query"),
  responseCache(TTL_MS.categories),
  handleListBrands,
);

router.get(
  "/:slug",
  publicApiRateLimit("read"),
  responseCache(TTL_MS.shopInfo),
  handleGetShop,
);
router.get(
  "/:slug/lifecycle",
  publicApiRateLimit("read"),
  responseCache(TTL_MS.shopInfo),
  handleGetShopLifecycle,
);
router.get(
  "/:slug/products",
  publicApiRateLimit("list"),
  responseCache(TTL_MS.productsList),
  handleGetShopProducts,
);
router.get(
  "/:slug/categories",
  publicApiRateLimit("query"),
  responseCache(TTL_MS.categories),
  handleGetShopCategories,
);
router.get(
  "/:slug/fitments",
  publicApiRateLimit("query"),
  responseCache(TTL_MS.categories),
  handleGetShopFitments,
);
router.get(
  "/:slug/contact",
  publicApiRateLimit("read"),
  responseCache(TTL_MS.contact),
  handleGetShopContact,
);
router.get(
  "/:slug/related",
  publicApiRateLimit("read"),
  responseCache(TTL_MS.categories),
  handleListRelatedShops,
);

export default router;
