/**
 * HYBRID-SEARCH-ENGINE-IMPLEMENT-01 — feature flag + thresholds.
 *
 * SEARCH_ENGINE_MODE:
 *   hybrid   — exact → structured → fulltext → like fallback (default)
 *   fulltext — fulltext → like fallback
 *   legacy   — original LIKE-only execution (rollback)
 */

const VALID_MODES = new Set(["hybrid", "fulltext", "legacy"]);

/** @returns {"hybrid" | "fulltext" | "legacy"} */
export function getSearchEngineMode() {
  const raw = String(process.env.SEARCH_ENGINE_MODE || "hybrid").trim().toLowerCase();
  return VALID_MODES.has(raw) ? /** @type {const} */ (raw) : "hybrid";
}

/** Minimum matched products before FULLTEXT path is accepted (hybrid step 3). */
export function getFulltextMinResults() {
  const n = Number(process.env.SEARCH_FULLTEXT_MIN_RESULTS);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** Minimum matched products before exact path stops the cascade (hybrid step 1). */
export function getExactMinResults() {
  const n = Number(process.env.SEARCH_EXACT_MIN_RESULTS);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export function isSearchEngineDebug() {
  return process.env.SEARCH_ENGINE_DEBUG === "1"
    || process.env.NODE_ENV === "development";
}

/** Quality gate threshold (0–100). Default 85. */
export function getQualityGateThreshold() {
  const n = Number(process.env.QUALITY_GATE_THRESHOLD);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 85;
}

/** @returns {{ category: number, brand: number, model: number, year: number, partNumber: number, phrase: number }} */
export function getQualityWeights() {
  return {
    category: Number(process.env.QUALITY_WEIGHT_CATEGORY) || 40,
    brand: Number(process.env.QUALITY_WEIGHT_BRAND) || 20,
    model: Number(process.env.QUALITY_WEIGHT_MODEL) || 20,
    year: Number(process.env.QUALITY_WEIGHT_YEAR) || 5,
    partNumber: Number(process.env.QUALITY_WEIGHT_PART_NUMBER) || 10,
    phrase: Number(process.env.QUALITY_WEIGHT_PHRASE) || 5,
  };
}
