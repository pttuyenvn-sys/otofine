/**
 * ARCH-07.1 — Build shop SEO path segments (subdomain-relative).
 */

import {
  SHOP_COLLECTION_SLUG,
  SHOP_STATIC_ROUTES,
  SHOP_VEHICLE_PREFIX,
} from "./namespace.js";
import { normalizeSubPath } from "./isShopSeoRewritePath.js";
import { slugifyBrand, slugifyModel, slugifyVi } from "./slugify.js";

/**
 * @param {{ categorySlug?: string, categoryName?: string, brand?: string, model?: string, year?: string | number }} filters
 * @returns {string}
 */
export function buildShopCategorySeoPath(filters = {}) {
  const categorySlug = resolveCategoryBaseSlug(filters);
  if (!categorySlug) return "";

  const brand = slugifyBrand(filters.brand || "");
  const model = slugifyModel(filters.model || "");
  const year = normalizeYearToken(filters);

  if (!brand) {
    return `/${categorySlug}`;
  }

  const base = categorySlug.replace(/-o-to$/, "");
  let path = `/${base}-${brand}`;
  if (model) path += `-${model}`;
  if (year) path += `-${year}`;
  return path;
}

/**
 * @param {{ brand?: string, model?: string, year?: string | number }} filters
 * @returns {string}
 */
export function buildShopVehicleSeoPath(filters = {}) {
  const brand = slugifyBrand(filters.brand || "");
  if (!brand) return "";

  const model = slugifyModel(filters.model || "");
  const year = normalizeYearToken(filters);

  let path = `/${SHOP_VEHICLE_PREFIX}-${brand}`;
  if (model) path += `-${model}`;
  if (year) path += `-${year}`;
  return path;
}

/**
 * @param {string} subPath
 * @returns {boolean}
 */
export function isShopStaticRoute(subPath) {
  const clean = normalizeSubPath(subPath);
  return (
    clean === SHOP_STATIC_ROUTES.HOME ||
    clean === SHOP_STATIC_ROUTES.ABOUT ||
    clean === SHOP_STATIC_ROUTES.CONTACT ||
    clean === SHOP_STATIC_ROUTES.COLLECTION ||
    clean === SHOP_STATIC_ROUTES.LEGACY_COLLECTION
  );
}

/**
 * @param {{ categorySlug?: string, categoryName?: string }} filters
 * @returns {string}
 */
function resolveCategoryBaseSlug(filters) {
  const fromSlug = normalizeShopCategorySlug(filters.categorySlug || "");
  if (fromSlug) {
    return fromSlug.endsWith(`-o-to`)
      ? fromSlug
      : `${fromSlug}-o-to`;
  }
  return normalizeShopCategorySlug(filters.categoryName || "");
}

/**
 * Normalize category labels/slugs into shop SEO category slug.
 * Accepts source values with spaces/diacritics and always emits ASCII slug.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeShopCategorySlug(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const withoutSuffix = raw.replace(/-o-to$/, "");
  const normalized = slugifyVi(withoutSuffix);
  if (!normalized) return "";
  return `${normalized}-o-to`;
}

function normalizeYearToken(filters = {}) {
  const from = String(filters.yearFrom ?? "").trim();
  const to = String(filters.yearTo ?? "").trim();
  if (from && to && from !== to) {
    return `${from}-${to}`;
  }
  return String(filters.year || "").trim();
}
