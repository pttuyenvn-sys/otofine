/**
 * SEARCH-SINGLE-ENDPOINT-01 — in-memory suggest cache + in-flight dedup.
 */

import { SEARCH_SUGGEST_CACHE_TTL_MS } from "./searchSuggestPerformance.js";

function foldVi(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

/**
 * @param {string} apiKeyword
 * @param {{ brand?: string, model?: string, year?: string }} scope
 */
export function buildSearchSuggestCacheKey(apiKeyword, scope = {}) {
  const kw = foldVi(apiKeyword || "").trim();
  const brand = foldVi(scope.brand || "") || "all";
  const model = foldVi(scope.model || "") || "all";
  const year = String(scope.year || "").trim() || "null";
  return `${kw}|${brand}|${model}|${year}`;
}

/** @type {Map<string, { response: object, fetchedAt: number }>} */
const cache = new Map();

/** @type {Map<string, Promise<object>>} */
const inflight = new Map();

/**
 * @param {string} key
 */
export function readSearchSuggestCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  if (age > SEARCH_SUGGEST_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return {
    response: entry.response,
    stale: age > SEARCH_SUGGEST_CACHE_TTL_MS / 2,
  };
}

/**
 * @param {string} key
 * @param {{ response: object }} payload
 */
export function writeSearchSuggestCache(key, payload) {
  cache.set(key, {
    response: payload.response,
    fetchedAt: Date.now(),
  });
}

/**
 * @param {string} key
 * @param {() => Promise<object>} factory
 */
export function dedupeSearchSuggestInflight(key, factory) {
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = factory().finally(() => {
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  });
  inflight.set(key, promise);
  return promise;
}

export function clearSearchSuggestCacheForTests() {
  cache.clear();
  inflight.clear();
}
