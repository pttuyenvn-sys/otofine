/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — index runtime (product_search_index → hydrate products).
 */

import { normalizeListingQuery } from "../../../utils/listingQueryNormalize.js";
import {
  scoreKeywordRelevance,
} from "../../../utils/keywordRelevanceRanking.js";
import { stripHtml, formatVND } from "../../../utils/textFormat.js";
import { buildProductCardHighlights } from "../../../utils/productCardSubtitle.js";
import { legacySlugForId } from "../../../utils/productSlug.js";
import * as cardRepo from "../../../repositories/productCard.repository.js";
import {
  attachCanonicalFieldsFromMap,
  loadPrimaryFitmentCarsByProductIds,
} from "../../../modules/products/services/canonicalPath.server.js";
import {
  buildProductIdentity,
  pickPrimaryFitment,
} from "../../../../frontend/lib/identity/buildProductIdentity.js";
import {
  assembleSearchPreviewBatch,
  assembleSearchSuggestResponse,
} from "./searchSuggestAssembly.js";
import {
  fetchIndexSharedGroupedInventory,
  buildIndexPreviewBlocks,
} from "./indexInventoryQuery.js";
import {
  countIndexMatchedProducts,
  fetchIndexRankedProductIds,
  resolveIndexSearchExecution,
} from "./indexSearchExecution.js";

function cleanKeyword(rawQuery) {
  return String(rawQuery.query || rawQuery.keyword || rawQuery.q || "").trim();
}

function normalizeThumbnailUrl(raw) {
  if (!raw) return null;
  const u = String(raw).trim();
  if (!u) return null;
  if (u.startsWith("http")) return u;
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return u;
  return `${base}/${decodeURIComponent(u).replace(/^\/+/, "")}`;
}

async function hydrateSearchProductsResponse(ids, opts) {
  const perPage = Math.min(100, Math.max(1, Number(opts.perPage) || 16));
  const pageNum = Math.max(1, Number(opts.page) || 1);
  const q = String(opts.q || "").trim();

  if (!ids.length) {
    return {
      data: [],
      found: 0,
      source: "search-index",
      page: pageNum,
      totalPages: 1,
      perPage,
    };
  }

  const hydrated = await cardRepo.hydrateHomeCardsByIdsInOrder(ids);
  const fitmentMap = await loadPrimaryFitmentCarsByProductIds(
    (await import("../../../config/db.js")).pool,
    ids,
  );

  let data = hydrated.map((row) => {
    const shortDescription = stripHtml(row.shortDescription);
    const primaryFitment = pickPrimaryFitment(fitmentMap.get(Number(row.id)) || []);
    const identity = buildProductIdentity(
      { id: row.id, partName: row.partName, partNumber: row.partNumber },
      primaryFitment,
    );
    const displayTitle = identity.h1;
    const sub = buildProductCardHighlights({
      productTitle: displayTitle,
      partNumber: row.partNumber,
      partName: row.partName,
      origin: row.origin,
      provinceName: row.provinceName,
      shopName: row.shopName,
      compatibilityLine: row.compatibilityLine,
      stock: row.stock,
      updatedAt: row.updatedAt,
    });
    return attachCanonicalFieldsFromMap(
      {
        id: row.id,
        slug: row.slug,
        legacySlug: legacySlugForId(row.id),
        partNumber: row.partNumber,
        partName: row.partName,
        shortDescription,
        displayTitle,
        priceText: formatVND(row.price),
        summary: sub.summary,
        cardHighlights: sub.cardHighlights,
        subtitleLine1: sub.subtitleLine1,
        subtitleLine2: sub.subtitleLine2,
        image: normalizeThumbnailUrl(row.thumbRaw),
        origin: row.origin,
        shopName: row.shopName,
        provinceName: row.provinceName,
        phone: row.phone,
      },
      fitmentMap,
    );
  });

  if (q) {
    data.sort((a, b) => {
      const sa = scoreKeywordRelevance({
        title: a.partName || a.displayTitle || "",
        partNumber: a.partNumber || "",
        shortDescription: a.shortDescription || "",
        description: "",
        query: q,
      });
      const sb = scoreKeywordRelevance({
        title: b.partName || b.displayTitle || "",
        partNumber: b.partNumber || "",
        shortDescription: b.shortDescription || "",
        description: "",
        query: q,
      });
      return sa - sb;
    });
  }

  return {
    data,
    found: ids.length,
    source: "search-index",
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(ids.length / perPage)),
    perPage,
  };
}

export const SearchIndexRuntime = {
  async searchSuggest(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) {
      return { groups: [], viewAll: { label: "", url: "/" }, categories: [] };
    }
    const listing = normalizeListingQuery(rawQuery);
    const { exec, vehicleGroups, categoryGroups } = await fetchIndexSharedGroupedInventory(
      rawQuery,
      keyword,
    );
    const blocks = await buildIndexPreviewBlocks(exec, vehicleGroups, listing, {
      groupLimit: rawQuery.groupLimit,
      productsPerGroup: rawQuery.productsPerGroup,
    });
    return assembleSearchSuggestResponse(rawQuery, blocks, categoryGroups);
  },

  async searchSidebar(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return [];
    const { categoryGroups } = await fetchIndexSharedGroupedInventory(rawQuery, keyword);
    return categoryGroups;
  },

  async searchPreview(rawQuery = {}) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return [];
    const listing = normalizeListingQuery(rawQuery);
    const { exec, vehicleGroups } = await fetchIndexSharedGroupedInventory(rawQuery, keyword);
    const blocks = await buildIndexPreviewBlocks(exec, vehicleGroups, listing, {
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
    const { exec, vehicleGroups, categoryGroups } = await fetchIndexSharedGroupedInventory(
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
        source: "search-index",
        page: pageNum,
        totalPages: 1,
        perPage,
      };
    }

    const exec = await resolveIndexSearchExecution({
      ...opts,
      query: q,
      keyword: q,
      brand: opts.brand,
      model: opts.model,
      year: opts.year,
      category: opts.category,
      cityId: opts.cityId,
      city: opts.city,
      location: opts.location,
    });

    const found = await countIndexMatchedProducts(exec);
    const ids = await fetchIndexRankedProductIds(exec, perPage, offset);
    const body = await hydrateSearchProductsResponse(ids, { ...opts, perPage, page: pageNum, q });
    return { ...body, found };
  },

  /** @internal parity helper */
  async searchTopProductIds(rawQuery = {}, limit = 20) {
    const keyword = cleanKeyword(rawQuery);
    if (!keyword) return { ids: [], provider: null };
    const exec = await resolveIndexSearchExecution({ ...rawQuery, keyword, query: keyword });
    const ids = await fetchIndexRankedProductIds(exec, limit, 0);
    return { ids, provider: exec.provider || null };
  },
};
