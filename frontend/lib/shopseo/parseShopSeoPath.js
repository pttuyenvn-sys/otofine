/**
 * ARCH-07.2 — Parse shop subdomain SEO paths into entities.
 */

import {
  SHOP_COLLECTION_SLUG,
  SHOP_NAMESPACE,
  SHOP_STATIC_ROUTES,
  SHOP_VEHICLE_PREFIX,
} from "./namespace.js";
import { normalizeShopCategorySlug } from "./buildShopSeoPath.js";
import { parseVehicleYearSuffix } from "./parseVehicleYearSuffix.js";
import { normalizeSubPath } from "./isShopSeoRewritePath.js";
import { slugifyBrand, slugifyModel, slugifyVi } from "./slugify.js";

/**
 * @param {string} subPath
 * @param {{ categories?: Array<{ slug?: string, name?: string }>, fitments?: object }} [catalog]
 * @returns {object | null}
 */
export function parseShopSeoPath(subPath, catalog = {}) {
  const path = normalizeSubPath(subPath);
  const segment = path.replace(/^\//, "").toLowerCase();

  if (!segment) {
    return entity(SHOP_NAMESPACE.SHOP_HOME, path, {});
  }

  switch (path) {
    case SHOP_STATIC_ROUTES.ABOUT:
      return staticEntity("ABOUT", path);
    case SHOP_STATIC_ROUTES.CONTACT:
      return staticEntity("CONTACT", path);
    case SHOP_STATIC_ROUTES.COLLECTION:
    case SHOP_STATIC_ROUTES.LEGACY_COLLECTION:
      return entity(SHOP_NAMESPACE.SHOP_COLLECTION, SHOP_STATIC_ROUTES.COLLECTION, {});
    default:
      break;
  }

  if (segment === SHOP_COLLECTION_SLUG) {
    return entity(SHOP_NAMESPACE.SHOP_COLLECTION, path, {});
  }

  if (segment.startsWith(`${SHOP_VEHICLE_PREFIX}-`) && segment !== SHOP_COLLECTION_SLUG) {
    return parseVehicleSegment(segment, path, catalog);
  }

  return parseCategorySegment(segment, path, catalog);
}

function parseVehicleSegment(segment, path, catalog) {
  const remainder = segment.slice(`${SHOP_VEHICLE_PREFIX}-`.length);
  if (!remainder) return null;

  const tokens = remainder.split("-").filter(Boolean);
  const { year, tokens: afterYear } = parseVehicleYearSuffix(tokens);
  const fit = matchFitment(afterYear, catalog.fitments);

  const filters = {
    brand: fit.brand,
    model: fit.model,
    year: year || undefined,
  };

  if (!filters.brand) return null;

  if (filters.year) {
    if (String(filters.year).includes("-")) {
      return entity(SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE, path, filters);
    }
    return entity(SHOP_NAMESPACE.SHOP_VEHICLE_YEAR, path, filters);
  }
  return entity(SHOP_NAMESPACE.SHOP_VEHICLE, path, filters);
}

function parseCategorySegment(segment, path, catalog) {
  const normalizedSegment = slugifyVi(segment || "");
  const category = matchCategory(normalizedSegment, catalog.categories);
  if (!category) return null;

  const baseSlug = String(category.slug || "").toLowerCase();
  const filters = {
    categorySlug: baseSlug,
    categoryName: category.name,
    ...(category.id != null ? { categoryId: category.id } : {}),
  };

  if (
    normalizedSegment === baseSlug ||
    normalizedSegment === baseSlug.replace(/-o-to$/, "") + "-o-to"
  ) {
    return entity(SHOP_NAMESPACE.SHOP_CATEGORY, path, filters);
  }

  const baseCore = baseSlug.replace(/-o-to$/, "");
  if (!normalizedSegment.startsWith(`${baseCore}-`)) return null;

  const remainder = normalizedSegment.slice(baseCore.length + 1);
  const tokens = remainder.split("-").filter(Boolean);
  const { year, tokens: afterYear } = parseVehicleYearSuffix(tokens);
  const fit = matchFitment(afterYear, catalog.fitments);

  Object.assign(filters, {
    brand: fit.brand || undefined,
    model: fit.model || undefined,
    year: year || undefined,
  });

  if (filters.year) {
    if (String(filters.year).includes("-")) {
      return entity(SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE, path, filters);
    }
    return entity(SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR, path, filters);
  }
  if (filters.model) {
    return entity(SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE, path, filters);
  }
  if (filters.brand) {
    return entity(SHOP_NAMESPACE.SHOP_CATEGORY_BRAND, path, filters);
  }

  return entity(SHOP_NAMESPACE.SHOP_CATEGORY, path, filters);
}

function matchCategory(segment, categories = []) {
  const list = Array.isArray(categories) ? categories : [];
  let best = null;
  for (const row of list) {
    const slug = normalizeShopCategorySlug(row?.slug || row?.name || "");
    if (!slug) continue;
    const core = slug.replace(/-o-to$/, "");
    const normalized = `${core}-o-to`;
    const matches =
      segment === slug ||
      segment === normalized ||
      segment.startsWith(`${core}-`);
    if (!matches) continue;
    if (!best || normalized.length > best.slug.length) {
      best = {
        slug: normalized,
        name: row.name || "",
        id: row.id != null ? row.id : undefined,
      };
    }
  }
  return best;
}

/**
 * Match brand/model from slug tokens using shop fitments (longest slug wins).
 *
 * @param {string[]} tokens
 * @param {object | null | undefined} fitments
 * @returns {{ brand: string, model: string }}
 */
function matchFitment(tokens, fitments) {
  const brands = normalizeFitmentBrandRows(fitments);
  if (tokens.length === 0) return { brand: "", model: "" };

  const joined = tokens.join("-");
  const brandCandidates = brands
    .map((row) => ({
      row,
      brandSlug: slugifyBrand(row?.brand || ""),
    }))
    .filter((entry) => entry.brandSlug)
    .sort(
      (a, b) =>
        b.brandSlug.length - a.brandSlug.length ||
        a.row.brand.localeCompare(b.row.brand, "vi"),
    );

  for (const { row, brandSlug } of brandCandidates) {
    if (joined !== brandSlug && !joined.startsWith(`${brandSlug}-`)) continue;

    const modelTokens =
      joined === brandSlug ? [] : joined.slice(brandSlug.length + 1).split("-").filter(Boolean);

    if (modelTokens.length === 0) {
      return { brand: row.brand || "", model: "" };
    }

    const models = Array.isArray(row.models) ? row.models : [];
    const modelSlugJoined = modelTokens.join("-");
    const modelCandidates = models
      .map((m) => {
        const modelName = typeof m === "string" ? m : m?.model || "";
        return { modelName, modelSlug: slugifyModel(modelName) };
      })
      .filter((entry) => entry.modelSlug)
      .sort(
        (a, b) =>
          b.modelSlug.length - a.modelSlug.length ||
          a.modelName.localeCompare(b.modelName, "vi"),
      );

    for (const { modelName, modelSlug } of modelCandidates) {
      if (modelSlugJoined === modelSlug) {
        return { brand: row.brand || "", model: modelName };
      }
    }

    return { brand: row.brand || "", model: "" };
  }

  return { brand: "", model: "" };
}

/**
 * Accept both nested SEO catalog shape and public API fitments DTO.
 *
 * @param {object | null | undefined} fitments
 * @returns {Array<{ brand: string, models?: Array<{ model?: string } | string> }>}
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

function entity(namespace, path, filters) {
  return { namespace, path, filters };
}

function staticEntity(kind, path) {
  return { namespace: kind, path, filters: {}, staticKind: kind };
}
