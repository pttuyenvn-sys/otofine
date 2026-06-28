/**
 * SEARCH-CANDIDATE-POLICY-PARITY-01 — adaptive candidate retrieval policy.
 */

/** @typedef {'strict' | 'adaptive'} SearchCandidatePolicyMode */

/**
 * @returns {SearchCandidatePolicyMode}
 */
export function getSearchCandidatePolicy() {
  const raw = String(process.env.SEARCH_CANDIDATE_POLICY || "strict").trim().toLowerCase();
  return raw === "adaptive" ? "adaptive" : "strict";
}

export function isAdaptiveCandidatePolicy() {
  return getSearchCandidatePolicy() === "adaptive";
}

/** Minimum candidates before relaxing further (legacy top-N alignment). */
export function getSearchCandidateTarget() {
  const n = Number(process.env.SEARCH_CANDIDATE_TARGET || 30);
  return Number.isFinite(n) && n > 0 ? Math.min(500, Math.floor(n)) : 30;
}

export const SEARCH_CANDIDATE_LIMIT = 500;
