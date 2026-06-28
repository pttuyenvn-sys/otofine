/**
 * SEARCH-GROUPING-PARITY-01 — filter and sort inverted groups before popup/sidebar output.
 */

import {
  getSearchGroupingPopupReserve,
  getSearchGroupingQualityThreshold,
} from "../../../config/searchGroupingConfig.js";
import { loadSearchGroupingWeights } from "./searchGroupingWeights.js";
import {
  buildCategoryGroupStableKey,
  buildVehicleGroupStableKey,
  computeGroupQualityScore,
  extractGroupKeywordTokens,
} from "./searchGroupQuality.js";
import { extractCategoryPhraseFromKeyword } from "../../../utils/categorySuggestRanking.js";

/**
 * @param {object} a
 * @param {object} b
 */
function compareStableGroupKeys(a, b) {
  const cidA = Number(a.category_id) || 0;
  const cidB = Number(b.category_id) || 0;
  if (cidA !== cidB) return cidA - cidB;

  const bsA = String(a.brand_slug || a.brand || "").toLowerCase();
  const bsB = String(b.brand_slug || b.brand || "").toLowerCase();
  if (bsA !== bsB) return bsA.localeCompare(bsB, "vi");

  const msA = String(a.model_slug || a.model || "").toLowerCase();
  const msB = String(b.model_slug || b.model || "").toLowerCase();
  return msA.localeCompare(msB, "vi");
}

/**
 * @param {object[]} groups
 * @param {object} ctx
 * @param {{ grain?: 'vehicle' | 'category', popupReserve?: number, threshold?: number, weights?: Record<string, number> }} [opts]
 */
export function applyGroupQualityGate(groups, ctx, opts = {}) {
  const weights = opts.weights || loadSearchGroupingWeights("quality_gate_v2");
  const envThreshold = getSearchGroupingQualityThreshold();
  const threshold = opts.threshold ?? (envThreshold || weights.quality_threshold || 18);
  const popupReserve = opts.popupReserve ?? getSearchGroupingPopupReserve();
  const coverageMin = weights.coverage_min ?? 0.34;
  const grain = opts.grain || "vehicle";

  if (!groups?.length) return [];

  const phrase = ctx.phrase || extractCategoryPhraseFromKeyword(ctx.keyword, ctx.facets);
  const gateCtx = {
    ...ctx,
    phrase,
    keywordTokens: extractGroupKeywordTokens(phrase, ctx.facets),
    grain,
  };

  const scored = groups.map((group) => {
    const quality = computeGroupQualityScore(group, gateCtx, weights);
    return {
      ...group,
      qualityScore: quality.qualityScore,
      qualitySignals: quality.signals,
      qualityComponents: quality.components,
      phraseTier: quality.phraseTier,
      keywordCoverage: quality.keywordCoverage,
    };
  });

  scored.sort((a, b) => {
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    return compareStableGroupKeys(a, b);
  });

  const passing = scored.filter((g) => {
    if (g.phraseTier <= 4) return true;
    if (g.keywordCoverage >= coverageMin) return true;
    if (ctx.partNumberNorm && g.qualitySignals?.oem_match) return true;
    return false;
  });

  const weak = scored.filter((g) => !passing.includes(g));

  if (!passing.length && !scored.some((g) => g.keywordCoverage > 0)) {
    return [];
  }

  if (passing.length >= popupReserve) {
    return passing;
  }

  const needed = popupReserve - passing.length;
  return [...passing, ...weak.slice(0, needed)];
}

/**
 * Build rank index + OEM hits for candidate products grouped by stable keys.
 * @param {object[]} indexRows
 * @param {number[]} candidateProductIds
 * @param {string} [partNumberNorm]
 */
export function buildGroupRankContextFromIndexRows(indexRows, candidateProductIds, partNumberNorm) {
  const rankByProduct = new Map(
    candidateProductIds.map((id, idx) => [Number(id), idx]),
  );
  /** @type {Map<string, number[]>} */
  const groupRanks = new Map();
  /** @type {Map<string, boolean>} */
  const groupOemHits = new Map();
  const pnQuery = String(partNumberNorm || "").toLowerCase();

  for (const row of indexRows) {
    const pid = Number(row.product_id);
    const rank = rankByProduct.get(pid);
    if (rank == null) continue;

    for (const key of [
      buildVehicleGroupStableKey(row),
      buildCategoryGroupStableKey(row),
    ]) {
      if (!groupRanks.has(key)) groupRanks.set(key, []);
      groupRanks.get(key).push(rank);
    }

    if (pnQuery) {
      const pn = String(row.part_number_norm || row.part_number || "").toLowerCase();
      if (pn && (pn === pnQuery || pn.includes(pnQuery))) {
        for (const key of [buildVehicleGroupStableKey(row), buildCategoryGroupStableKey(row)]) {
          groupOemHits.set(key, true);
        }
      }
    }
  }

  return { groupRanks, groupOemHits };
}

/**
 * @param {import('./invertedSearchExecution.js').InvertedSearchExecution} exec
 * @param {string} keyword
 * @param {Record<string, unknown>} rawQuery
 * @param {import('../../../config/db.js').Pool} pool
 */
export async function buildInvertedGroupQualityContext(exec, keyword, rawQuery, pool) {
  const candidateProductIds = exec.candidateProductIds || [];
  if (!candidateProductIds.length) {
    return {
      keyword,
      facets: exec.plan?.facets || {},
      plan: exec.plan,
      partNumberNorm: exec.plan?.partNumberNorm,
      groupRanks: new Map(),
      groupOemHits: new Map(),
    };
  }

  const [indexRows] = await pool.query(
    `
    SELECT
      psi.product_id,
      psi.category_id,
      psi.category_name,
      psi.category_slug,
      psi.brand_name,
      psi.model_name,
      psi.brand_slug,
      psi.model_slug,
      psi.part_number,
      psi.part_number_norm,
      psi.title,
      psi.product_name
    FROM product_search_index psi
    WHERE psi.status = 'active'
      AND psi.product_id IN (?)
    `,
    [candidateProductIds],
  );

  const { groupRanks, groupOemHits } = buildGroupRankContextFromIndexRows(
    indexRows,
    candidateProductIds,
    exec.plan?.partNumberNorm,
  );

  return {
    keyword,
    facets: exec.plan?.facets || {},
    plan: exec.plan,
    partNumberNorm: exec.plan?.partNumberNorm,
    groupRanks,
    groupOemHits,
    rawQuery,
  };
}
