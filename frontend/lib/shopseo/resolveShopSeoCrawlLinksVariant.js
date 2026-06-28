/**
 * SHOP-SEO-LINKGRAPH-02 — Map entity namespace → crawl link render mode.
 */

import { SHOP_NAMESPACE } from "./namespace.js";

/** @typedef {'full' | 'collection' | 'contextual' | 'none'} ShopSeoCrawlLinksVariant */

/**
 * @param {string | undefined} namespace
 * @returns {ShopSeoCrawlLinksVariant}
 */
export function resolveShopSeoCrawlLinksVariant(namespace) {
  switch (namespace) {
    case SHOP_NAMESPACE.SHOP_COLLECTION:
      return "collection";
    case SHOP_NAMESPACE.SHOP_CATEGORY:
    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND:
    case SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE:
    case SHOP_NAMESPACE.SHOP_VEHICLE:
      return "contextual";
    case SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR:
    case SHOP_NAMESPACE.SHOP_VEHICLE_YEAR:
    case SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE:
    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE:
      return "contextual";
    default:
      return "none";
  }
}
