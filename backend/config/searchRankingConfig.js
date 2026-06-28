/**
 * SEARCH-RANKING-PARITY-01 — inverted ranking mode selection.
 */

/** @typedef {'legacy' | 'weighted_v2'} SearchRankingMode */

/**
 * @returns {SearchRankingMode}
 */
export function getSearchRankingMode() {
  const raw = String(process.env.SEARCH_RANKING_MODE || "legacy").trim().toLowerCase();
  return raw === "weighted_v2" ? "weighted_v2" : "legacy";
}

export function isWeightedV2Ranking() {
  return getSearchRankingMode() === "weighted_v2";
}

export function isSearchRankingExplainEnabled() {
  const raw = String(process.env.SEARCH_RANKING_EXPLAIN ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

/**
 * @returns {string}
 */
export function getSearchRankingWeightsPath() {
  return String(
    process.env.SEARCH_RANKING_WEIGHTS_PATH
    || "backend/config/searchRankingWeights.json",
  ).trim();
}
