/**
 * SEARCH-GROUPED-VEHICLE-POPUP-01 — batch preview groups + products.
 * SEARCH-INDEX-RUNTIME-PHASE-02 — delegates to configured search runtime.
 */

import { getSearchRuntime } from "./search/runtime/searchRuntime.js";

/**
 * @param {Record<string, unknown>} rawQuery
 */
export async function buildSearchPreviewBatch(rawQuery = {}) {
  return getSearchRuntime().searchPreview(rawQuery);
}
