/**
 * ARCH-07.2 — Map shop SEO entity filters → public products API args.
 */

import { SHOP_NAMESPACE } from "./namespace.js";

/**
 * @param {{ namespace?: string, filters?: Record<string, unknown> }} entity
 * @returns {{ category?: string, brand?: string, model?: string, year?: string, yearFrom?: string, yearTo?: string }}
 */
export function mapEntityToProductFilters(entity) {
  if (!entity?.filters) return {};
  const f = entity.filters;
  const out = {};
  // Public products API currently expects category display name rather
  // than normalized SEO slug.
  if (f.categoryId != null && String(f.categoryId).trim() !== "") {
    out.category = `c-${String(f.categoryId).trim()}`;
  } else if (f.categoryName) {
    out.category = String(f.categoryName).trim();
  } else if (f.categorySlug) {
    out.category = String(f.categorySlug).replace(/^\//, "");
  }
  if (f.brand) out.brand = String(f.brand);
  if (f.model) out.model = String(f.model);
  if (
    f.year &&
    (entity?.namespace === SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE ||
      entity?.namespace === SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE)
  ) {
    const parts = String(f.year).split("-");
    const from = String(parts[0] || "").trim();
    const to = String(parts[1] || "").trim();
    if (from && to) {
      out.yearFrom = from;
      out.yearTo = to;
    }
  } else if (f.yearFrom && f.yearTo && entity?.namespace === SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE) {
    out.yearFrom = String(f.yearFrom).trim();
    out.yearTo = String(f.yearTo).trim();
  } else if (f.year) {
    out.year = String(f.year);
  }
  return out;
}
