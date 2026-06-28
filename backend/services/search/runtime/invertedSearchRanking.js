/**
 * SEARCH-INVERTED-INDEX-RUNTIME-01 + SEARCH-RANKING-PARITY-01 — inverted ranking.
 */

import { foldVi } from "../../../utils/keywordRelevanceRanking.js";
import { getSearchRankingMode, isSearchRankingExplainEnabled } from "../../../config/searchRankingConfig.js";
import { loadSearchRankingWeights } from "./searchRankingWeights.js";
import { computeInvertedRankingComponents, computeLegacyTier } from "./invertedRankingComponents.js";

/**
 * @param {object} row — product_search_index row
 * @param {object} ctx
 */
export function scoreInvertedIndexRow(row, ctx) {
  let score = 0;
  const title = foldVi(row.title || row.product_name || "");
  const searchText = foldVi(row.search_text || "");
  const blob = ` ${title} ${searchText} `;

  if (ctx.partNumberNorm) {
    const pn = String(row.part_number_norm || "").toLowerCase();
    if (pn === ctx.partNumberNorm) score += 200;
    if (String(row.part_number || "").toLowerCase().includes(ctx.partNumberNorm)) score += 180;
  }

  if (ctx.foldedPhrase && blob.includes(` ${ctx.foldedPhrase} `)) score += 120;

  let tokenHits = 0;
  for (const token of ctx.queryTokens || []) {
    const t = foldVi(token);
    if (blob.includes(` ${t} `)) tokenHits += 1;
  }
  if (ctx.queryTokens?.length) {
    score += (tokenHits / ctx.queryTokens.length) * 80;
  }

  if (ctx.facets?.brand) {
    if (foldVi(row.brand_name) === foldVi(ctx.facets.brand)) score += 40;
  }
  if (ctx.facets?.model) {
    if (foldVi(row.model_name) === foldVi(ctx.facets.model)) score += 40;
  }
  if (ctx.facets?.category) {
    const c = foldVi(ctx.facets.category);
    if (foldVi(row.category_name).includes(c)) score += 25;
  }
  if (ctx.facets?.year != null) {
    const y = Number(ctx.facets.year);
    if (Number.isFinite(y) && y > 0) {
      const yf = Number(row.year_from) || 0;
      const yt = Number(row.year_to) || 0;
      if ((yf === 0 || yf <= y) && (yt === 0 || yt >= y)) score += 15;
    }
  }

  score += Math.min(20, Number(row.search_priority) || 0);
  score += Math.min(30, (Number(row.popularity_score) || 0) / 1e12);

  score += Number(ctx.retrievalScore || 0) * 0.5;
  score += Number(ctx.matchedTokens || 0) * 10;

  return score;
}

/**
 * @param {object} row
 * @param {object} ctx
 * @param {Record<string, number>} [weights]
 */
export function scoreInvertedIndexRowWithExplain(row, ctx, weights) {
  const mode = getSearchRankingMode();
  if (mode === "weighted_v2") {
    const w = weights || loadSearchRankingWeights("weighted_v2");
    const scored = computeInvertedRankingComponents(row, ctx, w);
    return {
      finalScore: scored.finalScore,
      components: scored.components,
      legacyTier: scored.legacyTier,
      tierBoost: scored.tierBoost,
    };
  }
  const finalScore = scoreInvertedIndexRow(row, ctx);
  return {
    finalScore,
    components: { legacy_total: finalScore },
    legacyTier: null,
    tierBoost: 0,
  };
}

function rowHasPartNumber(row) {
  return Boolean(row.part_number && String(row.part_number).trim());
}

function rowHasPrice(row) {
  return Number(row.price) > 0;
}

/**
 * Lightweight rank meta for weighted_v2 sort (avoids full component scoring).
 */
function buildWeightedRankMeta(row, ctx) {
  return {
    legacyTier: computeLegacyTier(row, ctx),
    part_number_has: rowHasPartNumber(row) ? 1 : 0,
    price_has: rowHasPrice(row) ? 1 : 0,
  };
}

/**
 * Legacy-compatible multi-key sort (matches buildListOrderBy popular tail).
 */
function compareLegacyRank(a, b) {
  const tierA = a.explain?.legacyTier ?? 9;
  const tierB = b.explain?.legacyTier ?? 9;
  if (tierA !== tierB) return tierA - tierB;

  const pnA = a.explain?.components?.part_number_has > 0 ? 0 : 1;
  const pnB = b.explain?.components?.part_number_has > 0 ? 0 : 1;
  if (pnA !== pnB) return pnA - pnB;

  const prA = a.explain?.components?.price_has > 0 ? 0 : 1;
  const prB = b.explain?.components?.price_has > 0 ? 0 : 1;
  if (prA !== prB) return prA - prB;

  const dayOfMonth = new Date().getDate();
  const modA = (dayOfMonth + a.product_id) % 7;
  const modB = (dayOfMonth + b.product_id) % 7;
  if (modA !== modB) return modA - modB;

  const freshA = a.popularity_score ?? 0;
  const freshB = b.popularity_score ?? 0;
  if (freshB !== freshA) return freshB - freshA;

  return a.product_id - b.product_id;
}

function pickBestRowByTier(rows, ctx) {
  let bestRow = rows[0];
  let bestTier = computeLegacyTier(bestRow, ctx);
  for (const row of rows.slice(1)) {
    const tier = computeLegacyTier(row, ctx);
    if (tier < bestTier || (tier === bestTier && Number(row.product_id) < Number(bestRow.product_id))) {
      bestRow = row;
      bestTier = tier;
    }
  }
  return bestRow;
}

function stubExplainFromMeta(meta) {
  return {
    finalScore: 0,
    legacyTier: meta.legacyTier,
    tierBoost: 0,
    components: {
      part_number_has: meta.part_number_has,
      price_has: meta.price_has,
    },
  };
}

/**
 * @param {object[]} indexRows
 * @param {object[]} candidates
 * @param {object} ctx
 * @param {Record<string, number>} [weightsOverride]
 */
export function rankInvertedProducts(indexRows, candidates, ctx, weightsOverride) {
  const candidateMap = new Map(candidates.map((c) => [Number(c.product_id), c]));
  const mode = getSearchRankingMode();
  const weights = weightsOverride || (mode === "weighted_v2"
    ? loadSearchRankingWeights("weighted_v2")
    : null);
  const explainAll = isSearchRankingExplainEnabled() || Boolean(weightsOverride);

  /** @type {Map<number, object[]>} */
  const rowsByProduct = new Map();
  for (const row of indexRows) {
    const pid = Number(row.product_id);
    if (!rowsByProduct.has(pid)) rowsByProduct.set(pid, []);
    rowsByProduct.get(pid).push(row);
  }

  /** @type {object[]} */
  const ranked = [];
  for (const [pid, rows] of rowsByProduct.entries()) {
    const cand = candidateMap.get(pid) || {};
    const rowCtx = {
      ...ctx,
      matchedTokens: cand.matched_tokens,
      retrievalScore: cand.retrieval_score,
    };

    if (mode === "weighted_v2") {
      const row = pickBestRowByTier(rows, rowCtx);
      const meta = buildWeightedRankMeta(row, rowCtx);
      ranked.push({
        product_id: pid,
        score: 0,
        explain: stubExplainFromMeta(meta),
        title: row.title || row.product_name,
        category: row.category_name,
        popularity_score: Number(row.popularity_score) || 0,
        _row: row,
        _rowCtx: rowCtx,
      });
    } else {
      const row = rows[0];
      const scored = scoreInvertedIndexRowWithExplain(row, rowCtx, weights || undefined);
      ranked.push({
        product_id: pid,
        score: scored.finalScore,
        explain: scored,
        title: row.title || row.product_name,
        category: row.category_name,
        popularity_score: Number(row.popularity_score) || 0,
      });
    }
  }

  if (mode === "weighted_v2") {
    ranked.sort(compareLegacyRank);
    if (explainAll) {
      const explainLimit = isSearchRankingExplainEnabled() ? 20 : ranked.length;
      for (const entry of ranked.slice(0, explainLimit)) {
        if (!entry._row) continue;
        const scored = scoreInvertedIndexRowWithExplain(entry._row, entry._rowCtx, weights || undefined);
        entry.score = scored.finalScore;
        entry.explain = scored;
      }
    }
    for (const entry of ranked) {
      delete entry._row;
      delete entry._rowCtx;
    }
  } else {
    ranked.sort((a, b) => b.score - a.score || a.product_id - b.product_id);
  }
  return ranked;
}

/**
 * @param {object[]} indexRows
 * @param {object[]} candidates
 * @param {object} ctx
 * @returns {number[]}
 */
export function rankInvertedProductIds(indexRows, candidates, ctx) {
  return rankInvertedProducts(indexRows, candidates, ctx).map((r) => r.product_id);
}

/**
 * @param {object[]} indexRows
 * @param {object[]} candidates
 * @param {object} ctx
 */
export function rankInvertedProductIdsWithExplain(indexRows, candidates, ctx) {
  return rankInvertedProducts(indexRows, candidates, ctx);
}

/**
 * @param {number[]} productIds
 */
export function buildInvertedKeywordOrder(productIds) {
  if (!productIds.length) return "";
  const cases = productIds
    .slice(0, 300)
    .map((id, i) => `WHEN ${Number(id)} THEN ${i}`)
    .join(" ");
  return `CASE psi.product_id ${cases} ELSE 999999 END,`;
}
