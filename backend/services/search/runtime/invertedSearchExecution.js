/**
 * SEARCH-INVERTED-INDEX-RUNTIME-01 — inverted search execution.
 * Candidate retrieval: search_token_index only (SQL).
 * Ranking/grouping: product_search_index only.
 */

import { pool } from "../../../config/db.js";
import { buildInvertedQueryPlan } from "./invertedSearchQuery.js";
import {
  getInvertedSearchCache,
  setInvertedSearchCache,
  invertedSearchCacheKey,
} from "./invertedSearchCache.js";
import {
  rankInvertedProductIdsWithExplain,
  buildInvertedKeywordOrder,
} from "./invertedSearchRanking.js";
import { isSearchRankingExplainEnabled } from "../../../config/searchRankingConfig.js";
import { buildIndexStructuredClause } from "./indexSearchClauses.js";
import {
  fetchIndexGroupedInventory,
  fetchIndexMatchedRowsForGroups,
  countIndexMatchedProducts,
} from "./indexSearchExecution.js";
import { isAdaptiveCandidatePolicy } from "../../../config/searchCandidatePolicyConfig.js";
import {
  fetchAdaptiveCandidates,
  fetchStrictCandidates,
} from "./invertedCandidatePolicy.js";
import { filterRankedIdsByFacets } from "./invertedRankingFacetFilter.js";

const CANDIDATE_LIMIT = 500;

/**
 * @typedef {object} InvertedSearchExecution
 * @property {string} where
 * @property {unknown[]} params
 * @property {string} keywordOrder
 * @property {string} provider
 * @property {number[]} candidateProductIds
 * @property {string} queryKeyword
 * @property {object} [plan]
 * @property {object} [candidateMeta]
 */

function whereBody(exec) {
  return String(exec.where || "").replace(/^\s*AND\s*/i, "").trim();
}

/**
 * SQL candidate retrieval on search_token_index only.
 * @param {string[]} tokens
 * @param {number} [limit]
 * @param {number} [minMatched]
 */
export async function fetchInvertedCandidatesByTokens(tokens, limit = CANDIDATE_LIMIT, minMatched = 1) {
  const folded = [...new Set(tokens.map((t) => String(t || "").trim().toLowerCase()).filter((t) => t.length >= 2))];
  if (!folded.length) return [];

  const [rows] = await pool.query(
    `
    SELECT
      product_id,
      COUNT(DISTINCT token) AS matched_tokens,
      SUM(weight) AS retrieval_score
    FROM search_token_index
    WHERE token IN (?)
    GROUP BY product_id
    HAVING matched_tokens >= ?
    ORDER BY matched_tokens DESC, retrieval_score DESC, product_id ASC
    LIMIT ?
    `,
    [folded, Math.max(1, minMatched), limit],
  );

  return rows.map((r) => ({
    product_id: Number(r.product_id),
    matched_tokens: Number(r.matched_tokens) || 0,
    retrieval_score: Number(r.retrieval_score) || 0,
  }));
}

/**
 * Brand-only breadth fetch (product_id order) for legacy recall parity.
 * @param {string[]} brandTokens
 * @param {number} [limit]
 */
export async function fetchInvertedBrandBreadthCandidates(brandTokens, limit = CANDIDATE_LIMIT) {
  const folded = [...new Set(brandTokens.map((t) => String(t || "").trim().toLowerCase()).filter((t) => t.length >= 2))];
  if (!folded.length) return [];

  const [rows] = await pool.query(
    `
    SELECT
      product_id,
      COUNT(DISTINCT token) AS matched_tokens,
      SUM(weight) AS retrieval_score
    FROM search_token_index
    WHERE token IN (?)
    GROUP BY product_id
    ORDER BY product_id ASC
    LIMIT ?
    `,
    [folded, limit],
  );

  return rows.map((r) => ({
    product_id: Number(r.product_id),
    matched_tokens: Number(r.matched_tokens) || 0,
    retrieval_score: Number(r.retrieval_score) || 0,
  }));
}

async function resolveInvertedCandidates(plan) {
  const fetchFn = (tokens, limit, minMatched) =>
    fetchInvertedCandidatesByTokens(tokens, limit, minMatched);

  if (isAdaptiveCandidatePolicy()) {
    return fetchAdaptiveCandidates(plan, fetchFn, pool);
  }
  return fetchStrictCandidates(plan, fetchFn);
}

/**
 * @param {Record<string, unknown>} rawQuery
 * @returns {Promise<InvertedSearchExecution>}
 */
export async function resolveInvertedSearchExecution(rawQuery) {
  const keyword = String(rawQuery.keyword || rawQuery.query || rawQuery.q || "").trim();
  const plan = await buildInvertedQueryPlan(rawQuery, keyword);
  const cacheKey = invertedSearchCacheKey(rawQuery, keyword, plan.facets);

  let candidates;
  let candidateMeta;
  const cached = getInvertedSearchCache(cacheKey);
  if (cached) {
    candidates = cached.candidates;
    candidateMeta = cached.meta;
  } else {
    const resolved = await resolveInvertedCandidates(plan);
    candidates = resolved.candidates;
    candidateMeta = resolved.meta;
    setInvertedSearchCache(cacheKey, candidates, candidateMeta);
  }

  const structured = buildIndexStructuredClause(plan.facets, rawQuery);
  const baseWhere = ` AND psi.status = 'active' `;

  if (!candidates.length) {
    return {
      where: `${baseWhere} AND 1=0 `,
      params: [...structured.params],
      keywordOrder: "",
      provider: "inverted-index-empty",
      candidateProductIds: [],
      queryKeyword: keyword,
      plan,
      candidateMeta,
    };
  }

  const candidateIds = candidates.map((c) => c.product_id);

  const [indexRows] = await pool.query(
    `
    SELECT
      psi.product_id,
      psi.title,
      psi.product_name,
      psi.part_number,
      psi.part_number_norm,
      psi.search_text,
      psi.brand_name,
      psi.model_name,
      psi.category_name,
      psi.search_priority,
      psi.popularity_score,
      psi.price,
      psi.updated_at,
      psi.location_id,
      psi.year_from,
      psi.year_to
    FROM product_search_index psi
    WHERE psi.status = 'active'
      AND psi.product_id IN (?)
    `,
    [candidateIds],
  );

  const ranked = rankInvertedProductIdsWithExplain(indexRows, candidates, {
    foldedPhrase: plan.folded,
    queryTokens: plan.queryTokens,
    partNumberNorm: plan.partNumberNorm,
    queryKeyword: keyword,
    facets: plan.facets,
  });
  const rankedIds = filterRankedIdsByFacets(
    ranked.map((r) => r.product_id),
    indexRows,
    plan.facets,
    rawQuery,
  );
  const rankedById = new Map(ranked.map((r) => [r.product_id, r]));
  const rankedFiltered = rankedIds.map((id) => rankedById.get(id)).filter(Boolean);
  const rankingExplain = isSearchRankingExplainEnabled()
    ? rankedFiltered.slice(0, 20).map((r) => ({
      product_id: r.product_id,
      score: r.score,
      title: r.title,
      category: r.category,
      components: r.explain?.components,
      finalScore: r.explain?.finalScore,
      legacyTier: r.explain?.legacyTier,
    }))
    : undefined;

  if (!rankedIds.length) {
    return {
      where: `${baseWhere} AND 1=0 `,
      params: [...structured.params],
      keywordOrder: "",
      provider: "inverted-index-filtered-empty",
      candidateProductIds: [],
      queryKeyword: keyword,
      plan,
      candidateMeta,
    };
  }

  const idClause = ` AND psi.product_id IN (${rankedIds.map(() => "?").join(",")}) `;
  const keywordOrder = buildInvertedKeywordOrder(rankedIds);

  return {
    where: baseWhere + structured.where + idClause,
    params: [...structured.params, ...rankedIds],
    keywordOrder,
    provider: "inverted-index",
    candidateProductIds: rankedIds,
    queryKeyword: keyword,
    plan,
    candidateMeta,
    rankingExplain,
  };
}

export {
  fetchIndexGroupedInventory,
  fetchIndexMatchedRowsForGroups,
  countIndexMatchedProducts,
  whereBody,
};
