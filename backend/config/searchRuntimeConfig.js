/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 + SEARCH-INVERTED-INDEX-RUNTIME-01 — runtime selection.
 */

/** @typedef {'legacy' | 'index' | 'inverted'} SearchRuntimeMode */

/**
 * @returns {SearchRuntimeMode}
 */
export function getSearchRuntimeMode() {
  const raw = String(process.env.SEARCH_RUNTIME || "legacy").trim().toLowerCase();
  if (raw === "index") return "index";
  if (raw === "inverted") return "inverted";
  return "legacy";
}

export function isSearchIndexRuntime() {
  return getSearchRuntimeMode() === "index";
}

export function isSearchInvertedRuntime() {
  return getSearchRuntimeMode() === "inverted";
}

export function isSearchLegacyRuntime() {
  return getSearchRuntimeMode() === "legacy";
}
