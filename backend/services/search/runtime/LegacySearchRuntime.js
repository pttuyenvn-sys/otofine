/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — legacy runtime (products-based search).
 */

import { fetchSharedGroupedInventory } from "../searchGroupedInventory.service.js";
import { buildPreviewBlocksFromInventory } from "../searchSuggestPreviewProducts.service.js";
import { normalizeListingQuery } from "../../../utils/listingQueryNormalize.js";
import {
  assembleSearchPreviewBatch,
  assembleSearchSuggestResponse,
} from "./searchSuggestAssembly.js";
import * as productSearchService from "../../productSearch.service.js";
import { buildListOrderBy } from "../../../repositories/productList.repository.js";
import { buildSearchInventoryContext } from "../searchInventoryQuery.js";
import { pool } from "../../../config/db.js";

function cleanKeyword(rawQuery) {
  return String(rawQuery.query || rawQuery.keyword || rawQuery.q || "").trim();
}

export const LegacySearchRuntime = {
  async searchSuggest(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) {
      return { groups: [], viewAll: { label: "", url: "/" }, categories: [] };
    }
    const listing = normalizeListingQuery(rawQuery);
    const { ctx, vehicleGroups, categoryGroups } = await fetchSharedGroupedInventory(rawQuery, keyword);
    const blocks = await buildPreviewBlocksFromInventory(ctx, vehicleGroups, listing, {
      groupLimit: rawQuery.groupLimit,
      productsPerGroup: rawQuery.productsPerGroup,
    });
    return assembleSearchSuggestResponse(rawQuery, blocks, categoryGroups);
  },

  async searchSidebar(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return [];
    const { categoryGroups } = await fetchSharedGroupedInventory(rawQuery, keyword);
    return categoryGroups;
  },

  async searchPreview(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return [];
    const listing = normalizeListingQuery(rawQuery);
    const { ctx, vehicleGroups } = await fetchSharedGroupedInventory(rawQuery, keyword);
    const blocks = await buildPreviewBlocksFromInventory(ctx, vehicleGroups, listing, {
      groupLimit: rawQuery.groupLimit,
      productsPerGroup: rawQuery.productsPerGroup,
    });
    return assembleSearchPreviewBatch(blocks);
  },

  async searchInventory(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) {
      return { vehicleGroups: [], categoryGroups: [], provider: null };
    }
    const { ctx, vehicleGroups, categoryGroups } = await fetchSharedGroupedInventory(rawQuery, keyword);
    return {
      vehicleGroups,
      categoryGroups,
      provider: ctx.searchProvider || null,
    };
  },

  async searchProducts(opts = {}) {
    return productSearchService.searchProductsPublic(opts);
  },

  /** @internal parity helper */
  async searchTopProductIds(rawQuery = {}, limit = 20) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return { ids: [], provider: null };
    const ctx = await buildSearchInventoryContext(rawQuery, keyword);
    const pid = ctx.pc.idExpr("p");
    const orderSql = buildListOrderBy({
      keywordOrder: ctx.keywordOrder,
      sort: "popular",
      freshnessExpr: ctx.pc.orderExprQualified("p"),
      pc: ctx.pc,
    });
    const [rows] = await pool.query(
      `
      SELECT ${pid} AS id
      ${ctx.fromSql}
      ${ctx.where}
      GROUP BY ${pid}
      ${orderSql}
      LIMIT ?
      `,
      [...ctx.params, limit],
    );
    return { ids: rows.map((r) => Number(r.id)), provider: ctx.searchProvider || null };
  },
};
