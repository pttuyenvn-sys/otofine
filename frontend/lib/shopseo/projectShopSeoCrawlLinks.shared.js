/**
 * Shared helpers for shop SEO crawl link projection.
 */

import { buildShopSeoCrawlHref } from "./buildShopSeoCrawlHref.js";
import { normalizeShopCategorySlug } from "./buildShopSeoPath.js";
import { SHOP_NAMESPACE } from "./namespace.js";

const CATEGORY_NS = new Set([SHOP_NAMESPACE.SHOP_CATEGORY]);
const VEHICLE_NS = new Set([
  SHOP_NAMESPACE.SHOP_VEHICLE,
  SHOP_NAMESPACE.SHOP_CATEGORY_BRAND,
  SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
]);
const YEAR_NS = new Set([
  SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR,
  SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
  SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
]);

/**
 * @param {Array<{ slug?: string, name?: string, productCount?: number }>} categories
 */
export function normalizeCatalogCategories(categories) {
  const list = Array.isArray(categories) ? categories : [];
  return list
    .map((row) => ({
      ...row,
      slug: normalizeShopCategorySlug(row?.slug || row?.name || ""),
    }))
    .filter((row) => Boolean(row.slug));
}

/**
 * @param {object | null | undefined} fitments
 */
export function normalizeFitmentBrandRows(fitments) {
  const raw = fitments?.brands;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  if (typeof raw[0] === "object" && raw[0]?.brand) {
    return raw;
  }

  const modelsByBrand = fitments?.modelsByBrand || {};
  return raw.map((brand) => ({
    brand: String(brand),
    models: (modelsByBrand[brand] || []).map((model) => ({ model: String(model) })),
  }));
}

/**
 * @param {Array<{ href: string, label: string, path: string, namespace: string }>} bucket
 * @param {string} shopBasePath
 * @param {string} path
 * @param {string} namespace
 * @param {Record<string, unknown>} filters
 * @param {Set<string>} seen
 * @returns {boolean}
 */
export function pushCrawlLink(bucket, shopBasePath, path, namespace, filters, seen) {
  const cleanPath = String(path || "").trim();
  if (!cleanPath || seen.has(cleanPath)) return false;
  seen.add(cleanPath);
  bucket.push({
    href: buildShopSeoCrawlHref(shopBasePath, cleanPath),
    label: labelForFilters(namespace, filters, cleanPath),
    path: cleanPath,
    namespace,
    filters,
  });
  return true;
}

/**
 * @param {string} namespace
 * @param {Record<string, unknown>} filters
 * @param {string} path
 */
export function labelForFilters(namespace, filters, path) {
  const f = filters || {};
  const category = String(f.categoryName || f.categorySlug || "").trim();
  const brand = String(f.brand || "").trim();
  const model = String(f.model || "").trim();
  const year = String(f.year || "").trim();
  const yearRange =
    f.yearFrom && f.yearTo ? `${f.yearFrom}-${f.yearTo}` : "";

  if (YEAR_NS.has(namespace)) {
    if (category && brand && model && yearRange) {
      return `${category} — ${brand} ${model} (${yearRange})`;
    }
    if (category && brand && model && year) {
      return `${category} — ${brand} ${model} (${year})`;
    }
    if (brand && model && yearRange) {
      return `${brand} ${model} (${yearRange})`;
    }
    if (brand && model && year) {
      return `${brand} ${model} (${year})`;
    }
    return year || yearRange || "Năm";
  }

  if (VEHICLE_NS.has(namespace)) {
    if (category && brand && model) {
      return `${category} — ${brand} ${model}`;
    }
    if (category && brand) {
      return `${category} — ${brand}`;
    }
    if (brand && model) {
      return `${brand} ${model}`;
    }
    if (brand) return brand;
  }

  if (CATEGORY_NS.has(namespace) && category) return category;
  return path.replace(/^\//, "");
}

export const SHOP_CRAWL_LIMITS = Object.freeze({
  /** Home — LINKGRAPH-BOOST-PHASE-02 */
  full: { categories: 8, vehicles: 12, years: 16 },
  /** Collection landing — compact graph */
  collection: { categories: 8, vehicles: 8, years: 8 },
  /** Deep SEO landings — single “related” section */
  contextual: 16,
});
