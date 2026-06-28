/**
 * SEARCH-INVERTED-INDEX-RUNTIME-01 — 5-minute candidate cache.
 */

/** @type {Map<string, { expiresAt: number, candidates: Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>, meta: object }>} */
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

import { getSearchCandidatePolicy } from "../../../config/searchCandidatePolicyConfig.js";

/**
 * @param {object} rawQuery
 * @param {string} keyword
 * @param {object} facets
 */
export function invertedSearchCacheKey(rawQuery, keyword, facets = {}) {
  return JSON.stringify({
    policy: getSearchCandidatePolicy(),
    q: String(keyword || "").trim().toLowerCase(),
    brand: facets.brand ? String(facets.brand).trim().toLowerCase() : "",
    model: facets.model ? String(facets.model).trim().toLowerCase() : "",
    year: facets.year != null ? String(facets.year) : "",
    location: facets.location
      ? String(facets.location).trim().toLowerCase()
      : rawQuery.cityId != null
        ? String(rawQuery.cityId)
        : "",
  });
}

/**
 * @param {string} key
 */
export function getInvertedSearchCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit;
}

/**
 * @param {string} key
 * @param {Array<{ product_id: number, matched_tokens?: number, retrieval_score?: number }>} candidates
 * @param {object} [meta]
 */
export function setInvertedSearchCache(key, candidates, meta = {}) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_MS,
    candidates: candidates.map((c) => ({
      product_id: Number(c.product_id),
      matched_tokens: Number(c.matched_tokens) || 0,
      retrieval_score: Number(c.retrieval_score) || 0,
    })),
    meta,
  });
}

export function resetInvertedSearchCache() {
  cache.clear();
}

export const INVERTED_SEARCH_CACHE_MS = CACHE_MS;
