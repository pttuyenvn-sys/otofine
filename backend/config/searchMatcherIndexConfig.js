/**
 * SEARCH-INDEX-MATCHER-01 — dedicated index matcher (default off).
 */

export function isSearchMatcherIndexEnabled() {
  const raw = String(process.env.SEARCH_MATCHER_INDEX ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
