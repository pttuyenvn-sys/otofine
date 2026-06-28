/**
 * Marketplace year field helpers (ARCH-MP-03B.9).
 *
 * SSOT: controller `year` string (URL state).
 * Single year → SEO + query. Range → SEO only, query omits year.
 */

const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;
const YEAR_RANGE_RE = /^(19|20)\d{2}-(19|20)\d{2}$/;

/**
 * @typedef {{ yearFrom: number | null, yearTo: number | null }} SeoYearRange
 */

function trimText(value) {
  return String(value ?? "").trim();
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseYearToken(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(trimText(value));
  if (!Number.isInteger(n) || !YEAR_TOKEN_RE.test(String(n))) return null;
  return n;
}

/**
 * Split legacy URL/state `year` string into SEO range fields.
 *
 * @param {string | null | undefined} year
 * @returns {SeoYearRange}
 */
function splitSeoYearFromLegacy(year) {
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

/**
 * Format SEO year range for H1 / URL slug segments.
 *
 * @param {number | null | undefined} yearFrom
 * @param {number | null | undefined} yearTo
 * @returns {string}
 */
function formatSeoYearRange(yearFrom, yearTo) {
  const from = parseYearToken(yearFrom);
  const to = parseYearToken(yearTo);

  if (from == null && to == null) return "";
  if (from != null && to != null) {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    return lo === hi ? String(lo) : `${lo}-${hi}`;
  }
  const single = from ?? to;
  return single != null ? String(single) : "";
}

/**
 * Derive grid fitment year from URL `year` string.
 * Range strings are not valid fitment picks — returns null.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
function deriveSelectedYear(value) {
  if (value == null || value === "") return null;
  const raw = trimText(value);
  if (!raw) return null;
  if (raw.includes("-")) return null;
  return parseYearToken(raw);
}

/**
 * Controller year hydration from URL ingress.
 *
 * @param {string} year
 * @returns {{ year: string, yearFrom: number | null, yearTo: number | null }}
 */
function hydrateControllerYearFields(year) {
  const legacyYear = String(year ?? "");
  const { yearFrom, yearTo } = splitSeoYearFromLegacy(legacyYear);
  return {
    year: legacyYear,
    yearFrom,
    yearTo,
  };
}

module.exports = {
  splitSeoYearFromLegacy,
  formatSeoYearRange,
  deriveSelectedYear,
  hydrateControllerYearFields,
};
