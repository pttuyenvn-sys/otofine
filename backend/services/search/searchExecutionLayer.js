/**
 * HYBRID-SEARCH-ENGINE-IMPLEMENT-01 — search execution layer entry.
 * Replaces only keyword/product matching; ranking and grouping unchanged.
 */

import { buildProductListFiltersWithVisibility } from "../../repositories/productList.repository.js";
import { getSearchEngineMode } from "../../config/searchEngineConfig.js";
import { resolveSearchExecution } from "./providers/searchProviderChain.js";

/**
 * @param {Awaited<ReturnType<typeof import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved>>} pc
 * @param {Record<string, unknown>} rawQuery
 */
export async function buildSearchExecutionFilters(pc, rawQuery) {
  const keyword = String(rawQuery.keyword || rawQuery.query || rawQuery.q || "").trim();
  const mode = getSearchEngineMode();

  if (mode === "legacy") {
    const legacy = await buildProductListFiltersWithVisibility(pc, { ...rawQuery, keyword });
    return {
      ...legacy,
      provider: "legacy",
      needsProductMetaJoin: false,
    };
  }

  const result = await resolveSearchExecution(pc, { ...rawQuery, keyword });
  return {
    where: result.where,
    params: result.params,
    keywordOrder: result.keywordOrder,
    provider: result.provider,
    needsProductMetaJoin: result.needsProductMetaJoin,
    qualityScore: result.qualityScore,
    parityUsed: result.parityUsed,
  };
}
