/**
 * Maps URL-derived filter state → ListingSelection.
 * Pure adapter — no side effects (ARCH-MP-03B.1).
 */

import type { ListingSelection } from "../ListingIdentity.types";
import { applyYearSplit } from "./yearSplitAdapter";
import { normalizeLocationForSelection, type LocationCatalogRow } from "./locationAdapter";

export type UrlDerivedListingState = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: string | null;
  location?: string | null;
  keyword?: string | null;
  page?: number | string | null;
  sort?: string | null;
  /** Explicit UI fitment year (not from URL slug). */
  uiSelectedYear?: number | string | null;
};

export type UrlStateIngressOptions = {
  locations?: LocationCatalogRow[];
  /** Raw location slug from path (e.g. after `-tai-`). */
  locationSlug?: string | null;
};

/**
 * Convert parseUrlState-style output into ListingSelection.
 */
export function identityFromUrlState(
  state: UrlDerivedListingState = {},
  options: UrlStateIngressOptions = {},
): ListingSelection {
  const yearFields = applyYearSplit({
    year: state.year,
    uiSelectedYear: state.uiSelectedYear,
  });

  const location = normalizeLocationForSelection(
    state.location,
    options.locations || [],
  );

  return {
    category: String(state.category ?? "").trim() || null,
    brand: String(state.brand ?? "").trim() || null,
    model: String(state.model ?? "").trim() || null,
    ...yearFields,
    location,
    keyword: String(state.keyword ?? "").trim() || null,
    page: state.page ?? null,
    sort: state.sort ?? null,
  };
}
