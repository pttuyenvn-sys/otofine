/**
 * Maps legacy useListingController state → ListingSelection.
 * Pure adapter — no side effects (ARCH-MP-03B.1).
 */

import type { ListingSelection } from "../ListingIdentity.types";
import { applyYearSplit } from "./yearSplitAdapter";
import {
  normalizeLocationForSelection,
  type LocationCatalogRow,
} from "./locationAdapter";

export type ControllerListingState = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: string | null;
  location?: string | null;
  keyword?: string | null;
  page?: number | string | null;
  sort?: string | null;
  /**
   * Explicit UI fitment year pick — maps to selectedYear (query only).
   * Legacy `year` string still supplies SEO range via yearSplitAdapter.
   */
  uiSelectedYear?: number | string | null;
  /**
   * Catalog-resolved names (mirrors Home.jsx dbCategoryName / dbLocationName for H1).
   * Used for selection category/location when provided.
   */
  dbCategoryName?: string | null;
  dbLocationName?: string | null;
  /** DB canonical_slug for category-only URL owner. */
  categoryCanonicalSlug?: string | null;
};

export type ControllerStateIngressOptions = {
  locations?: LocationCatalogRow[];
  /** DB canonical_slug for category-only URL owner. */
  categoryCanonicalSlug?: string | null;
};

/**
 * Convert React controller filter state into ListingSelection.
 */
export function identityFromControllerState(
  state: ControllerListingState = {},
  options: ControllerStateIngressOptions = {},
): ListingSelection {
  const yearFields = applyYearSplit({
    year: state.year,
    uiSelectedYear: state.uiSelectedYear,
  });

  const category =
    String(state.dbCategoryName ?? state.category ?? "").trim() || null;

  const location =
    normalizeLocationForSelection(
      state.dbLocationName ?? state.location,
      options.locations || [],
    ) || null;

  return {
    category,
    brand: String(state.brand ?? "").trim() || null,
    model: String(state.model ?? "").trim() || null,
    ...yearFields,
    location,
    keyword: String(state.keyword ?? "").trim() || null,
    page: state.page ?? null,
    sort: state.sort ?? null,
  };
}
