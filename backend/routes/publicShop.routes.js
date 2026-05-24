import express from "express";
import {
  publicShopsiteEnabledOrNotFound,
  handleGetShop,
  handleGetShopProducts,
  handleGetShopCategories,
  handleGetShopContact,
  handleGetCacheDebug,
  responseCache,
  TTL_MS,
} from "../domains/shopPublic/index.js";

/**
 * Public shopsite read-only API.
 * Mounted in server.js at `/api/public/shops` and ONLY when the flag
 * is enabled at boot. The `publicShopsiteEnabledOrNotFound` middleware
 * is a second safety net.
 *
 * Each route is wrapped with `responseCache(<ttl>)` so identical URLs
 * are served from memory before the controller is even invoked.
 * Per-route TTLs live in `TTL_MS` (see cache/caches.js).
 */
const router = express.Router();

router.use(publicShopsiteEnabledOrNotFound);

/**
 * Debug endpoint — registered BEFORE the `:slug` catchall so the
 * route-level guard in the controller (NODE_ENV check) is the only
 * thing that can serve real cache state.
 */
router.get("/debug/cache", handleGetCacheDebug);

router.get("/:slug",            responseCache(TTL_MS.shopInfo),     handleGetShop);
router.get("/:slug/products",   responseCache(TTL_MS.productsList), handleGetShopProducts);
router.get("/:slug/categories", responseCache(TTL_MS.categories),   handleGetShopCategories);
router.get("/:slug/contact",    responseCache(TTL_MS.contact),      handleGetShopContact);

export default router;
