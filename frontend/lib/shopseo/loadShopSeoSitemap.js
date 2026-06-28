/**
 * ARCH-07.2 — Load shop SEO sitemap entries (shop inventory only).
 * SHOP-SITEMAP-YEAR-NORMALIZE-02 — BMY year-range parity from shop fitments inventory.
 */

import {
  fetchPublicShopCategoriesSafe,
  fetchPublicShopFitmentsSafe,
  fetchPublicShopSafe,
} from "@/services/shopPublic.service";
import {
  buildShopCategorySeoPath,
  buildShopVehicleSeoPath,
  normalizeShopCategorySlug,
} from "./buildShopSeoPath.js";
import { SHOP_NAMESPACE } from "./namespace.js";
import { projectShopSitemap, toNextShopSitemap } from "./projectShopSitemap.js";
import { getShopSeoThreshold, isShopSeoSitemapEligible } from "./shopSeoGovernance.js";
import { parseShopSeoPath } from "./parseShopSeoPath.js";
import {
  countProductsForEntity,
  fetchShopProductCatalog,
  resolveStrictCountForEntity,
} from "../shopsite/resolveStrictCountForEntity.js";

const MAX_BRAND_URLS = 100;
const MAX_VEHICLE_URLS = 100;
const MAX_CATEGORY_BRAND_URLS = 100;
const MAX_CATEGORY_VEHICLE_URLS = 150;
const MAX_VEHICLE_YEAR_RANGE_URLS = 50;
const MAX_CATEGORY_BRAND_VEHICLE_YEAR_RANGE_URLS = 100;

/** Namespaces whose sitemap counts must match runtime strict predicate. */
const STRICT_GOVERNED_NAMESPACES = new Set([
  SHOP_NAMESPACE.SHOP_CATEGORY,
  SHOP_NAMESPACE.SHOP_BRAND,
  SHOP_NAMESPACE.SHOP_VEHICLE,
  SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
  SHOP_NAMESPACE.SHOP_CATEGORY_BRAND,
  SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
  SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
]);

/**
 * @param {string} slug
 * @returns {Promise<import('./projectShopSitemap.js').ShopSitemapEntry[]>}
 */
export async function loadShopSeoSitemapEntries(slug) {
  const shop = await fetchPublicShopSafe(slug);
  if (!shop) return [];

  const [categoriesPayload, fitments] = await Promise.all([
    fetchPublicShopCategoriesSafe(slug),
    fetchPublicShopFitmentsSafe(slug),
  ]);

  const categories = (categoriesPayload?.items || [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: normalizeShopCategorySlug(c.slug || c.name || String(c.id)),
      productCount: Number(c.productCount) || 0,
    }))
    .filter((row) => Boolean(row.slug));

  const categoryMin = getShopSeoThreshold(SHOP_NAMESPACE.SHOP_CATEGORY).productCountMin;
  const topCategories = categories
    .filter((c) => c.productCount >= categoryMin)
    .sort((a, b) => b.productCount - a.productCount);

  const vehicles = buildFitmentVehicles(fitments);
  const brands = buildFitmentBrands(fitments);
  const vehicleYearRanges = normalizeShopVehicleYearRanges(fitments?.vehicleYearRanges);

  const brandMin = getShopSeoThreshold(SHOP_NAMESPACE.SHOP_BRAND).productCountMin;
  const vehicleMin = getShopSeoThreshold(SHOP_NAMESPACE.SHOP_VEHICLE).productCountMin;
  const yearRangeMin = getShopSeoThreshold(SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE).productCountMin;
  const categoryYearRangeMin = getShopSeoThreshold(
    SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
  ).productCountMin;

  const landingPages = mergeLandingPages([
    ...buildCategoryLandings(topCategories),
    ...buildBrandLandings(brands.slice(0, MAX_BRAND_URLS), brandMin),
    ...buildVehicleLandings(vehicles.slice(0, MAX_VEHICLE_URLS), vehicleMin),
    ...buildCategoryBrandLandings(topCategories, brands, MAX_CATEGORY_BRAND_URLS),
    ...buildCategoryVehicleLandings(topCategories, vehicles, MAX_CATEGORY_VEHICLE_URLS),
    ...buildVehicleYearRangeLandings(
      vehicleYearRanges.slice(0, MAX_VEHICLE_YEAR_RANGE_URLS),
      yearRangeMin,
    ),
    ...buildCategoryBrandVehicleYearRangeLandings(
      topCategories,
      vehicleYearRanges,
      MAX_CATEGORY_BRAND_VEHICLE_YEAR_RANGE_URLS,
      categoryYearRangeMin,
    ),
  ]);

  const catalog = { categories, fitments };
  const governedLandingPages = await filterLandingsByStrictCounts(
    slug,
    landingPages,
    catalog,
  );

  return projectShopSitemap({
    shopSlug: slug,
    shop,
    landingPages: governedLandingPages,
  });
}

/**
 * @param {string} slug
 * @returns {Promise<import('next').MetadataRoute.Sitemap>}
 */
export async function loadShopSeoSitemap(slug) {
  return toNextShopSitemap(await loadShopSeoSitemapEntries(slug));
}

/**
 * @param {Array<{ namespace: string, path: string, productCount: number }>} rows
 */
function mergeLandingPages(rows) {
  const byPath = new Map();
  for (const row of rows) {
    if (!row?.path) continue;
    if (!byPath.has(row.path)) {
      byPath.set(row.path, row);
    }
  }
  return Array.from(byPath.values());
}

/**
 * @param {Array<{ slug: string, name: string, productCount: number }>} categories
 */
function buildCategoryLandings(categories) {
  return categories
    .map((c) => ({
      namespace: SHOP_NAMESPACE.SHOP_CATEGORY,
      path: buildShopCategorySeoPath({
        categorySlug: c.slug,
        categoryName: c.name,
      }),
      productCount: c.productCount,
      categoryId: c.id,
      categoryName: c.name,
      categorySlug: c.slug,
    }))
    .filter((row) => Boolean(row.path));
}

/**
 * Fitment vehicles sorted by brand model-count desc (proxy for fitment volume).
 *
 * @param {object | null | undefined} fitments
 * @returns {Array<{ brand: string, model: string }>}
 */
function buildFitmentVehicles(fitments) {
  const modelsByBrand = fitments?.modelsByBrand || {};
  const brandOrder = Object.entries(modelsByBrand)
    .map(([brand, models]) => ({
      brand: String(brand || "").trim(),
      models: (models || []).map((m) => String(m || "").trim()).filter(Boolean),
    }))
    .filter((row) => row.brand && row.models.length > 0)
    .sort(
      (a, b) =>
        b.models.length - a.models.length ||
        a.brand.localeCompare(b.brand, "vi"),
    );

  const pairs = [];
  for (const { brand, models } of brandOrder) {
    const sortedModels = [...models].sort((a, b) => a.localeCompare(b, "vi"));
    for (const model of sortedModels) {
      pairs.push({ brand, model });
    }
  }
  return pairs;
}

/**
 * @param {object | null | undefined} fitments
 * @returns {string[]}
 */
function buildFitmentBrands(fitments) {
  const modelsByBrand = fitments?.modelsByBrand || {};
  return Object.entries(modelsByBrand)
    .map(([brand, models]) => ({
      brand: String(brand || "").trim(),
      count: (models || []).length,
    }))
    .filter((row) => row.brand && row.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count || a.brand.localeCompare(b.brand, "vi"),
    )
    .map((row) => row.brand);
}

/**
 * @param {unknown} rows
 * @returns {Array<{ brand: string, model: string, yearFrom: number, yearTo: number, productCount: number }>}
 */
function normalizeShopVehicleYearRanges(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      brand: String(row?.brand || "").trim(),
      model: String(row?.model || "").trim(),
      yearFrom: Number(row?.yearFrom),
      yearTo: Number(row?.yearTo),
      productCount: Number(row?.productCount) || 0,
    }))
    .filter(
      (row) =>
        row.brand &&
        row.model &&
        Number.isFinite(row.yearFrom) &&
        Number.isFinite(row.yearTo) &&
        row.yearFrom !== row.yearTo &&
        row.productCount > 0,
    )
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        `${a.brand}\0${a.model}\0${a.yearFrom}`.localeCompare(
          `${b.brand}\0${b.model}\0${b.yearFrom}`,
          "vi",
        ),
    );
}

/**
 * Brand-only vehicle landings — `/phu-tung-{brand}`.
 *
 * @param {string[]} brands
 * @param {number} productCountMin
 */
function buildBrandLandings(brands, productCountMin) {
  return brands
    .map((brand) => ({
      namespace: SHOP_NAMESPACE.SHOP_BRAND,
      path: buildShopVehicleSeoPath({ brand }),
      productCount: productCountMin,
      brand,
    }))
    .filter((row) => Boolean(row.path));
}

/**
 * @param {Array<{ brand: string, model: string }>} vehicles
 * @param {number} productCountMin
 */
function buildVehicleLandings(vehicles, productCountMin) {
  return vehicles
    .map(({ brand, model }) => ({
      namespace: SHOP_NAMESPACE.SHOP_VEHICLE,
      path: buildShopVehicleSeoPath({ brand, model }),
      productCount: productCountMin,
    }))
    .filter((row) => Boolean(row.path));
}

/**
 * @param {Array<{ slug: string, name: string, productCount: number }>} categories
 * @param {string[]} brands
 * @param {number} cap
 */
function buildCategoryBrandLandings(categories, brands, cap) {
  const rows = [];
  outer: for (const category of categories) {
    for (const brand of brands) {
      if (rows.length >= cap) break outer;
      const path = buildShopCategorySeoPath({
        categorySlug: category.slug,
        categoryName: category.name,
        brand,
      });
      if (!path) continue;
      rows.push({
        namespace: SHOP_NAMESPACE.SHOP_CATEGORY_BRAND,
        path,
        productCount: category.productCount,
      });
    }
  }
  return rows;
}

/**
 * @param {Array<{ slug: string, name: string, productCount: number }>} categories
 * @param {Array<{ brand: string, model: string }>} vehicles
 * @param {number} cap
 */
function buildCategoryVehicleLandings(categories, vehicles, cap) {
  const rows = [];
  outer: for (const category of categories) {
    for (const { brand, model } of vehicles) {
      if (rows.length >= cap) break outer;
      const path = buildShopCategorySeoPath({
        categorySlug: category.slug,
        categoryName: category.name,
        brand,
        model,
      });
      if (!path) continue;
      rows.push({
        namespace: SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
        path,
        productCount: category.productCount,
      });
    }
  }
  return rows;
}

/**
 * @param {Array<{ brand: string, model: string, yearFrom: number, yearTo: number, productCount: number }>} ranges
 * @param {number} productCountMin
 */
function buildVehicleYearRangeLandings(ranges, productCountMin) {
  return ranges
    .filter((range) => range.productCount >= productCountMin)
    .map((range) => ({
      namespace: SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
      path: buildShopVehicleSeoPath({
        brand: range.brand,
        model: range.model,
        yearFrom: String(range.yearFrom),
        yearTo: String(range.yearTo),
      }),
      productCount: range.productCount,
    }))
    .filter((row) => Boolean(row.path));
}

/**
 * @param {Array<{ slug: string, name: string, productCount: number }>} categories
 * @param {Array<{ brand: string, model: string, yearFrom: number, yearTo: number, productCount: number }>} ranges
 * @param {number} cap
 * @param {number} productCountMin
 */
function buildCategoryBrandVehicleYearRangeLandings(categories, ranges, cap, productCountMin) {
  const rows = [];
  outer: for (const category of categories) {
    for (const range of ranges) {
      if (rows.length >= cap) break outer;
      if (range.productCount < productCountMin) continue;
      const path = buildShopCategorySeoPath({
        categorySlug: category.slug,
        categoryName: category.name,
        brand: range.brand,
        model: range.model,
        yearFrom: String(range.yearFrom),
        yearTo: String(range.yearTo),
      });
      if (!path) continue;
      rows.push({
        namespace: SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
        path,
        productCount: range.productCount,
      });
    }
  }
  return rows;
}

/**
 * Drop sitemap candidates that fail runtime strict product counts (governance parity).
 *
 * @param {string} slug
 * @param {Array<{ namespace: string, path: string, productCount: number }>} landingPages
 * @param {{ categories?: Array<Record<string, unknown>>, fitments?: object }} catalog
 */
async function filterLandingsByStrictCounts(slug, landingPages, catalog) {
  const passthrough = [];
  const governed = [];

  for (const row of landingPages) {
    if (STRICT_GOVERNED_NAMESPACES.has(row.namespace)) {
      governed.push(row);
    } else {
      passthrough.push(row);
    }
  }

  if (governed.length === 0) return landingPages;

  const categoryOnly = governed.filter((row) => row.namespace === SHOP_NAMESPACE.SHOP_CATEGORY);
  const combo = governed.filter((row) => row.namespace !== SHOP_NAMESPACE.SHOP_CATEGORY);

  const verified = [];

  for (const row of categoryOnly) {
    const entity = landingRowToCountEntity(row);
    if (!entity) continue;
    const { productCount } = await resolveStrictCountForEntity({
      slug,
      entity,
      page: 1,
      perPage: 1,
    });
    if (!isShopSeoSitemapEligible(row.namespace, { productCount })) continue;
    verified.push({ ...row, productCount });
  }

  if (combo.length > 0) {
    const products = await fetchShopProductCatalog(slug);
    for (const row of combo) {
      const parsed = parseShopSeoPath(row.path, catalog);
      if (!parsed) continue;
      const productCount = countProductsForEntity(parsed, products);
      if (!isShopSeoSitemapEligible(row.namespace, { productCount })) continue;
      verified.push({ ...row, productCount });
    }
  }

  return mergeLandingPages([...passthrough, ...verified]);
}

/**
 * Build count entity from landing row metadata (avoid path re-parse collisions).
 *
 * @param {{ namespace?: string, path?: string, categoryId?: number, categoryName?: string, categorySlug?: string }} row
 */
function landingRowToCountEntity(row) {
  if (row.namespace === SHOP_NAMESPACE.SHOP_CATEGORY) {
    return {
      namespace: SHOP_NAMESPACE.SHOP_CATEGORY,
      path: row.path,
      filters: {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        categorySlug: row.categorySlug,
      },
    };
  }
  return null;
}
