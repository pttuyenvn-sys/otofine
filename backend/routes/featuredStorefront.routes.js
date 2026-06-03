import express from "express";
import {
  publicShopsiteEnabledOrNotFound,
  publicApiRateLimit,
  responseCache,
  TTL_MS,
  handleGetFeaturedStorefronts,
} from "../domains/shopPublic/index.js";

/**
 * Featured storefront discovery (Phase 6E.1).
 * Mounted at /api/storefronts when PUBLIC_SHOPSITE_ENABLED.
 */
const router = express.Router();

router.use(publicShopsiteEnabledOrNotFound);

router.get(
  "/featured",
  publicApiRateLimit("list"),
  responseCache(TTL_MS.productsList),
  handleGetFeaturedStorefronts,
);

export default router;
