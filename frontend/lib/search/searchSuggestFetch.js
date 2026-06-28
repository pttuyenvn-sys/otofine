/**
 * SEARCH-SINGLE-ENDPOINT-01 — single fetch for grouped search popup.
 */

import {
  buildSearchSuggestCacheKey,
  dedupeSearchSuggestInflight,
  writeSearchSuggestCache,
} from "@/lib/search/searchSuggestCache.js";

const EMPTY_RESPONSE = Object.freeze({
  groups: [],
  viewAll: { label: "", url: "/" },
  categories: [],
});

function isAbortError(err) {
  return err?.name === "AbortError" || err?.code === 20;
}

function logSearchSuggestTiming(query, startedAt, receivedAt) {
  if (process.env.NODE_ENV !== "development") return;
  const totalMs = receivedAt - startedAt;
  console.log(["Search", "query", query, "Suggest", `${totalMs} ms`, "Total", `${totalMs} ms`].join("\n"));
}

function buildSuggestQueryParams(apiKeyword, scope = {}) {
  const params = new URLSearchParams();
  if (apiKeyword) params.set("query", apiKeyword);
  if (scope.brand) params.set("brand", scope.brand);
  if (scope.model) params.set("model", scope.model);
  if (scope.year) params.set("year", scope.year);
  if (scope.location) params.set("location", scope.location);
  return params.toString();
}

/**
 * @param {object} options
 * @param {string} options.apiBase
 * @param {string} options.apiKeyword
 * @param {{ brand?: string, model?: string, year?: string, location?: string }} options.scope
 * @param {AbortSignal} options.signal
 */
export async function fetchSearchSuggest({ apiBase, apiKeyword, scope, signal }) {
  const cacheKey = buildSearchSuggestCacheKey(apiKeyword, scope);
  const startedAt = Date.now();

  const run = async () => {
    const res = await fetch(
      `${apiBase}/search/suggest?${buildSuggestQueryParams(apiKeyword, scope)}`,
      { signal },
    );
    const body = await res.json().catch(() => EMPTY_RESPONSE);
    const response = {
      groups: Array.isArray(body?.groups) ? body.groups : [],
      viewAll:
        body?.viewAll && typeof body.viewAll === "object"
          ? body.viewAll
          : { label: "", url: "/" },
      categories: Array.isArray(body?.categories) ? body.categories : [],
    };
    writeSearchSuggestCache(cacheKey, { response });
    logSearchSuggestTiming(apiKeyword, startedAt, Date.now());
    return response;
  };

  try {
    return await dedupeSearchSuggestInflight(cacheKey, run);
  } catch (err) {
    if (isAbortError(err)) return null;
    throw err;
  }
}

export { EMPTY_RESPONSE as EMPTY_SEARCH_SUGGEST_RESPONSE };
