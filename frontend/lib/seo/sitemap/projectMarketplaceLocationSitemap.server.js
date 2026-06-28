import { buildSitemapListingPath } from "@/lib/listing/adapters/sitemapListingPath";
import { getSiteUrl } from "@/lib/seo/siteUrl";
import {
  gateBrandLocationEntry,
  gateBrandVehicleLocationEntry,
  gateBrandVehicleYearRangeLocationEntry,
  gateCategoryBrandLocationEntry,
  gateCategoryBrandVehicleLocationEntry,
  gateCategoryBrandVehicleYearRangeLocationEntry,
  gateCategoryLocationEntry,
  gateLocationEntry,
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
export async function projectMarketplaceLocationSitemap() {
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

  const { remote } = await loadMarketplaceSitemapData();
  const { inv } = buildMarketplaceGovernanceMaps(remote);

  for (const row of inv.locationHubs || []) {
    const location = String(row?.location || "").trim();
    if (!location) continue;
    const metrics = {
      productCount: Number(row.productCount) || 0,
      sellerCount: Number(row.sellerCount) || 0,
    };
    if (!gateLocationEntry(metrics)) continue;

    addListingPath(add, base, { location }, { priority: 0.6 });
  }

  for (const row of inv.categoryLocationPairs || []) {
    const categoryName = String(row?.category || "").trim();
    const location = String(row?.location || "").trim();
    if (!categoryName || !location) continue;
    const metrics = {
      productCount: Number(row.productCount) || 0,
      sellerCount: Number(row.sellerCount) || 0,
    };
    if (!gateCategoryLocationEntry(metrics)) continue;

    addListingPath(
      add,
      base,
      { category: categoryName, location },
      { priority: 0.55 },
    );
  }

  for (const row of remote.brandLocationListings || []) {
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    const locationSlug = String(row?.locationSlug || "").trim().toLowerCase();
    if (!brandSlug || !locationSlug) continue;

    const productCount = Number(row?.productCount) || 0;
    if (!gateBrandLocationEntry({ productCount })) continue;

    const slug = `phu-tung-${brandSlug}-tai-${locationSlug}`;
    add(`${base}/${slug}`, { priority: 0.59 });
  }

  for (const row of remote.brandVehicleLocationListings || []) {
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    const modelSlug = String(row?.modelSlug || "").trim().toLowerCase();
    const locationSlug = String(row?.locationSlug || "").trim().toLowerCase();
    if (!brandSlug || !modelSlug || !locationSlug) continue;

    const productCount = Number(row?.productCount) || 0;
    if (!gateBrandVehicleLocationEntry({ productCount })) continue;

    const slug = `phu-tung-${brandSlug}-${modelSlug}-tai-${locationSlug}`;
    add(`${base}/${slug}`, { priority: 0.585 });
  }

  for (const row of remote.brandVehicleYearRangeLocationListings || []) {
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    const modelSlug = String(row?.modelSlug || "").trim().toLowerCase();
    const locationSlug = String(row?.locationSlug || "").trim().toLowerCase();
    const yearFrom = Number(row?.yearFrom);
    const yearTo = Number(row?.yearTo);
    if (
      !brandSlug ||
      !modelSlug ||
      !locationSlug ||
      !Number.isFinite(yearFrom) ||
      !Number.isFinite(yearTo)
    ) {
      continue;
    }

    const productCount = Number(row?.productCount) || 0;
    if (!gateBrandVehicleYearRangeLocationEntry({ productCount })) continue;

    const slug = `phu-tung-${brandSlug}-${modelSlug}-${yearFrom}-${yearTo}-tai-${locationSlug}`;
    add(`${base}/${slug}`, { priority: 0.583 });
  }

  for (const row of remote.categoryBrandVehicleYearRangeLocationListings || []) {
    const categorySlug = String(row?.categorySlug || "").trim().toLowerCase();
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    const modelSlug = String(row?.modelSlug || "").trim().toLowerCase();
    const locationSlug = String(row?.locationSlug || "").trim().toLowerCase();
    const yearFrom = Number(row?.yearFrom);
    const yearTo = Number(row?.yearTo);
    if (
      !categorySlug ||
      !brandSlug ||
      !modelSlug ||
      !locationSlug ||
      !Number.isFinite(yearFrom) ||
      !Number.isFinite(yearTo)
    ) {
      continue;
    }

    const productCount = Number(row?.productCount) || 0;
    if (!gateCategoryBrandVehicleYearRangeLocationEntry({ productCount })) continue;

    const slug = `${categorySlug}-${brandSlug}-${modelSlug}-${yearFrom}-${yearTo}-tai-${locationSlug}`;
    add(`${base}/${slug}`, { priority: 0.5825 });
  }

  for (const row of remote.categoryBrandLocationListings || []) {
    const categorySlug = String(row?.categorySlug || "").trim().toLowerCase();
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    const locationSlug = String(row?.locationSlug || "").trim().toLowerCase();
    if (!categorySlug || !brandSlug || !locationSlug) continue;

    const productCount = Number(row?.productCount) || 0;
    if (!gateCategoryBrandLocationEntry({ productCount })) continue;

    const slug = `${categorySlug}-${brandSlug}-tai-${locationSlug}`;
    add(`${base}/${slug}`, { priority: 0.582 });
  }

  for (const row of remote.categoryBrandVehicleLocationListings || []) {
    const categorySlug = String(row?.categorySlug || "").trim().toLowerCase();
    const brandSlug = String(row?.brandSlug || "").trim().toLowerCase();
    const modelSlug = String(row?.modelSlug || "").trim().toLowerCase();
    const locationSlug = String(row?.locationSlug || "").trim().toLowerCase();
    if (!categorySlug || !brandSlug || !modelSlug || !locationSlug) continue;

    const productCount = Number(row?.productCount) || 0;
    if (!gateCategoryBrandVehicleLocationEntry({ productCount })) continue;

    const slug = `${categorySlug}-${brandSlug}-${modelSlug}-tai-${locationSlug}`;
    add(`${base}/${slug}`, { priority: 0.581 });
  }

  return out;
}
