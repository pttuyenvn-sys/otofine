/**
 * SEARCH-RANKING-PARITY-01 — filter ranked rows by structured facets (mirrors indexSearchClauses).
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";

/**
 * @param {object} row
 * @param {object} facets
 * @param {Record<string, unknown>} [rawQuery]
 */
export function rowMatchesStructuredFacets(row, facets, rawQuery = {}) {
  const cityId = facets.cityId ?? rawQuery.cityId;
  if (cityId != null) {
    const cid = Number(cityId);
    if (Number.isFinite(cid) && cid > 0 && Number(row.location_id) !== cid) return false;
  } else if (facets.location) {
    const loc = foldVi(row.location_name || "");
    if (!loc.includes(foldVi(facets.location))) return false;
  }

  if (facets.brand && foldVi(row.brand_name) !== foldVi(facets.brand)) return false;
  if (facets.model && foldVi(row.model_name) !== foldVi(facets.model)) return false;

  if (facets.year != null) {
    const yearStr = String(facets.year).trim();
    let lo;
    let hi;
    if (yearStr.includes("-")) {
      const parts = yearStr.split("-").map((p) => Number(p.trim()));
      lo = Math.min(parts[0], parts[1]);
      hi = Math.max(parts[0], parts[1]);
    } else if (Number.isFinite(Number(yearStr))) {
      lo = hi = Number(yearStr);
    }
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      const yf = Number(row.year_from) || 0;
      const yt = Number(row.year_to) || 0;
      if (!((yf === 0 || yf <= hi) && (yt === 0 || yt >= lo))) return false;
    }
  }

  if (facets.category) {
    const cf = foldVi(facets.category);
    if (!foldVi(row.category_name || "").includes(cf)) return false;
  }

  return true;
}

/**
 * @param {number[]} rankedIds
 * @param {object[]} indexRows
 * @param {object} facets
 * @param {Record<string, unknown>} [rawQuery]
 */
export function filterRankedIdsByFacets(rankedIds, indexRows, facets, rawQuery = {}) {
  const hasFacet =
    facets.brand || facets.model || facets.category || facets.year != null
    || facets.location || facets.cityId != null || rawQuery.cityId != null;
  if (!hasFacet) return rankedIds;

  const matchByProduct = new Map();
  for (const row of indexRows) {
    const pid = Number(row.product_id);
    if (rowMatchesStructuredFacets(row, facets, rawQuery)) {
      matchByProduct.set(pid, true);
    } else if (!matchByProduct.has(pid)) {
      matchByProduct.set(pid, false);
    }
  }

  const filtered = rankedIds.filter((id) => matchByProduct.get(Number(id)));
  return filtered.length ? filtered : rankedIds;
}
