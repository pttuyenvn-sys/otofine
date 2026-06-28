/**
 * ARCH-05B.1A — URL governance engine (policy only).
 *
 * Decides indexability and sitemap eligibility from namespace + inventory
 * metrics. Does not build URLs, set canonicals, or touch runtime output.
 */

export const NAMESPACE = Object.freeze({
  PRODUCT: "PRODUCT",
  CATEGORY: "CATEGORY",
  VEHICLE: "VEHICLE",
  VEHICLE_YEAR: "VEHICLE_YEAR",
  VEHICLE_YEAR_RANGE: "VEHICLE_YEAR_RANGE",
  CATEGORY_BRAND: "CATEGORY_BRAND",
  CBM: "CBM",
  CBMY: "CBMY",
  CATEGORY_BRAND_VEHICLE_YEAR_RANGE: "CATEGORY_BRAND_VEHICLE_YEAR_RANGE",
  CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION: "CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION",
  CATEGORY_BRAND_VEHICLE_LOCATION: "CATEGORY_BRAND_VEHICLE_LOCATION",
  CATEGORY_BRAND_LOCATION: "CATEGORY_BRAND_LOCATION",
  BRAND_LOCATION: "BRAND_LOCATION",
  BRAND_VEHICLE_YEAR_RANGE_LOCATION: "BRAND_VEHICLE_YEAR_RANGE_LOCATION",
  BRAND_VEHICLE_LOCATION: "BRAND_VEHICLE_LOCATION",
  LOCATION: "LOCATION",
  CATEGORY_LOCATION: "CATEGORY_LOCATION",
  VEHICLE_LOCATION: "VEHICLE_LOCATION",
  PRODUCT_LOCATION: "PRODUCT_LOCATION",
});

/** @typedef {typeof NAMESPACE[keyof typeof NAMESPACE]} UrlNamespace */

/**
 * @typedef {object} UrlGovernanceMetrics
 * @property {number} [productCount]
 * @property {number} [sellerCount]
 */

/**
 * @param {UrlGovernanceMetrics | null | undefined} metrics
 * @returns {{ productCount: number, sellerCount: number }}
 */
function normalizeMetrics(metrics) {
  const productCount = Number(metrics?.productCount);
  const sellerCount = Number(metrics?.sellerCount);
  return {
    productCount: Number.isFinite(productCount) && productCount > 0 ? productCount : 0,
    sellerCount: Number.isFinite(sellerCount) && sellerCount > 0 ? sellerCount : 0,
  };
}

/**
 * @param {string} namespace
 * @param {UrlGovernanceMetrics} [metrics]
 * @returns {boolean}
 */
export function isIndexable(namespace, metrics = {}) {
  const { productCount, sellerCount } = normalizeMetrics(metrics);

  switch (namespace) {
    case NAMESPACE.PRODUCT:
      return true;
    case NAMESPACE.CATEGORY:
      return productCount > 0;
    case NAMESPACE.VEHICLE:
      return productCount > 0;
    case NAMESPACE.VEHICLE_YEAR:
      return productCount > 0;
    case NAMESPACE.VEHICLE_YEAR_RANGE:
      return productCount > 0;
    case NAMESPACE.CATEGORY_BRAND:
      return productCount > 0;
    case NAMESPACE.CATEGORY_BRAND_LOCATION:
      return productCount > 0;
    case NAMESPACE.CATEGORY_BRAND_VEHICLE_LOCATION:
      return productCount > 0;
    case NAMESPACE.CBM:
      return productCount > 0;
    case NAMESPACE.CBMY:
      return productCount > 0;
    case NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE:
      return productCount > 0;
    case NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION:
      return productCount > 0;
    case NAMESPACE.BRAND_LOCATION:
      return productCount > 0;
    case NAMESPACE.BRAND_VEHICLE_LOCATION:
      return productCount > 0;
    case NAMESPACE.BRAND_VEHICLE_YEAR_RANGE_LOCATION:
      return productCount > 0;
    case NAMESPACE.LOCATION:
      return productCount > 0 && sellerCount > 0;
    case NAMESPACE.CATEGORY_LOCATION:
      return productCount > 0;
    case NAMESPACE.VEHICLE_LOCATION:
      return productCount > 0 && sellerCount > 0;
    case NAMESPACE.PRODUCT_LOCATION:
      return false;
    default:
      return false;
  }
}

/**
 * @param {string} namespace
 * @param {UrlGovernanceMetrics} [metrics]
 * @returns {boolean}
 */
export function isSitemapEligible(namespace, metrics = {}) {
  const { productCount } = normalizeMetrics(metrics);

  switch (namespace) {
    case NAMESPACE.PRODUCT:
      return true;
    case NAMESPACE.CATEGORY:
      return productCount >= 2;
    case NAMESPACE.VEHICLE:
      return productCount >= 1;
    case NAMESPACE.VEHICLE_YEAR:
      return productCount >= 10;
    case NAMESPACE.VEHICLE_YEAR_RANGE:
      return productCount >= 10;
    case NAMESPACE.CATEGORY_BRAND:
      return productCount >= 5;
    case NAMESPACE.CATEGORY_BRAND_LOCATION:
      return productCount >= 5;
    case NAMESPACE.CATEGORY_BRAND_VEHICLE_LOCATION:
      return productCount >= 5;
    case NAMESPACE.CBM:
      return productCount >= 2;
    case NAMESPACE.CBMY:
      return productCount >= 5;
    case NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE:
      return productCount >= 2;
    case NAMESPACE.CATEGORY_BRAND_VEHICLE_YEAR_RANGE_LOCATION:
      return productCount >= 2;
    case NAMESPACE.BRAND_LOCATION:
      return productCount >= 10;
    case NAMESPACE.BRAND_VEHICLE_LOCATION:
      return productCount >= 10;
    case NAMESPACE.BRAND_VEHICLE_YEAR_RANGE_LOCATION:
      return productCount >= 2;
    case NAMESPACE.LOCATION:
      return productCount >= 10;
    case NAMESPACE.CATEGORY_LOCATION:
      return productCount >= 5;
    case NAMESPACE.VEHICLE_LOCATION:
      return productCount >= 20;
    case NAMESPACE.PRODUCT_LOCATION:
      return false;
    default:
      return false;
  }
}
