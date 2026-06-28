/**
 * SEARCH-INVERTED-INDEX-01 — inverted token index (default off).
 */

export function isSearchInvertedIndexEnabled() {
  const raw = String(process.env.SEARCH_INVERTED_INDEX ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

export function isLegacyInvertedBuilderEnabled() {
  const raw = String(process.env.SEARCH_INVERTED_INDEX_LEGACY_BUILDER ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
