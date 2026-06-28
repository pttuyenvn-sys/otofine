import type { ListingIdentity, ListingSelection } from "./ListingIdentity.types";

const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;
const YEAR_RANGE_RE = /^(19|20)\d{2}-(19|20)\d{2}$/;

function trimText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeCategoryName(value: unknown): string | null {
  const raw = trimText(value);
  if (!raw) return null;
  const lower = raw.toLocaleLowerCase("vi-VN");
  return lower.charAt(0).toLocaleUpperCase("vi-VN") + lower.slice(1);
}

function normalizeLocationName(value: unknown): string | null {
  const raw = trimText(value);
  if (!raw) return null;
  if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
  if (/^TP\s+/i.test(raw)) return raw.replace(/^TP\s+/i, "").trim();
  return raw;
}

function parseYearValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || !YEAR_TOKEN_RE.test(String(n))) return null;
  return n;
}

function parseLegacyYearRange(value: unknown): { yearFrom: number; yearTo: number } | null {
  const raw = trimText(value);
  if (!raw) return null;

  if (YEAR_RANGE_RE.test(raw)) {
    const [fromText, toText] = raw.split("-");
    const yearFrom = parseYearValue(fromText);
    const yearTo = parseYearValue(toText);
    if (yearFrom == null || yearTo == null) return null;
    return { yearFrom: Math.min(yearFrom, yearTo), yearTo: Math.max(yearFrom, yearTo) };
  }

  const single = parseYearValue(raw);
  if (single != null) {
    return { yearFrom: single, yearTo: single };
  }

  return null;
}

function emptyIdentity(): ListingIdentity {
  return {
    category: null,
    brand: null,
    model: null,
    selectedYear: null,
    yearFrom: null,
    yearTo: null,
    location: null,
    keyword: null,
    shopId: null,
  };
}

/**
 * Normalize raw selection into canonical ListingIdentity.
 *
 * Year split:
 * - `selectedYear` — explicit user input for grid query.
 * - `yearFrom` / `yearTo` — canonical SEO range (from slug or explicit fields).
 * - legacy `year` — SEO range only (`"2014-2020"` or single `"2020"`).
 */
export function normalizeListingIdentity(selection: ListingSelection = {}): ListingIdentity {
  const identity = emptyIdentity();

  identity.category = normalizeCategoryName(selection.category);
  identity.brand = trimText(selection.brand) || null;
  identity.model = trimText(selection.model) || null;
  identity.location = normalizeLocationName(selection.location);
  identity.keyword = trimText(selection.keyword) || null;

  identity.selectedYear = parseYearValue(selection.selectedYear);

  let yearFrom = parseYearValue(selection.yearFrom);
  let yearTo = parseYearValue(selection.yearTo);
  if (yearFrom != null && yearTo != null) {
    identity.yearFrom = Math.min(yearFrom, yearTo);
    identity.yearTo = Math.max(yearFrom, yearTo);
  } else if (yearFrom != null) {
    identity.yearFrom = yearFrom;
    identity.yearTo = yearFrom;
  } else if (yearTo != null) {
    identity.yearFrom = yearTo;
    identity.yearTo = yearTo;
  } else {
    const legacyRange = parseLegacyYearRange(selection.year);
    if (legacyRange) {
      identity.yearFrom = legacyRange.yearFrom;
      identity.yearTo = legacyRange.yearTo;
    }
  }

  // Marketplace-only scope: shop overlay is out of scope for ARCH-MP-03.
  identity.shopId = null;

  return identity;
}
