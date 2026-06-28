/**
 * SEARCH-GROUPING-PARITY-01 — inverted grouping mode selection.
 */

/** @typedef {'legacy' | 'quality_gate_v2'} SearchGroupingMode */

/**
 * @returns {SearchGroupingMode}
 */
export function getSearchGroupingMode() {
  const raw = String(process.env.SEARCH_GROUPING_MODE || "legacy").trim().toLowerCase();
  return raw === "quality_gate_v2" ? "quality_gate_v2" : "legacy";
}

export function isQualityGateV2Grouping() {
  return getSearchGroupingMode() === "quality_gate_v2";
}

/**
 * @returns {string}
 */
export function getSearchGroupingWeightsPath() {
  return String(
    process.env.SEARCH_GROUPING_WEIGHTS_PATH
    || "backend/config/searchGroupingWeights.json",
  ).trim();
}

/**
 * @returns {number}
 */
export function getSearchGroupingQualityThreshold() {
  const raw = Number(process.env.SEARCH_GROUPING_QUALITY_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * @returns {number}
 */
export function getSearchGroupingPopupReserve() {
  const raw = Number(process.env.SEARCH_GROUPING_POPUP_RESERVE);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 3;
}
