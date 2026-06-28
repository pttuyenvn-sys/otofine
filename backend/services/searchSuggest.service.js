/**
 * SEARCH-SINGLE-ENDPOINT-01 — unified search suggest pipeline.
 * SEARCH-INDEX-RUNTIME-PHASE-02 — delegates to configured search runtime.
 * SEARCH-INVERTED-RUNTIME-CANARY-01 — shadow legacy vs inverted (sampled, async).
 */

import {
  isSearchCanaryEnabled,
  isSearchCanaryShadowMode,
  shouldSampleCanary,
} from "../config/searchCanaryConfig.js";
import { scheduleSearchCanaryComparison } from "./search/canary/searchCanaryService.js";
import { getSearchRuntime } from "./search/runtime/searchRuntime.js";
import { LegacySearchRuntime } from "./search/runtime/LegacySearchRuntime.js";

/**
 * @param {Record<string, unknown>} rawQuery
 * @returns {Promise<{ groups: object[], viewAll: object, categories: object[] }>}
 */
export async function buildSearchSuggestResponse(rawQuery = {}) {
  if (isSearchCanaryShadowMode()) {
    const legacyResponse = await LegacySearchRuntime.searchSuggest(rawQuery);
    if (shouldSampleCanary()) {
      scheduleSearchCanaryComparison(rawQuery);
    }
    return legacyResponse;
  }

  const response = await getSearchRuntime().searchSuggest(rawQuery);
  if (isSearchCanaryEnabled() && shouldSampleCanary()) {
    scheduleSearchCanaryComparison(rawQuery);
  }
  return response;
}

/**
 * Legacy batch shape for /product-categories/search-preview-batch.
 */
export async function buildSearchPreviewBatchLegacy(rawQuery = {}) {
  return getSearchRuntime().searchPreview(rawQuery);
}
