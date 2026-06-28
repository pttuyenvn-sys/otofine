/**
 * SEARCH-INDEX-MATCHER-01 — query normalization.
 */

import { foldVi, normalizeSearchText } from "../../../utils/keywordRelevanceRanking.js";
import { normalizePartNumber } from "../../../utils/listingQueryNormalize.js";

export function normalizeMatcherQuery(raw = "") {
  let s = String(raw || "").trim();
  if (!s) return { raw: "", folded: "", normalized: "", partNumberNorm: null };

  const partNumberNorm = /^[0-9a-z][0-9a-z\-_.]{3,}$/i.test(s.replace(/\s/g, ""))
    ? normalizePartNumber(s)
    : null;

  s = s.replace(/[\u2013\u2014–—]/g, "-");
  s = s.replace(/\s+/g, " ").trim();

  return {
    raw: s,
    folded: foldVi(s),
    normalized: normalizeSearchText(s),
    partNumberNorm,
  };
}

export function normalizeMatcherPartNumber(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  return normalizePartNumber(s);
}
