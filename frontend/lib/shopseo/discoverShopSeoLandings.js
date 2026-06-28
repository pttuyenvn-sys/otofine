/**
 * ARCH-07.2 — Generate shop SEO landing candidates from shop catalog.
 */

import {
  buildShopCategorySeoPath,
  buildShopVehicleSeoPath,
  normalizeShopCategorySlug,
} from "./buildShopSeoPath.js";
import { SHOP_NAMESPACE } from "./namespace.js";
import { parseShopSeoPath } from "./parseShopSeoPath.js";

/**
 * @param {object} input
 * @param {Array<{ slug?: string, name?: string, productCount?: number }>} [input.categories]
 * @param {object} [input.fitments]
 * @param {Array<{ brand?: string, model?: string, yearFrom?: string | number, yearTo?: string | number, productCount?: number }>} [input.vehicleYearRanges]
 * @returns {Array<{ namespace: string, path: string, productCount?: number, filters?: Record<string, unknown> }>}
 */
export function discoverShopSeoLandings(input = {}) {
  const categories = normalizeCategories(input.categories);
  const fitments = input.fitments || {};
  const brandRows = normalizeFitmentBrandRows(fitments);
  const years = Array.isArray(fitments.years) ? fitments.years : [];
  const seen = new Set();
  const out = [];

  const push = (filters, tree, productCount, forcedNamespace) => {
    const path =
      tree === "vehicle"
        ? buildShopVehicleSeoPath(filters)
        : buildShopCategorySeoPath(filters);
    if (!path || path === "/") return;

    const entity = parseShopSeoPath(path, { categories, fitments });
    if (!entity || seen.has(entity.path)) return;
    seen.add(entity.path);

    out.push({
      namespace: forcedNamespace || entity.namespace,
      path: entity.path,
      filters: entity.filters,
      productCount: productCount ?? undefined,
    });
  };

  // Priority order for sitemap readiness (ARCH-07.3):
  // 1) VEHICLE 2) VEHICLE_YEAR_RANGE 3) CATEGORY 4) CATEGORY_BRAND
  // 5) CATEGORY_VEHICLE 6) CATEGORY_VEHICLE_YEAR.
  for (const row of brandRows) {
    const brand = row.brand;
    if (!brand) continue;
    push({ brand }, "vehicle");

    for (const m of row.models || []) {
      const model = typeof m === "string" ? m : m?.model;
      if (!model) continue;
      push({ brand, model }, "vehicle");

      for (const year of years) {
        push({ brand, model, year }, "vehicle");
      }
    }
  }

  const yearRanges = Array.isArray(input.vehicleYearRanges)
    ? input.vehicleYearRanges
    : [];
  for (const range of yearRanges) {
    const yearFrom = String(range.yearFrom ?? "").trim();
    const yearTo = String(range.yearTo ?? "").trim();
    if (!yearFrom || !yearTo || yearFrom === yearTo) continue;
    push(
      {
        brand: range.brand,
        model: range.model,
        yearFrom,
        yearTo,
      },
      "vehicle",
      range.productCount,
      SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
    );
  }

  for (const cat of categories) {
    const categorySlug = normalizeShopCategorySlug(cat.slug || cat.name || "");
    if (!categorySlug) continue;

    const baseFilters = {
      categorySlug,
      categoryName: cat.name,
    };
    push(baseFilters, "category", cat.productCount);

    for (const row of brandRows) {
      const brand = row.brand;
      if (!brand) continue;
      push({ ...baseFilters, brand }, "category");

      for (const m of row.models || []) {
        const model = typeof m === "string" ? m : m?.model;
        if (!model) continue;
        push({ ...baseFilters, brand, model }, "category");

        for (const year of years) {
          push({ ...baseFilters, brand, model, year }, "category");
        }
      }
    }
  }

  return out;
}

function normalizeCategories(categories) {
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
function normalizeFitmentBrandRows(fitments) {
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
