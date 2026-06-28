import { cache } from "react";

import { buildCategoryOwnerPathFromState } from "@/lib/seo/buildCategoryOwnerPath.js";
import { buildPageTitle } from "@/components/pages/home/services/listingSeoState";
import { loadMarketplaceSitemapData } from "@/lib/seo/sitemap/loadMarketplaceSitemapData.server.js";
import { resolveDiscoveryVehicleLinkLimit } from "@/lib/discovery/discoveryCategoryBrandVehicleLimits.js";
import { brandProductCount } from "@/lib/discovery/rankDiscoveryBrandRows.js";
import { rankDiscoveryVehicleRows } from "@/lib/discovery/rankDiscoveryVehicleRows.js";
import { isIndexable, NAMESPACE } from "@/lib/seo/urlGovernance.js";

/**
 * @typedef {{ href: string, label: string, brand: string, model: string, productCount: number, categoryName: string }} CategoryBrandDiscoveryVehicleLink
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
 * @param {unknown} row
 * @returns {boolean}
 */
function isEligibleCbmDiscoveryRow(row) {
  const productCount = brandProductCount(row);
  if (productCount <= 0) return false;
  return isIndexable(NAMESPACE.CBM, { productCount });
}

/**
 * Top N vehicle discovery links for a category × brand page.
 * Inventory-backed cbmListings; indexable CBM only; adaptive cap.
 *
 * @param {{ categoryName?: string, canonicalSlug?: string, brand?: string }} input
 * @returns {Promise<CategoryBrandDiscoveryVehicleLink[]>}
 */
export const loadCategoryBrandDiscoveryVehicleLinks = cache(
  async function loadCategoryBrandDiscoveryVehicleLinks(input) {
    const categoryName = String(input?.categoryName || "").trim();
    const canonicalSlug = String(input?.canonicalSlug || "").trim().toLowerCase();
    const brand = String(input?.brand || "").trim();
    if (!categoryName || !canonicalSlug || !brand) return [];

    const { remote } = await loadMarketplaceSitemapData();
    const categoryCore = categorySlugCoreFromCanonical(canonicalSlug);

    /** @type {Map<string, Record<string, unknown>>} */
    const byModel = new Map();

    for (const row of remote.cbmListings || []) {
      const rowCategory = String(row?.category || "").trim();
      const rowCore = String(row?.categorySlug || "").trim().toLowerCase();
      if (rowCore !== categoryCore && rowCategory !== categoryName) continue;

      const rowBrand = String(row?.brand || "").trim();
      if (rowBrand !== brand) continue;

      const model = String(row?.model || "").trim();
      if (!model) continue;
      if (!isEligibleCbmDiscoveryRow(row)) continue;

      const prev = byModel.get(model);
      if (!prev || brandProductCount(row) > brandProductCount(prev)) {
        byModel.set(model, { ...row, brand: rowBrand, model });
      }
    }

    const eligible = [...byModel.values()];
    if (!eligible.length) return [];

    const limit = resolveDiscoveryVehicleLinkLimit(eligible.length);
    const ranked = rankDiscoveryVehicleRows(eligible).slice(0, limit);

    /** @type {CategoryBrandDiscoveryVehicleLink[]} */
    const out = [];
    for (const row of ranked) {
      const model = String(row.model || "").trim();
      if (!model) continue;

      const href = buildCategoryOwnerPathFromState({
        categoryName,
        canonicalSlug,
        brand,
        model,
      });
      const label = buildPageTitle({
        categoryName,
        hasCategory: true,
        brand,
        model,
      });
      const productCount = brandProductCount(row);

      if (!href || href === "/" || !label) continue;

      out.push({
        href,
        label,
        brand,
        model,
        productCount,
        categoryName,
      });
    }

    return out;
  },
);
