/**
 * SEARCH-INDEX-SYNC-IMPLEMENT-01 — search index sync configuration.
 */

/** Bump when index document schema / hash inputs change (CLI rebuild targets older rows). */
export const CURRENT_SEARCH_INDEX_VERSION = Number(
  process.env.SEARCH_INDEX_VERSION || 4,
);

export function isSearchIndexSyncEnabled() {
  const raw = String(process.env.SEARCH_INDEX_SYNC_ENABLED ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function isSearchIndexSyncDebug() {
  return process.env.SEARCH_INDEX_SYNC_DEBUG === "1"
    || process.env.NODE_ENV === "development";
}
