/**
 * SHOP-OWNERSHIP-04 — Shared PATH builder for navigateSeoFilters (select + remove).
 */

import { SHOP_COLLECTION_PATH } from "./namespace.js";
import {
  buildShopCategorySeoPath,
  buildShopVehicleSeoPath,
} from "./buildShopSeoPath.js";

/**
 * @param {{ category?: string | null, brand?: string | null, model?: string | null, year?: string | null, shopSlug?: string }} dims
 * @param {{ resolveYearRange?: (args: { shopSlug: string, brand: string, model: string, year: number }) => Promise<{ yearFrom: number, yearTo: number } | null> }} [options]
 * @returns {Promise<string>}
 */
export async function buildShopSeoFilterNavigatePath(
  dims = {},
  options = {},
) {
  const category = normalizeDim(dims.category);
  const brand = normalizeDim(dims.brand);
  const model = normalizeDim(dims.model);
  const year = normalizeDim(dims.year);
  const shopSlug = String(dims.shopSlug || "").trim();
  const resolveYearRange = options.resolveYearRange || null;

  if (category) {
    const categoryFilters = {
      categorySlug: String(category),
      brand: brand || undefined,
      model: model || undefined,
    };
    const selectedYear = normalizeYearValue(year);
    if (selectedYear && categoryFilters.model) {
      const range = resolveYearRange
        ? await resolveYearRange({
            shopSlug,
            brand: categoryFilters.brand,
            model: categoryFilters.model,
            year: selectedYear,
          })
        : null;
      if (range) {
        categoryFilters.yearFrom = range.yearFrom;
        categoryFilters.yearTo = range.yearTo;
      } else {
        categoryFilters.year = String(selectedYear);
      }
    }
    return buildShopCategorySeoPath(categoryFilters) || SHOP_COLLECTION_PATH;
  }

  if (brand) {
    const vehicle = {
      brand: String(brand),
      model: model || undefined,
    };
    const selectedYear = normalizeYearValue(year);
    if (selectedYear && vehicle.model) {
      const range = resolveYearRange
        ? await resolveYearRange({
            shopSlug,
            brand: vehicle.brand,
            model: vehicle.model,
            year: selectedYear,
          })
        : null;
      if (range) {
        vehicle.yearFrom = range.yearFrom;
        vehicle.yearTo = range.yearTo;
      } else {
        vehicle.year = String(selectedYear);
      }
    }
    return buildShopVehicleSeoPath(vehicle) || SHOP_COLLECTION_PATH;
  }

  return SHOP_COLLECTION_PATH;
}

function normalizeDim(value) {
  if (value == null || value === "") return null;
  return String(value);
}

function normalizeYearValue(year) {
  const n = Number(year);
  return Number.isFinite(n) && n > 0 ? n : null;
}
