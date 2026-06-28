/**
 * Legacy sidebar category ranking — shared by search-sidebar and search-suggest.
 * SEARCH-INDEX-RUNTIME-PHASE-02 — delegates to configured search runtime.
 */

import { getSearchRuntime } from "./search/runtime/searchRuntime.js";

/**
 * @param {Record<string, unknown>} rawQuery
 * @param {string} keyword
 */
export async function fetchRankedSidebarCategories(rawQuery, keyword) {
  return getSearchRuntime().searchSidebar({ ...rawQuery, keyword, query: keyword });
}
