/**
 * Public re-exports for the shopPublic domain.
 * Keep this file thin — only barrel imports that other modules
 * (routes, scripts, future SSR helpers) might consume.
 */
export {
  publicShopConfig,
  RESERVED_SHOP_SLUGS,
  SLUG_REGEX,
} from "./config/publicShop.config.js";

export {
  slugify,
  isValidShopSlug,
  normalizeSlugParam,
} from "./utils/slug.util.js";

export {
  getPublicShopBySlug,
  getPublicShopCategories,
  getPublicShopContact,
  getPublicShopProducts,
} from "./services/shopPublic.service.js";

export { publicShopsiteEnabledOrNotFound } from "./middlewares/enabled.middleware.js";
export { publicPageUploadRateLimit } from "./middlewares/uploadRateLimit.middleware.js";
export { slugCheckRateLimit } from "./middlewares/slugCheckRateLimit.middleware.js";
export { responseCache } from "./middlewares/responseCache.middleware.js";
export {
  publicApiRateLimit,
  getPublicApiRateStats,
  PUBLIC_API_TIERS,
} from "./middlewares/publicApiRateLimit.middleware.js";

export {
  handleGetShop,
  handleGetShopProducts,
  handleGetShopCategories,
  handleGetShopContact,
  handleGetShopFitments,
} from "./controllers/shopPublic.controller.js";

/** Phase 7.1 — public shop directory + related shops. */
export {
  handleListShops,
  handleListProvinces,
  handleListBrands,
  handleListRelatedShops,
} from "./controllers/shopDirectory.controller.js";

export {
  getPublicShopDirectory,
  getPublicShopDirectoryProvinces,
  getPublicShopDirectoryBrands,
  getRelatedShopsBySlug,
} from "./services/shopDirectory.service.js";

export {
  rankShop,
  RANK_MAX_SCORE,
} from "./ranking/shopRanking.js";

export {
  handleGetMyPublicPage,
  handleUpdateMyPublicPage,
  handleCheckSlug,
  handleUploadAvatar,
  handleUploadCover,
  handleUploadContent,
} from "./controllers/sellerPublicPage.controller.js";

export { handleGetCacheDebug } from "./controllers/cacheDebug.controller.js";

export { sanitizeShopHtml } from "./utils/htmlSanitize.util.js";

export {
  TTL_MS,
  invalidateShop,
  shopExistenceCache,
  publicApiResponseCache,
  allCacheStats,
} from "./cache/caches.js";

export { shopsiteLog, anonymizeIp, withTiming } from "./observability/logger.js";
export { recordSubdomainEvent, getMiddlewareStats } from "./observability/middlewareStats.js";
export { recordPublicRequest, getAbuseStats } from "./observability/abuseDetector.js";
