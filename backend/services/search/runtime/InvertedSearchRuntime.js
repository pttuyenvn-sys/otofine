/**
 * SEARCH-INVERTED-INDEX-RUNTIME-01 — inverted runtime (search_token_index → product_search_index).
 */

import { normalizeListingQuery } from "../../../utils/listingQueryNormalize.js";
import { formatVND } from "../../../utils/textFormat.js";
import { pool } from "../../../config/db.js";
import {
  assembleSearchPreviewBatch,
  assembleSearchSuggestResponse,
} from "./searchSuggestAssembly.js";
import {
  fetchInvertedSharedGroupedInventory,
  buildInvertedPreviewBlocks,
} from "./invertedInventoryQuery.js";
import {
  resolveInvertedSearchExecution,
  countIndexMatchedProducts,
} from "./invertedSearchExecution.js";
import { SearchIndexDocumentReader } from "./SearchIndexDocumentReader.js";

function cleanKeyword(rawQuery) {
  return String(rawQuery.query || rawQuery.keyword || rawQuery.q || "").trim();
}

async function hydrateInvertedSearchProducts(ids, opts) {
  const perPage = Math.min(100, Math.max(1, Number(opts.perPage) || 16));
  const pageNum = Math.max(1, Number(opts.page) || 1);

  if (!ids.length) {
    return {
      data: [],
      found: 0,
      source: "inverted-index",
      page: pageNum,
      totalPages: 1,
      perPage,
    };
  }

  const previewRows = await SearchIndexDocumentReader.readForPreview(
    ids.map((id) => ({ product_id: Number(id) })),
  );

  const [pathRows] = await pool.query(
    `SELECT product_id, canonical_path FROM product_search_index WHERE product_id IN (?) AND status = 'active'`,
    [ids],
  );
  const pathById = new Map(pathRows.map((r) => [Number(r.product_id), r.canonical_path]));

  const data = previewRows.map((row) => ({
    id: row.id,
    slug: pathById.get(Number(row.id))?.replace(/^\//, "") || String(row.id),
    partNumber: row.partNumber,
    partName: row.partName,
    displayTitle: row.partName,
    priceText: row.price != null ? formatVND(row.price) : "",
    image: row.imageUrl,
    shopName: row.shopName,
    provinceName: row.provinceName,
    stock: row.stock,
  }));

  return {
    data,
    found: ids.length,
    source: "inverted-index",
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(ids.length / perPage)),
    perPage,
  };
}

export const InvertedSearchRuntime = {
  async searchSuggest(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) {
      return { groups: [], viewAll: { label: "", url: "/" }, categories: [] };
    }
    const listing = normalizeListingQuery(rawQuery);
    const { exec, vehicleGroups, categoryGroups } = await fetchInvertedSharedGroupedInventory(
      rawQuery,
      keyword,
    );
    const blocks = await buildInvertedPreviewBlocks(exec, vehicleGroups, listing, {
      groupLimit: rawQuery.groupLimit,
      productsPerGroup: rawQuery.productsPerGroup,
    });
    return assembleSearchSuggestResponse(rawQuery, blocks, categoryGroups);
  },

  async searchSidebar(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return [];
    const { categoryGroups } = await fetchInvertedSharedGroupedInventory(rawQuery, keyword);
    return categoryGroups;
  },

  async searchPreview(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return [];
    const listing = normalizeListingQuery(rawQuery);
    const { exec, vehicleGroups } = await fetchInvertedSharedGroupedInventory(rawQuery, keyword);
    const blocks = await buildInvertedPreviewBlocks(exec, vehicleGroups, listing, {
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
    const { exec, vehicleGroups, categoryGroups } = await fetchInvertedSharedGroupedInventory(
      rawQuery,
      keyword,
    );
    return {
      vehicleGroups,
      categoryGroups,
      provider: exec.provider || null,
    };
  },

  async searchProducts(opts = {}) {
    const q = String(opts.q || "").trim();
    const perPage = Math.min(100, Math.max(1, Number(opts.perPage) || 16));
    const pageNum = Math.max(1, Number(opts.page) || 1);
    const offset = (pageNum - 1) * perPage;

    if (!q) {
      return {
        data: [],
        found: 0,
        source: "inverted-index",
        page: pageNum,
        totalPages: 1,
        perPage,
      };
    }

    const exec = await resolveInvertedSearchExecution({
      ...opts,
      query: q,
      keyword: q,
    });
    const found = await countIndexMatchedProducts(exec);
    const ids = exec.candidateProductIds.slice(offset, offset + perPage);
    const body = await hydrateInvertedSearchProducts(ids, { ...opts, perPage, page: pageNum });
    return { ...body, found };
  },

  /** @internal parity helper */
  async searchTopProductIds(rawQuery = {}, limit = 20) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return { ids: [], provider: null };
    const exec = await resolveInvertedSearchExecution({ ...rawQuery, keyword, query: keyword });
    return {
      ids: exec.candidateProductIds.slice(0, limit),
      provider: exec.provider || null,
    };
  },
};
