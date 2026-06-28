/**
 * SEARCH-GROUPING-PARITY-01 — group quality scoring for inverted grouping gate.
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import {
  extractCategoryPhraseFromKeyword,
  scoreCategoryPhraseTier,
} from "../../../utils/categorySuggestRanking.js";
import { computeLegacyTier } from "./invertedRankingComponents.js";

function tokenBoundaryMatch(textFold, token) {
  if (!token) return false;
  if (textFold === token) return true;
  if (textFold.startsWith(`${token} `)) return true;
  if (textFold.endsWith(` ${token}`)) return true;
  return textFold.includes(` ${token} `);
}

/**
 * @param {string} phrase
 * @param {{ brand?: string, model?: string }} facets
 */
export function extractGroupKeywordTokens(phrase, facets = {}) {
  const brandFold = foldVi(facets.brand || "");
  const modelFold = foldVi(facets.model || "");
  const tokens = String(phrase || "")
    .split(/\s+/)
    .map((t) => foldVi(t))
    .filter((t) => t.length >= 2);
  return tokens.filter((t) => {
    if (brandFold && t === brandFold) return false;
    if (modelFold && t === modelFold) return false;
    return true;
  });
}

/**
 * @param {string} categoryName
 * @param {string[]} tokens
 */
export function scoreGroupKeywordCoverage(categoryName, tokens) {
  if (!tokens.length) return 1;
  const catFold = foldVi(categoryName);
  const hits = tokens.filter((t) => tokenBoundaryMatch(catFold, t)).length;
  return hits / tokens.length;
}

/**
 * @param {object} group
 */
export function buildVehicleGroupStableKey(group) {
  return [
    Number(group.category_id) || 0,
    String(group.brand_slug || group.brand || "").toLowerCase(),
    String(group.model_slug || group.model || "").toLowerCase(),
  ].join("|");
}

/**
 * @param {object} group
 */
export function buildCategoryGroupStableKey(group) {
  return String(Number(group.category_id) || 0);
}

/**
 * @param {object} group
 * @param {object} ctx
 * @param {Record<string, number>} weights
 */
export function computeGroupQualityScore(group, ctx, weights) {
  const phrase = ctx.phrase || extractCategoryPhraseFromKeyword(ctx.keyword, ctx.facets);
  const phraseTier = scoreCategoryPhraseTier(group.canonical_name, phrase);
  const keywordTokens = ctx.keywordTokens || extractGroupKeywordTokens(phrase, ctx.facets);
  const keywordCoverage = scoreGroupKeywordCoverage(group.canonical_name, keywordTokens);

  /** @type {Record<string, number>} */
  const signals = {
    product_count: Number(group.total_count) || 0,
    phrase_tier: phraseTier,
    keyword_coverage: Math.round(keywordCoverage * 1000) / 1000,
    brand_match: 0,
    model_match: 0,
    category_match: 0,
    phrase_match: 0,
    oem_match: 0,
    best_rank: null,
    avg_rank: null,
    avg_ranking_score: 0,
    best_ranking_score: 0,
  };

  const components = {
    phrase_tier: Math.max(0, (10 - Math.min(phraseTier, 9))) * (weights.phrase_tier_factor || 0),
    keyword_coverage: keywordCoverage * (weights.keyword_coverage_factor || 0),
    brand_match: 0,
    model_match: 0,
    category_match: 0,
    oem_match: 0,
    product_count: Math.min(weights.count_max || 0, signals.product_count * (weights.count_factor || 0)),
    ranking_best: 0,
    ranking_avg: 0,
  };

  if (ctx.facets?.brand && foldVi(group.brand) === foldVi(ctx.facets.brand)) {
    signals.brand_match = 1;
    components.brand_match = weights.brand_match || 0;
  }
  if (ctx.facets?.model && foldVi(group.model) === foldVi(ctx.facets.model)) {
    signals.model_match = 1;
    components.model_match = weights.model_match || 0;
  }

  if (keywordCoverage >= 1) {
    signals.phrase_match = 1;
    components.category_match = weights.category_match || 0;
  } else if (keywordCoverage > 0) {
    signals.phrase_match = 0.5;
    components.category_match = Math.round((weights.category_match || 0) * keywordCoverage);
  }

  const groupKey = ctx.grain === "category"
    ? buildCategoryGroupStableKey(group)
    : buildVehicleGroupStableKey(group);
  const ranks = ctx.groupRanks?.get(groupKey) || [];
  if (ranks.length) {
    signals.best_rank = Math.min(...ranks);
    signals.avg_rank = Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 100) / 100;
    const bestRankScore = Math.max(
      0,
      (weights.ranking_best_max || 0) - signals.best_rank * (weights.ranking_best_factor || 0),
    );
    const avgRankScore = Math.max(
      0,
      (weights.ranking_avg_max || 0) - signals.avg_rank * (weights.ranking_avg_factor || 0),
    );
    components.ranking_best = bestRankScore;
    components.ranking_avg = avgRankScore;
    signals.best_ranking_score = bestRankScore;
    signals.avg_ranking_score = avgRankScore;
  }

  if (ctx.partNumberNorm && ctx.groupOemHits?.get(groupKey)) {
    signals.oem_match = 1;
    components.oem_match = weights.oem_match || 0;
  }

  const qualityScore = Math.round(
    Object.values(components).reduce((sum, v) => sum + Number(v || 0), 0) * 1000,
  ) / 1000;

  return {
    qualityScore,
    components,
    signals,
    phraseTier,
    keywordCoverage,
    groupKey,
  };
}

/**
 * @param {object} row
 * @param {object} ctx
 */
export function sampleProductLegacyTier(row, ctx) {
  return computeLegacyTier(row, {
    queryKeyword: ctx.keyword,
    foldedPhrase: ctx.plan?.folded,
    queryTokens: ctx.plan?.queryTokens,
    facets: ctx.facets,
  });
}
