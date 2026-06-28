/**
 * SHOP-OWNERSHIP-04 — Build navigateSeoFilters patch when removing one SEO dimension.
 */

export const SHOP_SEO_FILTER_DIMENSIONS = ["category", "brand", "model", "year"];

/**
 * @param {{ category?: string, brand?: string, model?: string, year?: string }} readFilters
 * @param {"category" | "brand" | "model" | "year"} dimensionKey
 * @returns {{ category: string | null, brand: string | null, model: string | null, year: string | null }}
 */
export function shopSeoFilterRemovePatch(readFilters = {}, dimensionKey) {
  const patch = {
    category: readFilters.category || null,
    brand: readFilters.brand || null,
    model: readFilters.model || null,
    year: readFilters.year || null,
  };

  patch[dimensionKey] = null;

  if (dimensionKey === "brand") {
    patch.model = null;
    patch.year = null;
  } else if (dimensionKey === "model") {
    patch.year = null;
  }

  return patch;
}
