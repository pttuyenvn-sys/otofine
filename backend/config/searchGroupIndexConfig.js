/**
 * SEARCH-INDEX-GROUP-RUNTIME-01 — grouping from product_search_index (default off).
 */

export function isSearchGroupIndexEnabled() {
  const raw = String(process.env.SEARCH_GROUP_INDEX ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
