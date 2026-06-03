/**
 * Marketplace listing route classifier — shared gate for apex `[slug]` routing.
 *
 * Must stay aligned with listing pathname shapes from `buildPathFromState()`
 * in `Home.jsx` (do not infer filters here; only structural slug grammar).
 * Full contract: ROUTE_CONTRACT.md
 *
 *   • category-only        → /{category}-o-to
 *   • vehicle (+ optional) → /phu-tung-{brand}-{model}-{year}[-tai-{location}]
 *   • category + vehicle   → /{category}-{brand}-{model}-{year}[-tai-{location}]
 *   • legacy vehicle paths → /{brand}-{model}-{year}  (backward compatible)
 *
 * Product canonical apex URLs (`/{slugPrefix}-{productId}`) must return false.
 * Product slugs from `buildProductSeoUrl()` append a part-number token immediately
 * before the trailing numeric product id when a part number exists.
 */

const LISTING_YEAR_MIN = 1950;
const LISTING_YEAR_MAX = 2035;

/** @param {string} segment */
function isListingYearSegment(segment) {
  if (!/^\d{4}$/.test(segment)) return false;
  const year = Number(segment);
  return year >= LISTING_YEAR_MIN && year <= LISTING_YEAR_MAX;
}

/**
 * Part-number token immediately before `{productId}` in canonical product slugs.
 * Listing year suffixes are preceded by model tokens (short, e.g. "3", "i10").
 *
 * @param {string} segment
 */
function isProductPartNumberBeforeId(segment) {
  const token = String(segment || "").trim();
  if (token.length < 6) return false;
  if (!/^[a-z0-9]+$/i.test(token)) return false;
  return /[a-z]/i.test(token) && /\d/.test(token);
}

/**
 * @param {string | null | undefined} slug
 * @returns {boolean}
 */
export function isMarketplaceListingSlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return false;

  // Vehicle marketplace prefix: buildPathFromState adds "phu-tung" when no category.
  if (s === "phu-tung" || s.startsWith("phu-tung-")) return true;

  // Category-only landing suffix: /{category}-o-to
  if (s.endsWith("-o-to")) return true;

  // Location segment from buildPathFromState: ...-tai-{location}
  if (s.includes("-tai-")) return true;

  // Category+vehicle or legacy /{brand}-{model}-{year} listing paths.
  const lastDash = s.lastIndexOf("-");
  if (lastDash <= 0) return false;

  const lastSegment = s.slice(lastDash + 1);
  if (!isListingYearSegment(lastSegment)) return false;

  const beforeLast = s.slice(0, lastDash);
  const penultimateDash = beforeLast.lastIndexOf("-");
  const penultimate =
    penultimateDash >= 0
      ? beforeLast.slice(penultimateDash + 1)
      : beforeLast;

  // Product canonical: ...-{partNumber}-{productId}
  if (isProductPartNumberBeforeId(penultimate)) return false;

  return true;
}
