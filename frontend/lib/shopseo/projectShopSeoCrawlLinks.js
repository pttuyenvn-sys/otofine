/**
 * SHOP-SEO-LINKGRAPH-01 — Project catalog → crawlable SEO link rows.
 * SHOP-PERF-FIX-01 — Capped direct projection (no discoverShopSeoLandings).
 * SHOP-SEO-LINKGRAPH-02/03 — Preset limits for full vs collection surfaces.
 */

import {
  buildShopCategorySeoPath,
  buildShopVehicleSeoPath,
  normalizeShopCategorySlug,
} from "./buildShopSeoPath.js";
import { SHOP_NAMESPACE } from "./namespace.js";
import {
  normalizeCatalogCategories,
  normalizeFitmentBrandRows,
  pushCrawlLink,
  SHOP_CRAWL_LIMITS,
} from "./projectShopSeoCrawlLinks.shared.js";

/**
 * @typedef {{ href: string, label: string, path: string, namespace: string }} ShopSeoCrawlLink
 */

/**
 * @param {object} input
 * @param {string} [input.shopBasePath]
 * @param {Array<{ slug?: string, name?: string, productCount?: number }>} [input.categories]
 * @param {object} [input.fitments]
 * @param {Array<object>} [input.vehicleYearRanges]
 * @param {{ categories?: number, vehicles?: number, years?: number }} [input.limits]
 * @param {'full' | 'collection'} [input.preset]
 * @returns {{ categories: ShopSeoCrawlLink[], vehicles: ShopSeoCrawlLink[], years: ShopSeoCrawlLink[] }}
 */
export function projectShopSeoCrawlLinks(input = {}) {
  const shopBasePath = String(input.shopBasePath || "");
  const presetLimits =
    input.preset === "collection" ? SHOP_CRAWL_LIMITS.collection : SHOP_CRAWL_LIMITS.full;
  const limits = { ...presetLimits, ...(input.limits || {}) };
  const categories = normalizeCatalogCategories(input.categories);
  const brandRows = normalizeFitmentBrandRows(input.fitments);
  const fitmentYears = Array.isArray(input.fitments?.years)
    ? input.fitments.years
    : [];
  const yearRanges = Array.isArray(input.vehicleYearRanges)
    ? input.vehicleYearRanges
    : [];

  const categoryLinks = [];
  const vehicleLinks = [];
  const yearLinks = [];
  const seen = new Set();

  for (const cat of categories) {
    if (categoryLinks.length >= limits.categories) break;
    const categorySlug = normalizeShopCategorySlug(cat.slug || cat.name || "");
    if (!categorySlug) continue;
    const filters = { categorySlug, categoryName: cat.name };
    pushCrawlLink(
      categoryLinks,
      shopBasePath,
      buildShopCategorySeoPath(filters),
      SHOP_NAMESPACE.SHOP_CATEGORY,
      filters,
      seen,
    );
  }

  for (const row of brandRows) {
    if (vehicleLinks.length >= limits.vehicles) break;
    const brand = row.brand;
    if (!brand) continue;
    const brandFilters = { brand };
    pushCrawlLink(
      vehicleLinks,
      shopBasePath,
      buildShopVehicleSeoPath(brandFilters),
      SHOP_NAMESPACE.SHOP_VEHICLE,
      brandFilters,
      seen,
    );

    for (const m of row.models || []) {
      if (vehicleLinks.length >= limits.vehicles) break;
      const model = typeof m === "string" ? m : m?.model;
      if (!model) continue;
      const filters = { brand, model };
      pushCrawlLink(
        vehicleLinks,
        shopBasePath,
        buildShopVehicleSeoPath(filters),
        SHOP_NAMESPACE.SHOP_VEHICLE,
        filters,
        seen,
      );
    }
  }

  for (const cat of categories) {
    if (vehicleLinks.length >= limits.vehicles) break;
    const categorySlug = normalizeShopCategorySlug(cat.slug || cat.name || "");
    if (!categorySlug) continue;
    const baseFilters = { categorySlug, categoryName: cat.name };

    for (const row of brandRows) {
      if (vehicleLinks.length >= limits.vehicles) break;
      const brand = row.brand;
      if (!brand) continue;
      const brandFilters = { ...baseFilters, brand };
      pushCrawlLink(
        vehicleLinks,
        shopBasePath,
        buildShopCategorySeoPath(brandFilters),
        SHOP_NAMESPACE.SHOP_CATEGORY_BRAND,
        brandFilters,
        seen,
      );

      for (const m of row.models || []) {
        if (vehicleLinks.length >= limits.vehicles) break;
        const model = typeof m === "string" ? m : m?.model;
        if (!model) continue;
        const filters = { ...baseFilters, brand, model };
        pushCrawlLink(
          vehicleLinks,
          shopBasePath,
          buildShopCategorySeoPath(filters),
          SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE,
          filters,
          seen,
        );
      }
    }
  }

  if (limits.years > 0) {
    const vehicleYearCap =
      yearRanges.length > 0 ? Math.ceil(limits.years / 2) : limits.years;
    const categoryYearCap = Math.max(0, limits.years - vehicleYearCap);
    let vehicleYearCount = 0;
    let categoryYearCount = 0;

    for (const range of yearRanges) {
      if (vehicleYearCount >= vehicleYearCap) break;
      const yearFrom = String(range.yearFrom ?? "").trim();
      const yearTo = String(range.yearTo ?? "").trim();
      if (!yearFrom || !yearTo || yearFrom === yearTo) continue;
      const brand = String(range.brand || "").trim();
      const model = String(range.model || "").trim();
      if (!brand || !model) continue;
      const rangeFilters = { brand, model, yearFrom, yearTo };
      if (
        pushCrawlLink(
          yearLinks,
          shopBasePath,
          buildShopVehicleSeoPath(rangeFilters),
          SHOP_NAMESPACE.SHOP_VEHICLE_YEAR_RANGE,
          rangeFilters,
          seen,
        )
      ) {
        vehicleYearCount += 1;
      }
    }

    if (categoryYearCap > 0 && categories.length > 0) {
      outer: for (let pass = 0; pass < yearRanges.length; pass += 1) {
        for (const cat of categories) {
          if (categoryYearCount >= categoryYearCap) break outer;
          const categorySlug = normalizeShopCategorySlug(cat.slug || cat.name || "");
          if (!categorySlug) continue;
          const baseFilters = { categorySlug, categoryName: cat.name };
          const range = yearRanges[pass];
          if (!range) break outer;
          const yearFrom = String(range.yearFrom ?? "").trim();
          const yearTo = String(range.yearTo ?? "").trim();
          if (!yearFrom || !yearTo || yearFrom === yearTo) continue;
          const brand = String(range.brand || "").trim();
          const model = String(range.model || "").trim();
          if (!brand || !model) continue;
          const filters = { ...baseFilters, brand, model, yearFrom, yearTo };
          if (
            pushCrawlLink(
              yearLinks,
              shopBasePath,
              buildShopCategorySeoPath(filters),
              SHOP_NAMESPACE.SHOP_CATEGORY_BRAND_VEHICLE_YEAR_RANGE,
              filters,
              seen,
            )
          ) {
            categoryYearCount += 1;
          }
        }
      }
    }

    if (yearRanges.length === 0) {
      for (const cat of categories) {
        if (yearLinks.length >= limits.years) break;
        const categorySlug = normalizeShopCategorySlug(cat.slug || cat.name || "");
        if (!categorySlug) continue;
        const baseFilters = { categorySlug, categoryName: cat.name };

        for (const row of brandRows) {
          if (yearLinks.length >= limits.years) break;
          const brand = row.brand;
          if (!brand) continue;

          for (const m of row.models || []) {
            if (yearLinks.length >= limits.years) break;
            const model = typeof m === "string" ? m : m?.model;
            if (!model) continue;

            for (const year of fitmentYears) {
              if (yearLinks.length >= limits.years) break;
              const filters = { ...baseFilters, brand, model, year: String(year) };
              pushCrawlLink(
                yearLinks,
                shopBasePath,
                buildShopCategorySeoPath(filters),
                SHOP_NAMESPACE.SHOP_CATEGORY_VEHICLE_YEAR,
                filters,
                seen,
              );
            }
          }
        }
      }
    }
  }

  return {
    categories: categoryLinks,
    vehicles: vehicleLinks,
    years: yearLinks,
  };
}
