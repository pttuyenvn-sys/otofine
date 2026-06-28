/**
 * Marketplace client ListingIdentity egress (ARCH-MP-03B.6.1).
 *
 * Controller state → identityFromControllerState → normalizeListingIdentity
 * → buildListingDisplayLabel / buildListingPath
 */

import { slugifyVi } from "../../seo/slugify";
import { normalizeListingIdentity } from "../normalizeListingIdentity";
import type { ListingIdentity } from "../ListingIdentity.types";
import { buildListingDisplayLabel } from "../buildListingDisplayLabel";
import { buildListingPath } from "../buildListingSlug";
import {
  identityFromControllerState,
  type ControllerListingState,
  type ControllerStateIngressOptions,
} from "./identityFromControllerState";
import type { LocationCatalogRow } from "./locationAdapter";

export type ClientUrlStateSlice = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: string | null;
  location?: string | null;
};

export type ClientListingPathIngress = {
  dbCategoryName?: string | null;
  dbLocationName?: string | null;
  locations?: LocationCatalogRow[];
  /** DB-owned category slug for category-only / category+location URLs. */
  categoryCanonicalSlug?: string | null;
};

/**
 * Canonical client ListingIdentity from controller filter state.
 */
export function buildClientListingIdentity(
  controller: ControllerListingState = {},
  options: ControllerStateIngressOptions = {},
): ListingIdentity {
  return normalizeListingIdentity(identityFromControllerState(controller, options));
}

/**
 * Human-readable listing label (H1 / pageTitle / document.title source).
 */
export function buildClientListingDisplayLabel(
  controller: ControllerListingState = {},
  options: ControllerStateIngressOptions = {},
): string {
  return buildListingDisplayLabel(buildClientListingIdentity(controller, options));
}

/**
 * Marketplace listing pathname from controller state.
 */
export function buildClientListingPath(
  controller: ControllerListingState = {},
  options: ControllerStateIngressOptions = {},
): string {
  const canonicalSlug = String(
    options.categoryCanonicalSlug ?? controller.categoryCanonicalSlug ?? "",
  )
    .trim()
    .toLowerCase();
  const category = String(
    controller.dbCategoryName ?? controller.category ?? "",
  ).trim();
  const brand = String(controller.brand ?? "").trim();
  const model = String(controller.model ?? "").trim();
  const year = String(controller.year ?? "").trim();
  const location = String(
    controller.dbLocationName ?? controller.location ?? "",
  ).trim();

  if (canonicalSlug && category && !brand && !model && !year) {
    if (!location) return `/${canonicalSlug}`;
    const locSlug = slugifyVi(location);
    if (locSlug) return `/${canonicalSlug}-tai-${locSlug}`;
    return `/${canonicalSlug}`;
  }

  return buildListingPath(buildClientListingIdentity(controller, options));
}

/**
 * Build listing path from URL-state slice plus catalog-resolved display names.
 */
export function buildClientListingPathFromUrlState(
  state: ClientUrlStateSlice = {},
  ingress: ClientListingPathIngress = {},
): string {
  return buildClientListingPath(
    {
      category: state.category,
      brand: state.brand,
      model: state.model,
      year: state.year,
      location: state.location,
      dbCategoryName: ingress.dbCategoryName,
      dbLocationName: ingress.dbLocationName,
      categoryCanonicalSlug: ingress.categoryCanonicalSlug,
    },
    { locations: ingress.locations || [], categoryCanonicalSlug: ingress.categoryCanonicalSlug },
  );
}
