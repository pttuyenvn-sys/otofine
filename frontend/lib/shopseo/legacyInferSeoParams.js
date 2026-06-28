/**
 * SHOP-OWNERSHIP-01 — Legacy client path parser (shadow compare only).
 * @deprecated Use shopIdentityFromPathname → parseShopSeoPath instead.
 */

import {
  SHOP_COLLECTION_SLUG,
  SHOP_VEHICLE_PREFIX,
} from "./namespace.js";
import { parseVehicleYearSuffix } from "./parseVehicleYearSuffix.js";
import { slugifyBrand, slugifyModel } from "./slugify.js";

/**
 * @param {string} pathname
 * @param {object | null | undefined} fitments
 * @returns {{ category?: string, brand?: string, model?: string, year?: string }}
 */
export function legacyInferSeoParams(pathname, fitments) {
  const out = {};
  const segment = String(pathname || "")
    .split("?")[0]
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (!segment) return out;
  if (segment === SHOP_COLLECTION_SLUG) return out;

  if (segment.startsWith(`${SHOP_VEHICLE_PREFIX}-`)) {
    const tokens = segment
      .slice(`${SHOP_VEHICLE_PREFIX}-`.length)
      .split("-")
      .filter(Boolean);
    const { year, tokens: afterYear } = parseVehicleYearSuffix(tokens);
    if (afterYear.length === 0) return out;

    const brandSlug = afterYear[0];
    const brand = findBrandBySlug(brandSlug, fitments);
    if (brand) out.brand = brand;

    const modelSlug = afterYear.slice(1).join("-");
    if (modelSlug && brand) {
      const model = findModelBySlug(brand, modelSlug, fitments);
      if (model) out.model = model;
    }

    if (year) out.year = String(year);
    return out;
  }

  if (segment.endsWith("-o-to")) {
    out.category = segment;
    return out;
  }

  const combined = legacyInferCategoryVehicleParams(segment, fitments);
  if (combined) return combined;
  return out;
}

function findBrandBySlug(slug, fitments) {
  const brands = Array.isArray(fitments?.brands) ? fitments.brands : [];
  const hit = brands.find((b) => slugifyBrand(b) === slug);
  return hit || "";
}

function findModelBySlug(brand, modelSlug, fitments) {
  const models = Array.isArray(fitments?.modelsByBrand?.[brand])
    ? fitments.modelsByBrand[brand]
    : [];
  const hit = models.find((m) => slugifyModel(m) === modelSlug);
  return hit || "";
}

function legacyInferCategoryVehicleParams(segment, fitments) {
  const tokens = String(segment || "").split("-").filter(Boolean);
  if (tokens.length < 2) return null;
  const { year, tokens: afterYear } = parseVehicleYearSuffix(tokens);
  const candidates = buildBrandSlugCandidates(fitments);
  let best = null;

  for (const row of candidates) {
    const brandTokens = row.brandSlug.split("-").filter(Boolean);
    for (let i = 1; i <= afterYear.length - brandTokens.length; i += 1) {
      const hit =
        afterYear.slice(i, i + brandTokens.length).join("-") === row.brandSlug;
      if (!hit) continue;
      const categoryTokens = afterYear.slice(0, i);
      if (categoryTokens.length === 0) continue;
      const modelTokens = afterYear.slice(i + brandTokens.length);
      const modelSlug = modelTokens.join("-");
      const model = modelSlug
        ? findModelBySlug(row.brandName, modelSlug, fitments)
        : "";
      if (modelSlug && !model) continue;
      const candidate = {
        category: `${categoryTokens.join("-")}-o-to`,
        brand: row.brandName,
        model: model || "",
        year: year ? String(year) : "",
      };
      if (!best || categoryTokens.length > best._categoryLen) {
        best = { ...candidate, _categoryLen: categoryTokens.length };
      }
    }
  }

  if (!best) return null;
  const out = {
    category: best.category,
    brand: best.brand,
  };
  if (best.model) out.model = best.model;
  if (best.year) out.year = best.year;
  return out;
}

function buildBrandSlugCandidates(fitments) {
  const brands = Array.isArray(fitments?.brands) ? fitments.brands : [];
  return brands
    .map((brand) => ({
      brandName: String(brand),
      brandSlug: slugifyBrand(brand),
    }))
    .filter((row) => Boolean(row.brandSlug))
    .sort((a, b) => b.brandSlug.length - a.brandSlug.length);
}
