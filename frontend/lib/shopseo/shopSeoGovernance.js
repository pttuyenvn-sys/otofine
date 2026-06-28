/**
 * ARCH-07.2 — Shop SEO governance thresholds.
 */

import { SHOP_NAMESPACE } from "./namespace.js";

export const SHOP_SEO_THRESHOLDS = Object.freeze({
  [SHOP_NAMESPACE.SHOP_HOME]: 0,
  [SHOP_NAMESPACE.SHOP_COLLECTION]: 0,
  [SHOP_NAMESPACE.SHOP_CATEGORY]: 5,
  [SHOP_NAMESPACE.SHOP_CATEGORY_BRAND]: 5,
  [SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE]: 5,
  [SHOP_NAMESPACE.SHOP_BRAND]: 5,
  [SHOP_NAMESPACE.SHOP_VEHICLE]: 5,
  [SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR]: 10,
  [SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE]: 2,
  [SHOP_NAMESPACE.SHOP_VEHICLE_YEAR]: 10,
  [SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE]: 2,
});

function normalizeProductCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function isShopSeoIndexable(namespace, metrics = {}) {
  const count = normalizeProductCount(metrics.productCount);
  const threshold = SHOP_SEO_THRESHOLDS[namespace];
  if (threshold == null) return false;
  return count >= threshold;
}

export function isShopSeoSitemapEligible(namespace, metrics = {}) {
  return isShopSeoIndexable(namespace, metrics);
}

export function getShopSeoThreshold(namespace) {
  return { productCountMin: SHOP_SEO_THRESHOLDS[namespace] ?? Infinity };
}
