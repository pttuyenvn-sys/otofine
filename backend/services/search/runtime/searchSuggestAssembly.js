/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — shared suggest response assembly (SEO URLs unchanged).
 */

import { normalizeListingQuery } from "../../../utils/listingQueryNormalize.js";
import { buildSuggestViewAllLabel } from "../../../utils/buildSuggestViewAllLabel.js";
import {
  buildGroupSuggestUrl,
  buildViewAllSuggestUrl,
} from "../../../utils/listingSuggestUrls.js";

/**
 * @param {Record<string, unknown>} rawQuery
 * @param {Array<{ group: object, products: object[] }>} blocks
 * @param {object[]} categoryGroups
 */
export function assembleSearchSuggestResponse(rawQuery, blocks, categoryGroups) {
  const keyword = String(rawQuery.query || rawQuery.keyword || rawQuery.q || "").trim();
  if (!keyword) {
    return { groups: [], viewAll: { label: "", url: "/" }, categories: [] };
  }

  const listing = normalizeListingQuery(rawQuery);
  const scope = {
    brand: listing.brand || "",
    model: listing.model || "",
    year: listing.year != null ? String(listing.year) : "",
    location: listing.location || "",
  };

  const groups = (blocks || []).map((block) => {
    const g = block.group || {};
    return {
      title: g.title,
      count: Number(g.total_count) || 0,
      url: buildGroupSuggestUrl(g),
      canonical_name: g.canonical_name,
      canonical_slug: g.canonical_slug,
      brand: g.brand,
      model: g.model,
      year: g.year,
      products: Array.isArray(block.products) ? block.products : [],
    };
  });

  return {
    groups,
    viewAll: {
      label: buildSuggestViewAllLabel(scope, keyword),
      url: buildViewAllSuggestUrl(scope, keyword),
    },
    categories: categoryGroups || [],
  };
}

/**
 * @param {Array<{ group: object, products: object[] }>} blocks
 */
export function assembleSearchPreviewBatch(blocks) {
  return (blocks || []).map((block) => ({
    group: {
      title: block.group?.title,
      canonical_name: block.group?.canonical_name,
      canonical_slug: block.group?.canonical_slug,
      brand: block.group?.brand,
      model: block.group?.model,
      year: block.group?.year,
      total_count: block.group?.total_count,
    },
    products: block.products || [],
  }));
}
