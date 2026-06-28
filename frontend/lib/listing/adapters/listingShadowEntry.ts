/**
 * Guarded shadow entry — compares legacy builders vs ListingIdentity egress.
 *
 * Returns structured diff when LISTING_IDENTITY_SHADOW=true; otherwise null.
 * No console output. No runtime/UI/query/URL side effects (ARCH-MP-03B.1).
 */

import { createRequire } from "node:module";
import { normalizeListingIdentity } from "../normalizeListingIdentity";
import { buildListingDisplayLabel } from "../buildListingDisplayLabel";
import { buildListingPath } from "../buildListingSlug";
import { buildListingQueryString } from "../buildListingQuery";
import {
  identityFromControllerState,
  type ControllerListingState,
} from "./identityFromControllerState";
import {
  compareListingIdentityShadow,
  buildLegacyShadowComparable,
  buildNextShadowComparable,
  type ShadowComparisonResult,
} from "./identityShadowCompare";
import { isListingIdentityShadowEnabled } from "./listingShadowConfig";
import type { LocationCatalogRow } from "./locationAdapter";

const require = createRequire(import.meta.url);

export type ListingIdentityShadowContext = {
  controller: ControllerListingState;
  locations?: LocationCatalogRow[];
};

function buildLegacyComparable(
  controller: ControllerListingState,
): { h1: string; path: string; queryString: string } {
  const listingSeoState = require("../../../components/pages/home/services/listingSeoState.js");
  const listingUrlState = require("../../../components/pages/home/services/listingUrlState.js");
  const listingRequestState = require("../../../components/pages/home/services/listingRequestState.js");

  const category = controller.category ?? "";
  const brand = controller.brand ?? "";
  const model = controller.model ?? "";
  const year = controller.year ?? "";
  const location = controller.location ?? "";
  const dbCategoryName = controller.dbCategoryName ?? category;
  const dbLocationName = controller.dbLocationName ?? location;

  const h1 = listingSeoState.buildListingIdentity({
    categoryName: dbCategoryName,
    hasCategory: Boolean(String(category || dbCategoryName).trim()),
    brand,
    model,
    year,
    location: dbLocationName,
  }).h1;

  const path = listingUrlState.buildPathFromState({
    category,
    brand,
    model,
    year,
    location,
  });

  const queryString = listingRequestState.buildProductListParams({
    category,
    brand,
    model,
    year,
    location,
    keyword: controller.keyword,
    page: controller.page,
    sort: controller.sort,
  });

  return { h1, path, queryString };
}

function buildNextComparable(
  controller: ControllerListingState,
  locations: LocationCatalogRow[] = [],
): { h1: string; path: string; queryString: string } {
  const selection = identityFromControllerState(controller, { locations });
  const identity = normalizeListingIdentity(selection);

  return {
    h1: buildListingDisplayLabel(identity),
    path: buildListingPath(identity),
    queryString: buildListingQueryString(identity, {
      page: controller.page,
      sort: controller.sort,
    }),
  };
}

/**
 * Single guarded shadow entry point.
 * @returns diff when flag enabled; null when disabled (no behavior change).
 */
export function runListingIdentityShadow(
  context: ListingIdentityShadowContext,
): ShadowComparisonResult | null {
  if (!isListingIdentityShadowEnabled()) {
    return null;
  }

  const legacyBuilt = buildLegacyComparable(context.controller);
  const nextBuilt = buildNextComparable(
    context.controller,
    context.locations || [],
  );

  return compareListingIdentityShadow(
    buildLegacyShadowComparable({
      h1: legacyBuilt.h1,
      path: legacyBuilt.path,
      queryString: legacyBuilt.queryString,
    }),
    buildNextShadowComparable({
      displayLabel: nextBuilt.h1,
      path: nextBuilt.path,
      queryString: nextBuilt.queryString,
    }),
  );
}

export { isListingIdentityShadowEnabled, LISTING_IDENTITY_SHADOW_ENV } from "./listingShadowConfig";
