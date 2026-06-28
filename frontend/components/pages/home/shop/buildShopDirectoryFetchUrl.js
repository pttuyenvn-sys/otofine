import { API_BASE } from "@/lib/config";

const DEFAULT_LIMIT = 5;

/**
 * Shared client fetch URL for GET /api/public/shops (desktop + mobile).
 *
 * @param {{ brand?: string, provinceSlug?: string }} query
 * @param {{ limit?: number }} [options]
 */
export function buildShopDirectoryFetchUrl(query = {}, { limit = DEFAULT_LIMIT } = {}) {
  const params = new URLSearchParams({
    perPage: String(limit),
    sort: "rank",
    page: "1",
  });
  if (query.brand) params.set("brand", query.brand);
  if (query.provinceSlug) params.set("provinceSlug", query.provinceSlug);
  return `${API_BASE}/public/shops?${params.toString()}`;
}

export function shopDirectoryQueryKey(query = {}) {
  return JSON.stringify({
    brand: query.brand || "",
    provinceSlug: query.provinceSlug || "",
  });
}
