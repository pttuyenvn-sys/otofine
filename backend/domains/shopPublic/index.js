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

export {
  handleGetShop,
  handleGetShopProducts,
  handleGetShopCategories,
  handleGetShopContact,
} from "./controllers/shopPublic.controller.js";

export {
  handleGetMyPublicPage,
  handleUpdateMyPublicPage,
  handleCheckSlug,
  handleUploadAvatar,
  handleUploadCover,
} from "./controllers/sellerPublicPage.controller.js";

export { sanitizeShopHtml } from "./utils/htmlSanitize.util.js";
