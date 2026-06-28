/**
 * SHOP-SEO-LINKGRAPH-02 — Contextual related crawl links for deep landings.
 */

import {
  buildShopCategorySeoPath,
  buildShopVehicleSeoPath,
  normalizeShopCategorySlug,
} from "./buildShopSeoPath.js";
import { SHOP_NAMESPACE } from "./namespace.js";
import { normalizeCatalogCategories, normalizeFitmentBrandRows, pushCrawlLink, SHOP_CRAWL_LIMITS } from "./projectShopSeoCrawlLinks.shared.js";

/**
 * @param {object} input
 * @param {{ namespace?: string, path?: string, filters?: Record<string, unknown> }} input.entity
 * @param {string} [input.shopBasePath]
 * @param {Array<{ slug?: string, name?: string }>} [input.categories]
 * @param {object} [input.fitments]
 * @param {number} [input.limit]
 * @returns {{ related: import('./projectShopSeoCrawlLinks.js').ShopSeoCrawlLink[] }}
 */
export function projectShopSeoContextualCrawlLinks(input = {}) {
  const entity = input.entity || {};
  const namespace = String(entity.namespace || "");
  const filters = entity.filters || {};
  const currentPath = String(entity.path || "");
  const shopBasePath = String(input.shopBasePath || "");
  const limit = Number(input.limit) > 0 ? Number(input.limit) : SHOP_CRAWL_LIMITS.contextual;
  const categories = normalizeCatalogCategories(input.categories);
  const brandRows = normalizeFitmentBrandRows(input.fitments);
  const fitmentYears = Array.isArray(input.fitments?.years) ? input.fitments.years : [];
  const vehicleYearRanges = Array.isArray(input.vehicleYearRanges)
    ? input.vehicleYearRanges
    : Array.isArray(input.fitments?.vehicleYearRanges)
      ? input.fitments.vehicleYearRanges
      : [];

  const related = [];
  const seen = new Set([currentPath]);

  const push = (path, ns, rowFilters) => {
    if (related.length >= limit) return false;
    return pushCrawlLink(related, shopBasePath, path, ns, rowFilters, seen);
  };

  switch (namespace) {
    case SHOP_NAMESPACE.SHOP_CATEGORY: {
      const currentSlug = normalizeShopCategorySlug(filters.categorySlug || filters.categoryName || "");
      const base = categoryBaseFilters(filters);
      if (base) {
        for (const row of brandRows) {
          if (related.length >= limit) break;
          const brand = row.brand;
          if (!brand) continue;
          const rowFilters = { ...base, brand };
          push(
            buildShopCategorySeoPath(rowFilters),
            SHOP_NAMESPACE.SHOP_CATEGORY_BRAND,
            rowFilters,
          );
        }
      }
      for (const cat of categories) {
        if (related.length >= limit) break;
        const categorySlug = normalizeShopCategorySlug(cat.slug || cat.name || "");
        if (!categorySlug || categorySlug === currentSlug) continue;
        push(
          buildShopCategorySeoPath({ categorySlug, categoryName: cat.name }),
          SHOP_NAMESPACE.SHOP_CATEGORY,
          { categorySlug, categoryName: cat.name },
        );
      }
      break;
    }

    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND: {
      const base = categoryBaseFilters(filters);
      if (!base) break;
      const brand = String(filters.brand || "").trim();
      for (const row of brandRows) {
        if (related.length >= limit) break;
        for (const m of row.models || []) {
          if (related.length >= limit) break;
          const model = typeof m === "string" ? m : m?.model;
          if (!model || row.brand !== brand) continue;
          const rowFilters = { ...base, brand, model };
          push(
            buildShopCategorySeoPath(rowFilters),
            SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
            rowFilters,
          );
        }
      }
      break;
    }

    case SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE: {
      const base = categoryBaseFilters(filters);
      if (!base) break;
      const brand = String(filters.brand || "").trim();
      const model = String(filters.model || "").trim();
      for (const range of vehicleYearRanges) {
        if (related.length >= limit) break;
        if (!matchSlug(range.brand, brand) || !matchSlug(range.model, model)) {
          continue;
        }
        const yearFrom = String(range.yearFrom ?? "").trim();
        const yearTo = String(range.yearTo ?? "").trim();
        if (!yearFrom || !yearTo || yearFrom === yearTo) continue;
        const rowFilters = { ...base, brand, model, yearFrom, yearTo };
        push(
          buildShopCategorySeoPath(rowFilters),
          SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
          rowFilters,
        );
      }
      if (vehicleYearRanges.length === 0) {
        for (const year of fitmentYears) {
          if (related.length >= limit) break;
          const rowFilters = { ...base, brand, model, year: String(year) };
          push(
            buildShopCategorySeoPath(rowFilters),
            SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR,
            rowFilters,
          );
        }
      }
      break;
    }

    case SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE: {
      const base = categoryBaseFilters(filters);
      if (!base) break;
      const brand = String(filters.brand || "").trim();
      const model = String(filters.model || "").trim();
      const currentFrom = String(filters.yearFrom ?? "").trim();
      const currentTo = String(filters.yearTo ?? "").trim();
      for (const range of vehicleYearRanges) {
        if (related.length >= limit) break;
        if (!matchSlug(range.brand, brand) || !matchSlug(range.model, model)) {
          continue;
        }
        const yearFrom = String(range.yearFrom ?? "").trim();
        const yearTo = String(range.yearTo ?? "").trim();
        if (!yearFrom || !yearTo || yearFrom === yearTo) continue;
        if (yearFrom === currentFrom && yearTo === currentTo) continue;
        const rowFilters = { ...base, brand, model, yearFrom, yearTo };
        push(
          buildShopCategorySeoPath(rowFilters),
          SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
          rowFilters,
        );
      }
      break;
    }

    case SHOP_NAMESPACE.SHOP_VEHICLE: {
      const brand = String(filters.brand || "").trim();
      const model = String(filters.model || "").trim();
      if (model) {
        for (const range of vehicleYearRanges) {
          if (related.length >= limit) break;
          if (!matchSlug(range.brand, brand) || !matchSlug(range.model, model)) {
            continue;
          }
          const yearFrom = String(range.yearFrom ?? "").trim();
          const yearTo = String(range.yearTo ?? "").trim();
          if (!yearFrom || !yearTo || yearFrom === yearTo) continue;
          const rowFilters = { brand, model, yearFrom, yearTo };
          push(
            buildShopVehicleSeoPath(rowFilters),
            SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
            rowFilters,
          );
        }
        for (const row of brandRows) {
          if (related.length >= limit) break;
          if (row.brand !== brand) continue;
          for (const m of row.models || []) {
            if (related.length >= limit) break;
            const sibling = typeof m === "string" ? m : m?.model;
            if (!sibling || sibling === model) continue;
            const rowFilters = { brand, model: sibling };
            push(
              buildShopVehicleSeoPath(rowFilters),
              SHOP_NAMESPACE.SHOP_VEHICLE,
              rowFilters,
            );
          }
        }
      } else if (brand) {
        for (const row of brandRows) {
          if (related.length >= limit) break;
          for (const m of row.models || []) {
            if (related.length >= limit) break;
            if (row.brand !== brand) continue;
            const rowModel = typeof m === "string" ? m : m?.model;
            if (!rowModel) continue;
            const rowFilters = { brand, model: rowModel };
            push(
              buildShopVehicleSeoPath(rowFilters),
              SHOP_NAMESPACE.SHOP_VEHICLE,
              rowFilters,
            );
          }
        }
      }
      break;
    }

    case SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE: {
      const brand = String(filters.brand || "").trim();
      const model = String(filters.model || "").trim();
      const currentFrom = String(filters.yearFrom ?? "").trim();
      const currentTo = String(filters.yearTo ?? "").trim();
      for (const range of vehicleYearRanges) {
        if (related.length >= limit) break;
        if (!matchSlug(range.brand, brand) || !matchSlug(range.model, model)) {
          continue;
        }
        const yearFrom = String(range.yearFrom ?? "").trim();
        const yearTo = String(range.yearTo ?? "").trim();
        if (!yearFrom || !yearTo || yearFrom === yearTo) continue;
        if (yearFrom === currentFrom && yearTo === currentTo) continue;
        const rowFilters = { brand, model, yearFrom, yearTo };
        push(
          buildShopVehicleSeoPath(rowFilters),
          SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
          rowFilters,
        );
      }
      break;
    }

    default:
      break;
  }

  return { related };
}

function matchSlug(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

/**
 * @param {Record<string, unknown>} filters
 */
function categoryBaseFilters(filters) {
  const categorySlug = normalizeShopCategorySlug(
    String(filters.categorySlug || filters.categoryName || ""),
  );
  if (!categorySlug) return null;
  return {
    categorySlug,
    categoryName: String(filters.categoryName || "").trim() || categorySlug,
  };
}
