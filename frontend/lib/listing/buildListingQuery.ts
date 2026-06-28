import type { ListingIdentity, ListingProductQuery } from "./ListingIdentity.types";

const DEFAULT_SORT = "popular";
const DEFAULT_PAGE = 1;

function cleanQueryValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const low = trimmed.toLowerCase();
    if (low === "null" || low === "undefined") return null;
    return trimmed;
  }
  return String(value);
}

function parsePage(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE;
  return Math.floor(n);
}

/**
 * Documents fitment overlap semantics for grid filtering.
 * Product matches when `year_from <= selectedYear AND year_to >= selectedYear`.
 */
export function listingYearFitmentOverlap(selectedYear: number): {
  yearFromLte: number;
  yearToGte: number;
} {
  return {
    yearFromLte: selectedYear,
    yearToGte: selectedYear,
  };
}

export type BuildListingQueryOptions = {
  page?: number | string | null;
  sort?: string | null;
};

/**
 * Build structured product-list query from ListingIdentity.
 *
 * Grid year filter uses `selectedYear` only — never `yearFrom` / `yearTo`.
 */
export function buildListingQuery(
  identity: ListingIdentity,
  options: BuildListingQueryOptions = {},
): ListingProductQuery {
  return {
    category: identity.category,
    brand: identity.brand,
    model: identity.model,
    year: identity.selectedYear,
    location: identity.location,
    keyword: identity.keyword,
    page: parsePage(options.page ?? DEFAULT_PAGE),
    sort: cleanQueryValue(options.sort) || DEFAULT_SORT,
  };
}

/**
 * Serialize product-list query as URLSearchParams string.
 * Omits empty dimensions; `year` is emitted only when `selectedYear` is set.
 */
export function buildListingQueryString(
  identity: ListingIdentity,
  options: BuildListingQueryOptions = {},
): string {
  const query = buildListingQuery(identity, options);
  const params = new URLSearchParams();

  if (query.category) params.append("category", query.category);
  if (query.brand) params.append("brand", query.brand);
  if (query.model) params.append("model", query.model);
  if (query.year != null) params.append("year", String(query.year));
  if (query.location) params.append("location", query.location);
  if (query.keyword) params.append("keyword", query.keyword);
  if (query.page > 1) params.append("page", String(query.page));
  if (query.sort && query.sort !== DEFAULT_SORT) {
    params.append("sort", query.sort);
  }

  return params.toString();
}
