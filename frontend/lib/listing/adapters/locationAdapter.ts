/**
 * Location slug ↔ display name adapter (catalog-backed).
 * Pure — no setter or runtime replacement (ARCH-MP-03B.1).
 */

import { slugifyVi } from "../../seo/slugify";

export type LocationCatalogRow = {
  name?: string | null;
  slug?: string | null;
};

const LOCATION_SLUG_DISPLAY_FALLBACK: Record<string, string> = {
  "ha-noi": "Hà Nội",
  "tp-ho-chi-minh": "TP Hồ Chí Minh",
};

function trimText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeLocationDisplayName(name: unknown): string {
  const raw = trimText(name);
  if (!raw) return "";
  if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
  if (/^TP\s+/i.test(raw)) return raw.replace(/^TP\s+/i, "").trim();
  return raw;
}

function slugifyLocation(value: unknown): string {
  return slugifyVi(trimText(value));
}

/**
 * Build slug candidates for a catalog location row (mirrors listingUrlState).
 */
export function buildLocationSlugCandidates(row: LocationCatalogRow): string[] {
  const dbName = trimText(row?.name);
  const dbSlug = trimText(row?.slug).toLowerCase();
  const normalizedName = normalizeLocationDisplayName(dbName);
  return [dbSlug, slugifyLocation(dbName), slugifyLocation(normalizedName)].filter(Boolean);
}

/**
 * Resolve canonical display name from a URL location slug segment.
 */
export function resolveLocationDisplayFromSlug(
  locationSlug: string | null | undefined,
  locations: LocationCatalogRow[] = [],
  requestLocationSlug?: string | null,
): string {
  const slug = trimText(locationSlug).toLowerCase();
  if (!slug) return "";

  const loc = locations.find((row) =>
    buildLocationSlugCandidates(row).includes(slug),
  );

  if (loc) {
    return resolveLocationDisplayNameFromRow(loc, requestLocationSlug || slug);
  }

  return LOCATION_SLUG_DISPLAY_FALLBACK[slug] || "";
}

/**
 * Resolve display name from catalog row with TP normalization rules.
 */
export function resolveLocationDisplayNameFromRow(
  row: LocationCatalogRow,
  locationSlug?: string | null,
): string {
  const dbName = trimText(row?.name);
  if (!dbName) return "";
  const slug = trimText(locationSlug).toLowerCase();
  if (slug.startsWith("tp-")) {
    return /^TP Hồ Chí Minh$/i.test(dbName) ? "TP Hồ Chí Minh" : dbName;
  }
  return normalizeLocationDisplayName(dbName);
}

/**
 * Resolve catalog slug from display name (first matching row).
 */
export function resolveLocationSlugFromDisplay(
  displayName: string | null | undefined,
  locations: LocationCatalogRow[] = [],
): string {
  const display = trimText(displayName);
  if (!display) return "";

  const displaySlug = slugifyLocation(display);
  const match = locations.find((row) =>
    buildLocationSlugCandidates(row).includes(displaySlug),
  );

  if (match?.slug) return trimText(match.slug).toLowerCase();
  if (match?.name) return slugifyLocation(normalizeLocationDisplayName(match.name));

  return displaySlug;
}

/**
 * Normalize free-text or slug location to display string using catalog when possible.
 */
export function normalizeLocationForSelection(
  location: string | null | undefined,
  locations: LocationCatalogRow[] = [],
): string | null {
  const raw = trimText(location);
  if (!raw) return null;

  const asSlug = slugifyLocation(raw);
  const fromSlug = resolveLocationDisplayFromSlug(asSlug, locations, asSlug);
  if (fromSlug) return fromSlug;

  const fromDisplay = resolveLocationSlugFromDisplay(raw, locations);
  if (fromDisplay && locations.length) {
    const resolved = resolveLocationDisplayFromSlug(fromDisplay, locations, fromDisplay);
    if (resolved) return resolved;
  }

  return normalizeLocationDisplayName(raw);
}
