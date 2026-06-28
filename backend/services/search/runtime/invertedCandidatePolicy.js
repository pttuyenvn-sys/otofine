/**
 * SEARCH-CANDIDATE-POLICY-PARITY-01 — adaptive inverted candidate retrieval.
 * Candidate retrieval only — ranking/grouping/popup unchanged.
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import {
  getSearchCandidateTarget,
  SEARCH_CANDIDATE_LIMIT,
} from "../../../config/searchCandidatePolicyConfig.js";

/** @typedef {'oem' | 'brand' | 'model' | 'phrase' | 'category' | 'keyword' | 'year' | 'location'} TokenClass */

/** Relax lowest priority first (never relax oem/model/phrase). */
const RELAX_PRIORITY = {
  location: 1,
  year: 2,
  keyword: 3,
  category: 4,
  brand: 5,
  model: 6,
  phrase: 7,
  oem: 8,
};

/**
 * @param {import('./invertedSearchQuery.js').InvertedQueryPlan} plan
 */
export function classifyPolicyTokens(plan) {
  const fold = (t) => foldVi(String(t || "").trim()).toLowerCase();
  const phraseFolded = plan.folded && String(plan.folded).includes(" ") ? fold(plan.folded) : "";
  const phraseWords = phraseFolded ? phraseFolded.split(/\s+/).filter((w) => w.length >= 2) : [];

  const oem = plan.partNumberNorm ? [fold(plan.partNumberNorm)] : [];
  const brand = plan.facets?.brand ? [fold(plan.facets.brand)] : [];
  const model = plan.facets?.model ? [fold(plan.facets.model)] : [];
  const phraseInQueryTokens = phraseFolded
    && (plan.queryTokens || []).some((t) => fold(t) === phraseFolded);
  const phrase = phraseInQueryTokens ? [phraseFolded] : [];
  const category = plan.facets?.category ? [fold(plan.facets.category)] : [];
  const year = plan.facets?.year != null ? [String(plan.facets.year)] : [];
  const location = plan.facets?.location ? [fold(plan.facets.location)] : [];

  const reserved = new Set([...oem, ...brand, ...model, ...phrase, ...category, ...year, ...location]);
  const keywords = (plan.queryTokens || [])
    .map(fold)
    .filter((t) => t.length >= 2 && !reserved.has(t)
      && (phraseInQueryTokens ? !phraseWords.includes(t) : true));

  /** @type {Array<{ token: string, class: TokenClass, relaxPriority: number, required: boolean }>} */
  const entries = [];
  const add = (token, tokenClass, required) => {
    const t = fold(token);
    if (!t || t.length < 2) return;
    if (entries.some((e) => e.token === t)) return;
    entries.push({
      token: t,
      class: tokenClass,
      relaxPriority: RELAX_PRIORITY[tokenClass] ?? 3,
      required: Boolean(required),
    });
  };

  for (const t of oem) add(t, "oem", true);
  for (const t of brand) add(t, "brand", false);
  for (const t of model) add(t, "model", true);
  for (const t of phrase) add(t, "phrase", true);
  for (const t of category) add(t, "category", false);
  for (const t of keywords) add(t, "keyword", false);
  for (const t of year) add(t, "year", false);
  for (const t of location) add(t, "location", false);

  return {
    entries,
    hasExplicitBrand: brand.length > 0,
    hasExplicitModel: model.length > 0,
    hasOem: oem.length > 0,
    hasExactPhrase: phrase.length > 0,
    keywordTokens: [...keywords, ...phraseWords.filter((w) => !keywords.includes(w))],
    brandTokens: brand,
  };
}

function shouldUseBrandParityMerge(classified) {
  return classified.hasExplicitBrand
    && classified.hasExactPhrase
    && classified.keywordTokens.length >= 2
    && !classified.hasOem
    && !classified.hasExplicitModel;
}

/**
 * @param {Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>} a
 * @param {Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>} b
 */
function mergeCandidates(a, b, limit = SEARCH_CANDIDATE_LIMIT) {
  const map = new Map();
  for (const row of [...a, ...b]) {
    const pid = Number(row.product_id);
    const prev = map.get(pid);
    if (!prev || Number(row.matched_tokens) > prev.matched_tokens
      || (Number(row.matched_tokens) === prev.matched_tokens
        && Number(row.retrieval_score) > prev.retrieval_score)) {
      map.set(pid, {
        product_id: pid,
        matched_tokens: Number(row.matched_tokens) || 0,
        retrieval_score: Number(row.retrieval_score) || 0,
      });
    }
  }
  return [...map.values()]
    .sort(
      (x, y) =>
        y.matched_tokens - x.matched_tokens
        || y.retrieval_score - x.retrieval_score
        || x.product_id - y.product_id,
    )
    .slice(0, limit);
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number[]} productIds
 * @param {string[]} queryTokens
 */
async function loadMatchedTokensByProduct(db, productIds, queryTokens) {
  if (!productIds.length || !queryTokens.length) return new Map();
  const [rows] = await db.query(
    `
    SELECT product_id, GROUP_CONCAT(DISTINCT token ORDER BY token SEPARATOR ',') AS matched
    FROM search_token_index
    WHERE product_id IN (?) AND token IN (?)
    GROUP BY product_id
    `,
    [productIds, queryTokens],
  );
  const out = new Map();
  for (const row of rows) {
    const tokens = String(row.matched || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    out.set(Number(row.product_id), tokens);
  }
  return out;
}

/**
 * Brand+keyword parity merge (strict + broad + brand breadth).
 * @param {ReturnType<typeof classifyPolicyTokens>} classified
 * @param {string[]} searchTokens
 * @param {Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>} strictCandidates
 * @param {(tokens: string[], limit: number, minMatched: number) => Promise<Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>>} fetchFn
 * @param {import('mysql2/promise').Pool} db
 */
async function mergeBrandKeywordParity(classified, searchTokens, strictCandidates, fetchFn, db) {
  const limit = SEARCH_CANDIDATE_LIMIT;
  const { fetchInvertedBrandBreadthCandidates } = await import("./invertedSearchExecution.js");
  const brandBreadth = await fetchInvertedBrandBreadthCandidates(classified.brandTokens, limit);

  const keywordRich = strictCandidates.filter((r) => Number(r.matched_tokens) >= 2);
  const keywordCap = Math.min(keywordRich.length, 100);
  const pool = keywordRich.slice(0, keywordCap);
  const seen = new Set(pool.map((r) => r.product_id));
  for (const row of brandBreadth) {
    if (pool.length >= limit) break;
    if (!seen.has(row.product_id)) {
      pool.push(row);
      seen.add(row.product_id);
    }
  }
  if (pool.length < limit) {
    for (const row of keywordRich.slice(keywordCap)) {
      if (pool.length >= limit) break;
      if (!seen.has(row.product_id)) {
        pool.push(row);
        seen.add(row.product_id);
      }
    }
  }

  return pool.slice(0, limit);
}

/**
 * Prioritize keyword/phrase matches; brand-only fills remaining slots up to limit.
 * @param {Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>} candidates
 * @param {ReturnType<typeof classifyPolicyTokens>} classified
 * @param {import('mysql2/promise').Pool} db
 */
export async function prioritizeCandidatePool(candidates, classified, db) {
  const limit = SEARCH_CANDIDATE_LIMIT;
  if (!candidates.length) return candidates;
  if (!classified.hasExplicitBrand || !classified.keywordTokens.length) {
    return candidates.slice(0, limit);
  }

  const matchedByProduct = await loadMatchedTokensByProduct(
    db,
    candidates.map((c) => c.product_id),
    [...new Set([...classified.entries.map((e) => e.token), ...classified.keywordTokens, ...classified.brandTokens])],
  );

  const brandSet = new Set(classified.brandTokens);
  const keywordSet = new Set(classified.keywordTokens);
  const phraseTokens = classified.entries.filter((e) => e.class === "phrase").map((e) => e.token);

  const high = [];
  const brandOnly = [];
  for (const c of candidates) {
    const matched = matchedByProduct.get(c.product_id) || [];
    const isBrandOnly =
      matched.length > 0
      && matched.every((t) => brandSet.has(t));
    const hasKeyword = matched.some((t) => keywordSet.has(t) || phraseTokens.includes(t));
    if (hasKeyword || !isBrandOnly) high.push(c);
    else brandOnly.push(c);
  }

  const target = getSearchCandidateTarget();
  if (high.length >= target) {
    return [...high, ...brandOnly].slice(0, limit);
  }
  return [...high, ...brandOnly].slice(0, limit);
}

/**
 * @param {import('./invertedSearchQuery.js').InvertedQueryPlan} plan
 * @param {(tokens: string[], limit: number, minMatched: number) => Promise<Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>>} fetchFn
 * @param {import('mysql2/promise').Pool} db
 */
export async function fetchAdaptiveCandidates(plan, fetchFn, db) {
  const classified = classifyPolicyTokens(plan);
  const limit = SEARCH_CANDIDATE_LIMIT;

  if (!classified.entries.length) {
    return { candidates: [], meta: { policy: "adaptive", stage: "empty" } };
  }

  const searchTokens = [
    ...new Set(
      [...(plan.queryTokens || []), ...classified.entries.map((e) => e.token)]
        .map((t) => foldVi(String(t || "").trim()).toLowerCase())
        .filter((t) => t.length >= 2),
    ),
  ];

  /** Brand + multi-word keyword (no model): legacy recall parity path only. */
  if (shouldUseBrandParityMerge(classified)) {
    let active = [...classified.entries];
    let candidates = await fetchFn(searchTokens, limit, active.length);
    candidates = await mergeBrandKeywordParity(classified, searchTokens, candidates, fetchFn, db);
    return {
      candidates,
      meta: {
        policy: "adaptive",
        stage: "brand_parity",
        minMatched: active.length,
        count: candidates.length,
      },
    };
  }

  /** All other queries: identical to strict policy (fast path). */
  const strict = await fetchStrictCandidates(plan, fetchFn);
  return { ...strict, meta: { ...strict.meta, policy: "adaptive", stage: "strict_equivalent" } };
}

/**
 * Strict legacy policy (SEARCH_CANDIDATE_POLICY=strict).
 * @param {import('./invertedSearchQuery.js').InvertedQueryPlan} plan
 * @param {(tokens: string[], limit: number, minMatched: number) => Promise<Array<{ product_id: number, matched_tokens: number, retrieval_score: number }>>} fetchFn
 */
export async function fetchStrictCandidates(plan, fetchFn) {
  const terms = (plan.queryTokens || []).filter((t) => t.length >= 2);
  let minMatched = 1;
  if (plan.facets?.brand || plan.facets?.model) minMatched = Math.min(2, terms.length);
  else if (terms.length >= 2) minMatched = 2;

  let candidates = await fetchFn(plan.queryTokens, SEARCH_CANDIDATE_LIMIT, minMatched);
  if (!candidates.length && minMatched > 1) {
    candidates = await fetchFn(plan.queryTokens, SEARCH_CANDIDATE_LIMIT, 1);
    minMatched = 1;
  }

  return {
    candidates,
    meta: { policy: "strict", minMatched, count: candidates.length },
  };
}
