/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — runtime facade (config-driven switch).
 */

import { getSearchRuntimeMode } from "../../../config/searchRuntimeConfig.js";
import { LegacySearchRuntime } from "./LegacySearchRuntime.js";
import { SearchIndexRuntime } from "./SearchIndexRuntime.js";
import { InvertedSearchRuntime } from "./InvertedSearchRuntime.js";

/** @type {import('./LegacySearchRuntime.js').LegacySearchRuntime | null} */
let cached = null;
/** @type {string | null} */
let cachedMode = null;

/**
 * @returns {import('./LegacySearchRuntime.js').LegacySearchRuntime}
 */
export function getSearchRuntime() {
  const mode = getSearchRuntimeMode();
  if (cached && cachedMode === mode) return cached;
  cachedMode = mode;
  if (mode === "index") cached = SearchIndexRuntime;
  else if (mode === "inverted") cached = InvertedSearchRuntime;
  else cached = LegacySearchRuntime;
  return cached;
}

export function resetSearchRuntimeCache() {
  cached = null;
  cachedMode = null;
}
