/** @typedef {{
 *   category?: string,
 *   brand?: string,
 *   model?: string,
 *   year?: string,
 *   location?: string,
 *   keyword?: string,
 *   page?: number,
 *   sort?: string,
 * }} MarketplaceListingFilters */

/**
 * @param {string} pathname
 * @param {string} [search]
 */
export function buildMarketplaceListingRouteKey(pathname, search = "") {
  const path = String(pathname || "/").trim() || "/";
  const qs = String(search || "");
  return `${path}${qs.startsWith("?") ? qs : qs ? `?${qs}` : ""}`;
}

export const MARKETPLACE_LISTING_SESSION_KEY = "otofine:marketplace-listing-v1";
export const MARKETPLACE_LISTING_EXIT_FLAG = "otofine:marketplace-listing-exit-v1";
export const MARKETPLACE_LISTING_SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * Stable cache key aligned with Home product-list fetch params.
 * @param {MarketplaceListingFilters} filters
 */
export function buildMarketplaceListQueryKey(filters) {
  const f = filters && typeof filters === "object" ? filters : {};
  return [
    String(f.category || "").trim(),
    String(f.brand || "").trim(),
    String(f.model || "").trim(),
    String(f.year || "").trim(),
    String(f.location || "").trim(),
    String(f.keyword || "").trim(),
    String(Math.max(1, Number(f.page) || 1)),
    String(f.sort || "popular").trim() || "popular",
  ].join("\0");
}

/**
 * @param {MarketplaceListingFilters} filters
 * @param {string} pathname
 * @param {string} [search]
 */
export function buildMarketplaceListingSnapshot({
  filters,
  pathname,
  search = "",
  scrollY = 0,
  products = [],
  totalPages = 1,
}) {
  const normalizedFilters = {
    category: String(filters?.category || "").trim(),
    brand: String(filters?.brand || "").trim(),
    model: String(filters?.model || "").trim(),
    year: String(filters?.year || "").trim(),
    location: String(filters?.location || "").trim(),
    keyword: String(filters?.keyword || "").trim(),
    page: Math.max(1, Number(filters?.page) || 1),
    sort: String(filters?.sort || "popular").trim() || "popular",
  };

  return {
    v: 1,
    savedAt: Date.now(),
    routeKey: buildMarketplaceListingRouteKey(pathname, search),
    scrollY: Math.max(0, Number(scrollY) || 0),
    filters: normalizedFilters,
    listQueryKey: buildMarketplaceListQueryKey(normalizedFilters),
    products: Array.isArray(products) ? products : [],
    totalPages: Math.max(1, Number(totalPages) || 1),
  };
}

/**
 * @param {ReturnType<typeof buildMarketplaceListingSnapshot>} snapshot
 */
export function saveMarketplaceListingSnapshot(snapshot) {
  if (typeof window === "undefined" || !snapshot) return false;
  try {
    sessionStorage.setItem(
      MARKETPLACE_LISTING_SESSION_KEY,
      JSON.stringify(snapshot),
    );
    return true;
  } catch {
    return false;
  }
}

export function markMarketplaceListingProductExit() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MARKETPLACE_LISTING_EXIT_FLAG, "1");
  } catch {
    // ignore
  }
}

export function clearMarketplaceListingExitFlag() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MARKETPLACE_LISTING_EXIT_FLAG);
  } catch {
    // ignore
  }
}

/**
 * @param {string} pathname
 * @param {string} [search]
 */
export function peekMarketplaceListingSnapshot(pathname, search = "") {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MARKETPLACE_LISTING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return null;
    if (Date.now() - Number(parsed.savedAt || 0) > MARKETPLACE_LISTING_SESSION_TTL_MS) {
      return null;
    }
    const routeKey = buildMarketplaceListingRouteKey(pathname, search);
    if (parsed.routeKey !== routeKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Consume a saved listing snapshot when returning from product detail.
 *
 * @param {string} pathname
 * @param {string} [search]
 */
export function takeMarketplaceListingSnapshotForRestore(pathname, search = "") {
  if (typeof window === "undefined") return null;
  let pendingExit = false;
  try {
    pendingExit = sessionStorage.getItem(MARKETPLACE_LISTING_EXIT_FLAG) === "1";
  } catch {
    pendingExit = false;
  }
  if (!pendingExit) return null;

  const snapshot = peekMarketplaceListingSnapshot(pathname, search);
  clearMarketplaceListingExitFlag();
  return snapshot;
}

/** @internal — test reset */
export function resetMarketplaceListingSessionForTests() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MARKETPLACE_LISTING_SESSION_KEY);
    sessionStorage.removeItem(MARKETPLACE_LISTING_EXIT_FLAG);
  } catch {
    // ignore
  }
}
