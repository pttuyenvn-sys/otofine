/**
 * SEARCH-SINGLE-ENDPOINT-01 — SEO listing paths for search suggest groups.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildListingUrlFromIdentity, buildListingPathCore } = require(
  "../../frontend/components/pages/home/services/listingUrlState.js",
);

/**
 * @param {{ canonical_name?: string, canonical_slug?: string, brand?: string, model?: string, year?: string }} group
 */
export function buildGroupSuggestUrl(group = {}) {
  const categoryName = String(group.canonical_name || "").trim();
  if (!categoryName) return "/";

  return buildListingUrlFromIdentity({
    categoryName,
    hasCategory: true,
    brand: String(group.brand || "").trim(),
    model: String(group.model || "").trim(),
    year: String(group.year || "").trim(),
    canonicalSlug: String(group.canonical_slug || "").trim().toLowerCase(),
  });
}

/**
 * @param {{ brand?: string, model?: string, year?: string, location?: string }} scope
 * @param {string} apiKeyword
 */
export function buildViewAllSuggestUrl(scope = {}, apiKeyword = "") {
  const path = buildListingPathCore({
    category: "",
    brand: scope.brand || "",
    model: scope.model || "",
    year: scope.year || "",
    location: scope.location || "",
  });
  const kw = String(apiKeyword || "").trim();
  if (!kw) return path;
  const params = new URLSearchParams();
  params.set("keyword", kw);
  return `${path}?${params.toString()}`;
}
