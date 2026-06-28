import { cache } from "react";

import { readCategoryFields } from "@/lib/seo/buildProductCategoryLinks.js";
import { buildCategoryOwnerPathFromState } from "@/lib/seo/buildCategoryOwnerPath.js";
import { fetchProductCategoryRows } from "@/lib/seo/fetchProductCategoryCatalog.server.js";
import { DISCOVERY_CATEGORY_LINK_LIMIT } from "@/lib/discovery/discoveryCategoryLimits.js";
import {
  categoryProductCount,
  rankDiscoveryCategoryRows,
} from "@/lib/discovery/rankDiscoveryCategoryRows.js";

/**
 * @typedef {{ href: string, label: string, categoryName: string, productCount: number }} DiscoveryCategoryLink
 */

function categoryLabel(row, categoryName) {
  return String(
    row?.canonical_name || row?.category_name || categoryName || "",
  ).trim();
}

/**
 * Top N category discovery links from cached /product-categories catalog.
 * URLs via buildCategoryOwnerPathFromState — no hardcoded paths.
 *
 * @returns {Promise<DiscoveryCategoryLink[]>}
 */
export const loadTopDiscoveryCategoryLinks = cache(
  async function loadTopDiscoveryCategoryLinks() {
    const rows = await fetchProductCategoryRows();
    if (!rows.length) return [];

    const sorted = rankDiscoveryCategoryRows(rows);

    /** @type {DiscoveryCategoryLink[]} */
    const out = [];
    const seenSlugs = new Set();

    for (const row of sorted) {
      if (Number(row?.is_active ?? 1) === 0) continue;

      const { categoryName, canonicalSlug } = readCategoryFields(row);
      if (!categoryName || !canonicalSlug) continue;
      if (seenSlugs.has(canonicalSlug)) continue;

      const href = buildCategoryOwnerPathFromState({
        categoryName,
        canonicalSlug,
      });
      const label = categoryLabel(row, categoryName);

      if (!href || href === "/" || !label) continue;

      seenSlugs.add(canonicalSlug);
      out.push({
        href,
        label,
        categoryName,
        productCount: categoryProductCount(row),
      });

      if (out.length >= DISCOVERY_CATEGORY_LINK_LIMIT) break;
    }

    return out;
  },
);
