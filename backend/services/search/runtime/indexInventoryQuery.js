/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — index grouped inventory + preview blocks.
 */

import { normalizeListingQuery } from "../../../utils/listingQueryNormalize.js";
import {
  rankCategorySidebarSuggestions,
  rankSearchPreviewGroups,
} from "../../../utils/categorySuggestRanking.js";
import { getModels } from "../../productList.service.js";
import { formatSearchPreviewGroupTitle } from "../../../utils/searchPreviewGroupLabel.js";
import { sortSuggestPreviewProducts } from "../../../utils/suggestPreviewProductSort.js";
import { PREVIEW_CANDIDATES_PER_GROUP } from "../searchInventoryQuery.js";
import { mapPreviewProductRow } from "../searchSuggestPreviewProducts.service.js";
import {
  fetchIndexGroupedInventory,
  fetchIndexMatchedRowsForGroups,
  resolveIndexSearchExecution,
} from "./indexSearchExecution.js";
import { hydrateIndexPreviewRows } from "./indexProductHydration.js";

function cleanValue(value) {
  const s = String(value ?? "").trim();
  return s || "";
}

function previewGroupKey(canonicalName, brand, model) {
  return `${cleanValue(canonicalName).toLowerCase()}|${cleanValue(brand).toLowerCase()}|${cleanValue(model).toLowerCase()}`;
}

/**
 * @param {Record<string, unknown>} rawQuery
 * @param {string} keyword
 */
export async function fetchIndexSharedGroupedInventory(rawQuery, keyword) {
  const exec = await resolveIndexSearchExecution({ ...rawQuery, keyword, query: keyword });
  exec.queryKeyword = keyword;
  const { vehicleGroups, categoryGroups } = await fetchIndexGroupedInventory(exec, {
    stableKeys: true,
  });

  const listing = normalizeListingQuery(rawQuery);
  const modelAll = Boolean(listing.brand && !listing.model);
  let modelRows = [];
  if (modelAll) {
    const models = await getModels(listing.brand);
    modelRows = models.map((row) => ({
      brand: listing.brand,
      model: row.ten_xe || row.model || row.name,
    }));
  }

  const rankedCategories = rankCategorySidebarSuggestions(categoryGroups, {
    keyword,
    brand: listing.brand,
    model: listing.model,
    modelAll,
    modelRows,
  });

  const rankedVehicleGroups = rankSearchPreviewGroups(vehicleGroups, {
    keyword,
    brand: listing.brand,
    model: listing.model,
  });

  return {
    exec,
    vehicleGroups: rankedVehicleGroups,
    categoryGroups: rankedCategories.map(({ canonical_name, canonical_slug, total_count }) => ({
      canonical_name: cleanValue(canonical_name),
      canonical_slug: cleanValue(canonical_slug),
      total_count: Number(total_count) || 0,
    })),
  };
}

/**
 * @param {import('./indexSearchExecution.js').IndexSearchExecution} exec
 * @param {object[]} rankedVehicleGroups
 * @param {ReturnType<typeof normalizeListingQuery>} listing
 * @param {object} [options]
 */
export async function buildIndexPreviewBlocks(exec, rankedVehicleGroups, listing, options = {}) {
  const productsPerGroup = Math.min(Math.max(Number(options.productsPerGroup) || 2, 1), 4);
  const previewGroups = rankedVehicleGroups || [];
  if (!previewGroups.length) return [];

  const groupPayloads = previewGroups.map((row) => {
    const brand = cleanValue(row.brand) || cleanValue(listing.brand);
    const model = cleanValue(row.model) || cleanValue(listing.model);
    const year = listing.year != null ? String(listing.year) : "";
    return {
      row,
      group: {
        title: formatSearchPreviewGroupTitle(row.canonical_name, { brand, model, year }),
        canonical_name: row.canonical_name,
        canonical_slug: row.canonical_slug,
        brand,
        model,
        year,
        total_count: Number(row.total_count) || 0,
      },
      key: previewGroupKey(row.canonical_name, brand, model),
    };
  });

  const indexRows = await fetchIndexMatchedRowsForGroups(
    exec,
    groupPayloads.map((g) => ({
      canonical_name: g.group.canonical_name,
      brand: g.group.brand,
      model: g.group.model,
    })),
    PREVIEW_CANDIDATES_PER_GROUP,
  );

  const hydrated = await hydrateIndexPreviewRows(indexRows, {
    keywordOrder: exec.keywordOrder,
    query: exec.queryKeyword,
  });
  const byGroup = new Map();
  for (const g of groupPayloads) byGroup.set(g.key, []);

  for (const row of hydrated) {
    const key = previewGroupKey(row.canonical_name, row.brand, row.model);
    if (!byGroup.has(key)) continue;
    byGroup.get(key).push(mapPreviewProductRow(row));
  }

  const seenProductIds = new Set();
  const blocks = [];
  for (const { group, key } of groupPayloads) {
    const sorted = sortSuggestPreviewProducts(byGroup.get(key) || []);
    const deduped = [];
    for (const product of sorted) {
      const id = Number(product?.id);
      if (!Number.isFinite(id) || seenProductIds.has(id)) continue;
      seenProductIds.add(id);
      deduped.push(product);
      if (deduped.length >= productsPerGroup) break;
    }
    blocks.push({ group, products: deduped });
  }
  return blocks;
}
