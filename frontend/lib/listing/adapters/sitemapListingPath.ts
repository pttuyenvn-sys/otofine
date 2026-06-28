/**
 * Marketplace sitemap row → ListingIdentity path (ARCH-MP-03B.6.4).
 *
 * Pipeline: row → ListingSelection → normalizeListingIdentity → buildListingPath
 */

import { normalizeListingIdentity } from "../normalizeListingIdentity";
import type { ListingSelection } from "../ListingIdentity.types";
import { buildListingPath } from "../buildListingSlug";

export type SitemapListingRow = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  /** Single year or legacy range string (`"2014-2020"`). */
  year?: string | number | null;
  yearFrom?: number | string | null;
  yearTo?: number | string | null;
  location?: string | null;
};

function trimText(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveLegacyYear(row: SitemapListingRow): string | null {
  const explicit = trimText(row.year);
  if (explicit) return explicit;

  const from = trimText(row.yearFrom);
  const to = trimText(row.yearTo);
  if (from && to) return `${from}-${to}`;
  if (from) return from;
  if (to) return to;

  return null;
}

/**
 * Map sitemap inventory row fields into ListingSelection ingress.
 */
export function sitemapSelectionFromRow(
  row: SitemapListingRow = {},
): ListingSelection {
  const category = trimText(row.category) || null;
  const brand = trimText(row.brand) || null;
  const model = trimText(row.model) || null;
  const location = trimText(row.location) || null;
  const year = resolveLegacyYear(row);

  return {
    category,
    brand,
    model,
    year,
    location,
    selectedYear: null,
  };
}

/**
 * Marketplace listing pathname for a sitemap row (`/` or `/slug`).
 */
export function buildSitemapListingPath(row: SitemapListingRow = {}): string {
  const identity = normalizeListingIdentity(sitemapSelectionFromRow(row));
  return buildListingPath(identity);
}

/**
 * Slug segment without leading slash (empty = homepage).
 */
export function buildSitemapListingSlug(row: SitemapListingRow = {}): string {
  const path = buildSitemapListingPath(row);
  return path === "/" ? "" : path.slice(1);
}
