/**
 * Maps resolved marketplace SEO entity → ListingSelection.
 * Pure adapter — no side effects (ARCH-MP-03B.1).
 */

import type { ListingSelection } from "../ListingIdentity.types";
import { applyYearSplit } from "./yearSplitAdapter";
import { normalizeLocationDisplayName } from "./locationAdapter";

export type MarketplaceEntityKind =
  | "product"
  | "product_not_found"
  | "vehicle"
  | "knowledge"
  | "category"
  | "unknown";

export type MarketplaceCategoryMeta = {
  canonicalName?: string | null;
  categoryName?: string | null;
  cbmBrand?: string | null;
  cbmModel?: string | null;
  cbmYear?: string | null;
  cbmLocation?: string | null;
};

export type MarketplaceVehicleParsed = {
  brand?: string | null;
  model?: string | null;
  year?: string | null;
  locationName?: string | null;
};

export type MarketplaceEntity = {
  kind?: MarketplaceEntityKind | string | null;
  categoryMeta?: MarketplaceCategoryMeta | null;
  vehicleSeo?: {
    parsed?: MarketplaceVehicleParsed | null;
  } | null;
  landing?: {
    filters?: {
      category?: string | null;
      brand?: string | null;
      model?: string | null;
      year?: string | null;
      location?: string | null;
    } | null;
  } | null;
  requestSlug?: string | null;
};

export type MarketplaceEntityIngressOptions = {
  keyword?: string | null;
  page?: number | string | null;
  sort?: string | null;
  /** Optional UI fitment year (not from entity). */
  uiSelectedYear?: number | string | null;
};

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function normalizeLocationFromSlug(
  entity: MarketplaceEntity,
  location: string | null,
): string | null {
  if (!location) return null;
  const requestSlug = String(entity.requestSlug || "").trim().toLowerCase();
  const locationIndex = requestSlug.lastIndexOf("-tai-");
  const requestLocationSlug =
    locationIndex >= 0 ? requestSlug.slice(locationIndex + "-tai-".length) : "";

  const raw = String(location).trim();
  if (!raw) return null;

  if (requestLocationSlug.startsWith("tp-")) {
    return /^TP Hồ Chí Minh$/i.test(raw) ? "TP Hồ Chí Minh" : raw;
  }

  return normalizeLocationDisplayName(raw);
}

/**
 * Build ListingSelection from SSR-resolved marketplace entity (vehicle/category).
 */
export function identityFromMarketplaceEntity(
  entity: MarketplaceEntity | null | undefined,
  options: MarketplaceEntityIngressOptions = {},
): ListingSelection {
  if (!entity || entity.kind === "product" || entity.kind === "unknown") {
    return {
      keyword: pickText(options.keyword),
      page: options.page ?? null,
      sort: options.sort ?? null,
      selectedYear: options.uiSelectedYear ?? null,
    };
  }

  const meta = entity.categoryMeta || {};
  const filters = entity.landing?.filters || {};
  const parsed = entity.vehicleSeo?.parsed || {};

  const category =
    entity.kind === "category"
      ? pickText(meta.canonicalName, meta.categoryName, filters.category)
      : null;

  const brand = pickText(meta.cbmBrand, parsed.brand, filters.brand);
  const model = pickText(meta.cbmModel, parsed.model, filters.model);
  const legacyYear = pickText(meta.cbmYear, parsed.year, filters.year);
  const location = normalizeLocationFromSlug(
    entity,
    pickText(meta.cbmLocation, parsed.locationName, filters.location),
  );

  const yearFields = applyYearSplit({
    year: legacyYear,
    uiSelectedYear: options.uiSelectedYear,
  });

  return {
    category,
    brand,
    model,
    ...yearFields,
    location,
    keyword: pickText(options.keyword),
    page: options.page ?? null,
    sort: options.sort ?? null,
  };
}
