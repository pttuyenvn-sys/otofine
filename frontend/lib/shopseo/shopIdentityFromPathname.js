/**
 * SHOP-OWNERSHIP-01 — Client pathname ingress → ShopSeoEntity (single parser with SSR).
 */

import { SHOP_NAMESPACE } from "./namespace.js";
import { parseShopSeoPath } from "./parseShopSeoPath.js";
import { pathnameToShopSubPath } from "./pathnameToShopSubPath.js";

/**
 * @typedef {import('./parseShopSeoPath.js').ShopSeoEntity} ShopSeoEntity
 */

/**
 * @param {Array<{ slug?: string, name?: string, id?: number }> | null | undefined} categories
 * @returns {Array<{ slug?: string, name?: string }>}
 */
export function normalizeCatalogCategories(categories) {
  const list = Array.isArray(categories) ? categories : [];
  return list.map((row) => ({
    slug: row?.slug != null ? String(row.slug) : "",
    name: row?.name != null ? String(row.name) : "",
  }));
}

/**
 * @param {string} pathname
 * @param {{ shopBasePath?: string, catalog?: { categories?: Array<{ slug?: string, name?: string }>, fitments?: object } }} [options]
 * @returns {ShopSeoEntity | null}
 */
export function shopIdentityFromPathname(pathname, options = {}) {
  const subPath = pathnameToShopSubPath(pathname, options.shopBasePath || "");
  const catalog = options.catalog || {};
  return parseShopSeoPath(subPath, {
    categories: catalog.categories || [],
    fitments: catalog.fitments || {},
  });
}

/**
 * Map ShopSeoEntity filters → useShopFilterParams dimension keys.
 *
 * @param {ShopSeoEntity | null | undefined} entity
 * @returns {{ category?: string, brand?: string, model?: string, year?: string }}
 */
export function shopEntityFiltersToParams(entity) {
  if (!entity?.filters) return {};

  if (
    entity.namespace === SHOP_NAMESPACE.SHOP_HOME ||
    entity.namespace === SHOP_NAMESPACE.SHOP_COLLECTION
  ) {
    return {};
  }

  const f = entity.filters;
  const out = {};

  if (f.categorySlug) {
    out.category = String(f.categorySlug).trim().toLowerCase();
  }
  if (f.brand) out.brand = String(f.brand).trim();
  if (f.model) out.model = String(f.model).trim();
  if (f.year) out.year = String(f.year).trim();

  return out;
}

/**
 * @param {string} pathname
 * @param {{ shopBasePath?: string, catalog?: { categories?: Array<{ slug?: string, name?: string }>, fitments?: object } }} [options]
 * @returns {{ category?: string, brand?: string, model?: string, year?: string }}
 */
export function shopParamsFromPathname(pathname, options = {}) {
  const categories = normalizeCatalogCategories(options.catalog?.categories);
  const entity = shopIdentityFromPathname(pathname, {
    shopBasePath: options.shopBasePath,
    catalog: {
      categories,
      fitments: options.catalog?.fitments || {},
    },
  });
  return shopEntityFiltersToParams(entity);
}
