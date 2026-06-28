/**
 * Resolves structured facets from HTTP query params only (parser output via API).
 * Does not re-parse category/brand/model from keyword — ranking/parser unchanged.
 */

import { normalizeListingQuery, normalizePartNumber } from "../../../utils/listingQueryNormalize.js";
import { normalizeSearchText } from "../../../utils/keywordRelevanceRanking.js";

function isPartNumberToken(value) {
  const raw = String(value || "").trim();
  if (raw.length < 5) return false;
  if (!/(?=.*\d)/.test(raw)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(raw);
}

/**
 * @param {Record<string, unknown>} rawQuery
 * @param {string} keyword
 */
export async function resolveSearchFacets(rawQuery, keyword) {
  const listing = normalizeListingQuery(rawQuery);
  const kw = String(keyword || listing.keyword || "").trim();

  let partNumber = "";
  let slugCandidate = "";
  if (isPartNumberToken(kw)) {
    partNumber = kw;
  }

  const brand = String(listing.brand || "").trim();
  const model = String(listing.model || "").trim();
  const year = listing.year != null ? listing.year : undefined;
  const category = String(listing.category || "").trim();

  const slugLike = !partNumber && kw.match(/^[a-z0-9]+(?:-[a-z0-9]+)+$/i);
  if (slugLike && kw.length >= 8) {
    slugCandidate = kw;
  }

  const textQuery = partNumber || slugCandidate ? "" : normalizeSearchText(kw);

  return {
    partNumber,
    slugCandidate,
    brand,
    model,
    year,
    category,
    textQuery,
    location: String(listing.location || listing.city || "").trim(),
    cityId: listing.cityId,
    hasStructuredFacets: Boolean(brand || model || year != null || category),
    normalizedPartNumber: partNumber ? normalizePartNumber(partNumber) : "",
  };
}
