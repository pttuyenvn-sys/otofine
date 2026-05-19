/**
 * Normalizes public listing/search query params so absent or placeholder values
 * never become SQL filter binds.
 */

/**
 * Normalize partNumber for search matching.
 * Converts to lowercase, removes hyphens and spaces.
 * Example: "04465-0K340" -> "044650k340"
 * @param {string} partNumber
 * @returns {string}
 */
export function normalizePartNumber(partNumber) {
  if (!partNumber) return "";
  return String(partNumber)
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** @param {unknown} value */
export function cleanHttpQueryValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const low = t.toLowerCase();
    if (low === "null" || low === "undefined") return null;
    return t;
  }
  return value;
}

/** @param {unknown} value */
export function isPresentNonEmptyFilterString(value) {
  return Boolean(cleanHttpQueryValue(value));
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
export function normalizeListFilterYear(value) {
  const v = cleanHttpQueryValue(value);
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * Pick listing-related keys from a raw Express query and drop empty / placeholder values.
 * @param {Record<string, unknown>} raw
 */
export function normalizeListingQuery(raw = {}) {
  /** @type {Record<string, unknown>} */
  const out = {};
  const c = cleanHttpQueryValue(raw.category);
  if (c) out.category = c;
  const b = cleanHttpQueryValue(raw.brand);
  if (b) out.brand = b;
  const m = cleanHttpQueryValue(raw.model);
  if (m) out.model = m;
  const y = normalizeListFilterYear(raw.year);
  if (y != null) out.year = y;
  const l = cleanHttpQueryValue(raw.location ?? raw.city);
  if (l) out.location = l;
  const cityOnly = cleanHttpQueryValue(raw.city);
  if (cityOnly) out.city = cityOnly;
  const k = cleanHttpQueryValue(raw.keyword);
  if (k) out.keyword = k;
  const p = cleanHttpQueryValue(raw.page);
  if (p) out.page = p;
  const s = cleanHttpQueryValue(raw.sort);
  if (s) out.sort = s;
  const cid = raw.cityId;
  if (cid != null && cid !== "") {
    const n = Number(cid);
    if (Number.isFinite(n) && n > 0) out.cityId = n;
  }
  return out;
}

/**
 * JOIN product_car_applications + car_models is only required when brand/model/year
 * filters reference pa/cm in the WHERE clause.
 * @param {Record<string, unknown>} raw
 */
export function listingQueryNeedsVehicleFitmentJoin(raw = {}) {
  const n = normalizeListingQuery(raw);

  return Boolean(
    n.brand ||
    n.model ||
    (n.year != null && Number.isFinite(Number(n.year)))
  );
}

/**
 * True when any listing facet is present (ignores paging/sort only).
 * @param {Record<string, unknown>} raw
 */
export function listingQueryHasAnyFacetFilter(raw = {}) {
  const n = normalizeListingQuery(raw);
  return Object.keys(n).some((k) => k !== "page" && k !== "sort");
}
