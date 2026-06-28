import { isSitemapEligible, NAMESPACE } from "@/lib/seo/urlGovernance";

export { NAMESPACE };

/**
 * Single sitemap gate — delegates to urlGovernance.isSitemapEligible only.
 *
 * @param {string} namespace
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateSitemapEntry(namespace, metrics = {}) {
  return isSitemapEligible(namespace, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateProductEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.PRODUCT, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCategoryEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CATEGORY, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateVehicleEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.VEHICLE, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateVehicleYearEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.VEHICLE_YEAR, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateVehicleYearRangeEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.VEHICLE_YEAR_RANGE, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCategoryBrandEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CATEGORY_BRAND, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCategoryBrandLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CATEGORY_BRAND_LOCATION, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCategoryBrandVehicleLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CATEGORY_BRAND_VEHICLE_LOCATION, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCbmEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CBM, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateBrandLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.BRAND_LOCATION, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateBrandVehicleLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.BRAND_VEHICLE_LOCATION, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateBrandVehicleYearRangeLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.BRAND_VEHICLE_YEAR_RANGE_LOCATION, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.LOCATION, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCategoryLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CATEGORY_LOCATION, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCategoryBrandVehicleYearRangeEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE, metrics);
}

/**
 * @param {{ productCount?: number, sellerCount?: number }} metrics
 * @returns {boolean}
 */
export function gateCategoryBrandVehicleYearRangeLocationEntry(metrics = {}) {
  return gateSitemapEntry(NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION, metrics);
}
