import { getBmyRangeSitemapListings } from "../utils/bmyRangeSitemapQuality.server.js";
import { getCbmyRangeSitemapListings } from "../utils/cbmyRangeSitemapQuality.server.js";
import { getOrSetCache } from "./listCache.service.js";

/** Align with frontend `next.revalidate` on year-range inventory (1 h). */
export const YEAR_RANGE_LINKS_CACHE_TTL_MS = 60 * 60 * 1000;

const CACHE_KEY = "seo:year-range-links:v1";

/**
 * @param {object} row
 */
function slimBmyRow(row) {
  return {
    slug: row.slug,
    brand: row.brand,
    model: row.model,
    yearFrom: row.yearFrom,
    yearTo: row.yearTo,
    productCount: row.productCount,
  };
}

/**
 * @param {object} row
 */
function slimCbmyRow(row) {
  return {
    slug: row.slug,
    categorySlug: row.categorySlug,
    brand: row.brand,
    model: row.model,
    yearFrom: row.yearFrom,
    yearTo: row.yearTo,
    productCount: row.productCount,
  };
}

async function loadYearRangeLinksPayload() {
  const [bmyRangeListings, cbmyRangeListings] = await Promise.all([
    getBmyRangeSitemapListings(),
    getCbmyRangeSitemapListings(),
  ]);

  return {
    bmyRangeListings: bmyRangeListings.map(slimBmyRow),
    // Rows below productCount 2 never pass CATEGORY_BRAND_VEHICLE_YEAR_RANGE gate in the UI.
    cbmyRangeListings: cbmyRangeListings
      .filter((row) => Number(row.productCount) >= 2)
      .map(slimCbmyRow),
  };
}

/**
 * Slim BMY_RANGE + CBMY_RANGE inventory for listing year-range crawl links only.
 * @returns {Promise<{ bmyRangeListings: object[], cbmyRangeListings: object[] }>}
 */
export function getYearRangeLinksData() {
  return getOrSetCache(
    CACHE_KEY,
    YEAR_RANGE_LINKS_CACHE_TTL_MS,
    loadYearRangeLinksPayload,
  );
}
