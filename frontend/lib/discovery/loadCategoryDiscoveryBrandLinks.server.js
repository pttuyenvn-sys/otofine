import { cache } from "react";

import { buildCategoryOwnerPathFromState } from "@/lib/seo/buildCategoryOwnerPath.js";
import { buildPageTitle } from "@/components/pages/home/services/listingSeoState";
import { loadMarketplaceSitemapData } from "@/lib/seo/sitemap/loadMarketplaceSitemapData.server.js";
import { DISCOVERY_CATEGORY_BRAND_LINK_LIMIT } from "@/lib/discovery/discoveryCategoryBrandLimits.js";
import { rankDiscoveryBrandRows } from "@/lib/discovery/rankDiscoveryBrandRows.js";

/**
 * @typedef {{ href: string, label: string, brand: string, productCount: number, categoryName: string }} CategoryDiscoveryBrandLink
 */

/**
 * @param {string} canonicalSlug
 * @returns {string}
 */
function categorySlugCoreFromCanonical(canonicalSlug) {
  const slug = String(canonicalSlug || "").trim().toLowerCase();
  if (!slug) return "";
  return slug.endsWith("-o-to") ? slug.slice(0, -"-o-to".length) : slug;
}

/**
 * Top N brand discovery links for a pure category page.
 * Inventory-backed categoryBrandListings; skips brands without CBM vehicle children.
 *
 * @param {{ categoryName?: string, canonicalSlug?: string }} input
 * @returns {Promise<CategoryDiscoveryBrandLink[]>}
 */
export const loadCategoryDiscoveryBrandLinks = cache(
  async function loadCategoryDiscoveryBrandLinks(input) {
    const categoryName = String(input?.categoryName || "").trim();
    const canonicalSlug = String(input?.canonicalSlug || "").trim().toLowerCase();
    if (!categoryName || !canonicalSlug) return [];

    const { remote } = await loadMarketplaceSitemapData();
    const categoryCore = categorySlugCoreFromCanonical(canonicalSlug);

    /** @type {Set<string>} */
    const brandsWithVehicles = new Set();
    for (const row of remote.cbmListings || []) {
      if (String(row?.category || "").trim() !== categoryName) continue;
      const brand = String(row?.brand || "").trim();
      if (!brand) continue;
      if (Number(row?.productCount) > 0) {
        brandsWithVehicles.add(brand);
      }
    }

    if (!brandsWithVehicles.size) return [];

    /** @type {Map<string, Record<string, unknown>>} */
    const byBrand = new Map();
    for (const row of remote.categoryBrandListings || []) {
      const rowCategory = String(row?.category || "").trim();
      const rowCore = String(row?.categorySlug || "").trim().toLowerCase();
      if (rowCore !== categoryCore && rowCategory !== categoryName) continue;

      const brand = String(row?.brand || "").trim();
      const productCount = Number(row?.productCount) || 0;
      if (!brand || productCount <= 0) continue;
      if (!brandsWithVehicles.has(brand)) continue;

      const prev = byBrand.get(brand);
      if (!prev || productCount > Number(prev.productCount)) {
        byBrand.set(brand, { ...row, brand, productCount });
      }
    }

    const ranked = rankDiscoveryBrandRows([...byBrand.values()]).slice(
      0,
      DISCOVERY_CATEGORY_BRAND_LINK_LIMIT,
    );

    /** @type {CategoryDiscoveryBrandLink[]} */
    const out = [];
    for (const row of ranked) {
      const brand = String(row.brand || "").trim();
      if (!brand) continue;

      const href = buildCategoryOwnerPathFromState({
        categoryName,
        canonicalSlug,
        brand,
      });
      const label = buildPageTitle({
        categoryName,
        hasCategory: true,
        brand,
      });
      const productCount = Number(row.productCount) || 0;

      if (!href || href === "/" || !label) continue;

      out.push({
        href,
        label,
        brand,
        productCount,
        categoryName,
      });
    }

    return out;
  },
);
