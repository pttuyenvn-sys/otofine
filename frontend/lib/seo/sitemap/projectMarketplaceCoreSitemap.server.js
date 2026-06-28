import {
  buildSitemapListingPath,
  buildSitemapListingSlug,
} from "@/lib/listing/adapters/sitemapListingPath";
import { getSiteUrl } from "@/lib/seo/siteUrl";
import {
  gateCategoryBrandEntry,
  gateCategoryBrandVehicleYearRangeEntry,
  gateCategoryEntry,
  gateCbmEntry,
  gateVehicleEntry,
  gateVehicleYearEntry,
  gateVehicleYearRangeEntry,
} from "@/lib/seo/sitemapGovernance.server";
import {
  buildMarketplaceGovernanceMaps,
  loadMarketplaceSitemapData,
} from "./loadMarketplaceSitemapData.server.js";

/**
 * @typedef {import('next').MetadataRoute.Sitemap[number]} SitemapRow
 */

function addListingPath(add, base, row, opts = {}) {
  const path = buildSitemapListingPath(row);
  if (!path || path === "/") return;
  add(`${base}${path}`, opts);
}

/**
 * @returns {Promise<import('next').MetadataRoute.Sitemap>}
 */
export async function projectMarketplaceCoreSitemap() {
  const base = getSiteUrl();
  const now = new Date();
  const seen = new Set();
  /** @type {import('next').MetadataRoute.Sitemap} */
  const out = [];

  /**
   * @param {string} url
   * @param {Partial<SitemapRow>} [opts]
   */
  function add(url, opts = {}) {
    if (seen.has(url)) return;
    seen.add(url);
    out.push({
      url,
      lastModified: opts.lastModified || now,
      changeFrequency: opts.changeFrequency || "weekly",
      priority: opts.priority ?? 0.6,
    });
  }

  const { remote, categoryRows } = await loadMarketplaceSitemapData();
  const { bmCountMap, brandCountMap } = buildMarketplaceGovernanceMaps(remote);

  add(base, { changeFrequency: "daily", priority: 1 });

  const brandAdded = new Set();
  for (const bm of remote.brandModels || []) {
    const br = bm.brand;
    const mo = bm.model;
    if (!br || !mo) continue;

    const bmCount = bmCountMap.get(`${br}\0${mo}`) ?? 0;
    if (gateVehicleEntry({ productCount: bmCount })) {
      addListingPath(add, base, { brand: br, model: mo }, { priority: 0.8 });
    }

    const sb = buildSitemapListingSlug({ brand: br });
    if (!brandAdded.has(sb)) {
      brandAdded.add(sb);
      const brandCount = brandCountMap.get(br) ?? 0;
      if (gateVehicleEntry({ productCount: brandCount })) {
        add(`${base}/${sb}`, { priority: 0.78 });
      }
    }
  }

  /** @type {Map<string, number>} */
  const ownerCategoryRows = new Map();
  for (const raw of categoryRows) {
    const count = Number(raw?.product_count) || 0;
    const categoryName = String(
      raw?.canonical_name || raw?.category_name || "",
    ).trim();
    if (!categoryName) continue;
    ownerCategoryRows.set(
      categoryName,
      (ownerCategoryRows.get(categoryName) || 0) + count,
    );
  }
  for (const [categoryName, totalProductCount] of ownerCategoryRows) {
    if (!gateCategoryEntry({ productCount: totalProductCount })) continue;
    addListingPath(add, base, { category: categoryName }, { priority: 0.65 });
  }

  for (const row of remote.categoryBrandListings || []) {
    const categorySlug = String(row?.categorySlug || "").trim().toLowerCase();
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    if (!categorySlug || !brandSlug) continue;

    const productCount = Number(row?.productCount) || 0;
    if (!gateCategoryBrandEntry({ productCount })) continue;

    const slug = `${categorySlug}-${brandSlug}`;
    add(`${base}/${slug}`, { priority: 0.64 });
  }

  for (const row of remote.cbmListings || []) {
    const categoryName = String(row?.category || "").trim();
    const brand = String(row?.brand || "").trim();
    const model = String(row?.model || "").trim();
    if (!categoryName || !brand || !model) continue;

    const productCount = Number(row?.productCount) || 0;
    if (!gateCbmEntry({ productCount })) continue;

    const qualityClass = String(row?.qualityClass || "").toUpperCase();
    const priority = qualityClass === "A" ? 0.68 : 0.62;
    addListingPath(
      add,
      base,
      { category: categoryName, brand, model },
      { priority },
    );
  }

  for (const row of remote.bmyListings || []) {
    const brand = String(row?.brand || "").trim();
    const model = String(row?.model || "").trim();
    const year = String(row?.year || "").trim();
    if (!brand || !model || !year) continue;

    const productCount = Number(row?.productCount) || 0;
    if (!gateVehicleYearEntry({ productCount })) continue;

    const slug = buildSitemapListingSlug({ brand, model, year });
    if (!slug) continue;

    add(`${base}/${slug}`, { priority: 0.58 });
  }

  for (const row of remote.bmyRangeListings || []) {
    const brand = String(row?.brand || "").trim();
    const model = String(row?.model || "").trim();
    const yearFrom = Number(row?.yearFrom);
    const yearTo = Number(row?.yearTo);
    if (!brand || !model || !Number.isFinite(yearFrom) || !Number.isFinite(yearTo)) {
      continue;
    }

    const productCount = Number(row?.productCount) || 0;
    if (!gateVehicleYearRangeEntry({ productCount })) continue;

    const slug = buildSitemapListingSlug({ brand, model, yearFrom, yearTo });
    if (!slug) continue;

    add(`${base}/${slug}`, { priority: 0.57 });
  }

  for (const row of remote.cbmyRangeListings || []) {
    const categorySlug = String(row?.categorySlug || "").trim().toLowerCase();
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    const modelSlug = String(row?.modelSlug || "").trim().toLowerCase();
    const yearFrom = Number(row?.yearFrom);
    const yearTo = Number(row?.yearTo);
    if (
      !categorySlug ||
      !brandSlug ||
      !modelSlug ||
      !Number.isFinite(yearFrom) ||
      !Number.isFinite(yearTo)
    ) {
      continue;
    }

    const productCount = Number(row?.productCount) || 0;
    if (!gateCategoryBrandVehicleYearRangeEntry({ productCount })) continue;

    const slug = `${categorySlug}-${brandSlug}-${modelSlug}-${yearFrom}-${yearTo}`;
    add(`${base}/${slug}`, { priority: 0.56 });
  }

  return out;
}
