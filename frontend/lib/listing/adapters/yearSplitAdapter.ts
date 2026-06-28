/**
 * Splits legacy single `year` string into MP-03 canonical year fields.
 * Pure adapter — no runtime wiring (ARCH-MP-03B.1).
 */

const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;
const YEAR_RANGE_RE = /^(19|20)\d{2}-(19|20)\d{2}$/;

export type YearSplitFields = {
  selectedYear: number | null;
  yearFrom: number | null;
  yearTo: number | null;
};

function trimText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseYearToken(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(trimText(value));
  if (!Number.isInteger(n) || !YEAR_TOKEN_RE.test(String(n))) return null;
  return n;
}

/**
 * Parse legacy URL/state year string into SEO range fields only.
 *
 * - `"2014-2020"` → yearFrom=2014, yearTo=2020, selectedYear=null
 * - `"2020"` → yearFrom=2020, yearTo=2020, selectedYear=null
 */
export function splitLegacyYearString(
  year: string | null | undefined,
): Pick<YearSplitFields, "yearFrom" | "yearTo"> {
  const raw = trimText(year);
  if (!raw) {
    return { yearFrom: null, yearTo: null };
  }

  if (YEAR_RANGE_RE.test(raw)) {
    const [fromText, toText] = raw.split("-");
    const yearFrom = parseYearToken(fromText);
    const yearTo = parseYearToken(toText);
    if (yearFrom == null || yearTo == null) {
      return { yearFrom: null, yearTo: null };
    }
    return {
      yearFrom: Math.min(yearFrom, yearTo),
      yearTo: Math.max(yearFrom, yearTo),
    };
  }

  const single = parseYearToken(raw);
  if (single != null) {
    return { yearFrom: single, yearTo: single };
  }

  return { yearFrom: null, yearTo: null };
}

export type ApplyYearSplitInput = {
  /** Legacy combined year from URL/state. */
  year?: string | null;
  /** Explicit UI fitment year — query only; does not alter SEO range. */
  uiSelectedYear?: number | string | null;
  /** Pre-split SEO range (optional, e.g. from slug ingress). */
  yearFrom?: number | string | null;
  yearTo?: number | string | null;
};

/**
 * Produce canonical year fields for ListingSelection ingress.
 *
 * UI picked year 2016 → selectedYear=2016; yearFrom/yearTo from legacy `year` unchanged.
 */
export function applyYearSplit(input: ApplyYearSplitInput = {}): YearSplitFields {
  const explicitFrom = parseYearToken(input.yearFrom);
  const explicitTo = parseYearToken(input.yearTo);
  const legacyRange = splitLegacyYearString(input.year);

  let yearFrom = explicitFrom ?? legacyRange.yearFrom;
  let yearTo = explicitTo ?? legacyRange.yearTo;

  if (yearFrom != null && yearTo != null) {
    yearFrom = Math.min(yearFrom, yearTo);
    yearTo = Math.max(yearFrom, yearTo);
  } else if (yearFrom != null) {
    yearTo = yearFrom;
  } else if (yearTo != null) {
    yearFrom = yearTo;
  }

  const selectedYear = parseYearToken(input.uiSelectedYear);

  return {
    selectedYear,
    yearFrom,
    yearTo,
  };
}
