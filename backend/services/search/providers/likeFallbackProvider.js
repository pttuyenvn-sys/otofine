/**
 * Legacy LIKE keyword matching — compatibility fallback.
 */

import { buildProductListFilters } from "../../../repositories/productList.repository.js";

/**
 * @param {Awaited<ReturnType<typeof import('../../../utils/productsTableColumns.server.js').getProductsColumnsResolved>>} pc
 * @param {Record<string, unknown>} rawQuery
 */
export function buildLikeFallbackClause(pc, rawQuery) {
  const { where, params, keywordOrder } = buildProductListFilters(pc, rawQuery);
  return {
    where,
    params,
    keywordOrder,
    active: true,
    provider: "like",
    needsProductMetaJoin: false,
  };
}
