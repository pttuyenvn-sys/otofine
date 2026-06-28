import type { ListingIdentity } from "./ListingIdentity.types";

export const LISTING_HOME_DISPLAY_LABEL = "Phụ tùng ô tô chính hãng giá tốt";

function hasCategory(identity: ListingIdentity): boolean {
  return Boolean(identity.category);
}

function hasBrandModelYear(identity: ListingIdentity): boolean {
  return Boolean(identity.brand || identity.model || identity.yearFrom || identity.yearTo);
}

function formatSeoYearRange(yearFrom: number | null, yearTo: number | null): string {
  if (yearFrom == null && yearTo == null) return "";
  if (yearFrom != null && yearTo != null) {
    return yearFrom === yearTo ? String(yearFrom) : `${yearFrom}-${yearTo}`;
  }
  if (yearFrom != null) return String(yearFrom);
  return String(yearTo);
}

/**
 * Canonical human-readable label for a listing.
 * All slug, H1, title, and canonical builders consume this output.
 *
 * Uses `yearFrom` / `yearTo` (SEO range), never `selectedYear`.
 */
export function buildListingDisplayLabel(identity: ListingIdentity): string {
  const category = identity.category;
  const brand = identity.brand;
  const model = identity.model;
  const location = identity.location;
  const yearText = formatSeoYearRange(identity.yearFrom, identity.yearTo);

  const isEmpty =
    !category &&
    !brand &&
    !model &&
    !yearText &&
    !location &&
    !identity.keyword;

  if (isEmpty) {
    return LISTING_HOME_DISPLAY_LABEL;
  }

  if (!category && !brand && !model && !yearText && location) {
    return `Phụ tùng ô tô tại ${location}`;
  }

  if (category && !brand && !model && !yearText && !location) {
    return `${category} ô tô`;
  }

  if (category && !brand && !model && !yearText && location) {
    return `${category} ô tô tại ${location}`;
  }

  const parts: string[] = [];
  parts.push(category || "Phụ tùng");
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  if (yearText) parts.push(yearText);

  let label = parts.filter(Boolean).join(" ");
  if (location) {
    label += ` tại ${location}`;
  }
  return label;
}

/**
 * True when the identity resolves to the marketplace home listing label.
 */
export function isListingHomeIdentity(identity: ListingIdentity): boolean {
  return buildListingDisplayLabel(identity) === LISTING_HOME_DISPLAY_LABEL;
}
