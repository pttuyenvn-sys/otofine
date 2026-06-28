/**
 * SEARCH-SQL-SCALABILITY-OPTIMIZATION-01 — single grouped inventory scan.
 */

import { normalizeListingQuery } from "../../utils/listingQueryNormalize.js";
import {
  rankCategorySidebarSuggestions,
  rankSearchPreviewGroups,
} from "../../utils/categorySuggestRanking.js";
import { getModels } from "../productList.service.js";
import {
  buildSearchInventoryContext,
  fetchGroupedInventoryFromMatchedCte,
} from "./searchInventoryQuery.js";
import { isSearchGroupIndexEnabled } from "../../config/searchGroupIndexConfig.js";
import {
  fetchIndexGroupedInventory,
  resolveIndexSearchExecution,
} from "./runtime/indexSearchExecution.js";

function cleanValue(value) {
  const s = String(value ?? "").trim();
  return s || "";
}

/**
 * @param {Record<string, unknown>} rawQuery
 * @param {string} keyword
 */
export async function fetchSharedGroupedInventory(rawQuery, keyword) {
  const listing = normalizeListingQuery(rawQuery);
  let ctx;
  let vehicleGroups;
  let categoryGroups;
  /** @type {import('./runtime/indexSearchExecution.js').IndexSearchExecution | null} */
  let indexGroupExec = null;

  if (isSearchGroupIndexEnabled()) {
    indexGroupExec = await resolveIndexSearchExecution({
      ...rawQuery,
      keyword,
      query: keyword,
    });
    ({ vehicleGroups, categoryGroups } = await fetchIndexGroupedInventory(indexGroupExec, {
      stableKeys: true,
    }));
    ctx = await buildSearchInventoryContext(rawQuery, keyword);
    ctx.indexGroupExec = indexGroupExec;
  } else {
    ctx = await buildSearchInventoryContext(rawQuery, keyword);
    ({ vehicleGroups, categoryGroups } = await fetchGroupedInventoryFromMatchedCte(ctx));
  }
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
    ctx,
    indexGroupExec,
    vehicleGroups: rankedVehicleGroups,
    categoryGroups: rankedCategories.map(({ canonical_name, canonical_slug, total_count }) => ({
      canonical_name: cleanValue(canonical_name),
      canonical_slug: cleanValue(canonical_slug),
      total_count: Number(total_count) || 0,
    })),
  };
}
