import { API_BASE } from "@/lib/config";
import { fetchCategoryCatalog } from "@/lib/seo/buildCategoryOwnerPath";

const EMPTY_REMOTE = {
  products: [],
  brandModels: [],
  partNames: [],
  categoryBrandListings: [],
  cbmListings: [],
  bmyListings: [],
  bmyRangeListings: [],
  cbmyRangeListings: [],
  brandLocationListings: [],
  brandVehicleLocationListings: [],
  categoryBrandLocationListings: [],
  categoryBrandVehicleLocationListings: [],
  brandVehicleYearRangeLocationListings: [],
  categoryBrandVehicleYearRangeLocationListings: [],
  governanceInventory: {
    brandModelCounts: [],
    brandCounts: [],
    locationHubs: [],
    categoryLocationPairs: [],
  },
};

/**
 * @returns {Promise<{ remote: typeof EMPTY_REMOTE, categoryRows: Array<Record<string, unknown>> }>}
 */
export async function loadMarketplaceSitemapData() {
  let remote = { ...EMPTY_REMOTE };

  try {
    const res = await fetch(`${API_BASE}/seo/sitemap-data`, {
      next: { revalidate: 86400 },
    });
    if (res.ok) remote = await res.json();
  } catch {
    /* build / offline */
  }

  const { rows: categoryRows } = await fetchCategoryCatalog();
  return { remote, categoryRows };
}

/**
 * @param {typeof EMPTY_REMOTE} remote
 */
export function buildMarketplaceGovernanceMaps(remote) {
  const inv = remote.governanceInventory || {};
  const bmCountMap = new Map(
    (inv.brandModelCounts || []).map((row) => [
      `${row.brand}\0${row.model}`,
      Number(row.productCount) || 0,
    ]),
  );
  const brandCountMap = new Map(
    (inv.brandCounts || []).map((row) => [
      String(row.brand || ""),
      Number(row.productCount) || 0,
    ]),
  );
  return { inv, bmCountMap, brandCountMap };
}
