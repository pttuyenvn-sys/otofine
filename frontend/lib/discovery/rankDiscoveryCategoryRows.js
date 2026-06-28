import { readCategoryFields } from "@/lib/seo/buildProductCategoryLinks.js";

/**
 * @typedef {import("@/lib/seo/fetchProductCategoryCatalog.server.js").ProductCategoryRow} ProductCategoryRow
 */

/**
 * @param {unknown} row
 * @returns {number | null} null when the field is absent or not numeric
 */
export function readDiscoveryScore(row) {
  if (row == null || typeof row !== "object") return null;

  const raw =
    /** @type {Record<string, unknown>} */ (row).discoveryScore ??
    /** @type {Record<string, unknown>} */ (row).discovery_score;

  if (raw === undefined || raw === null || raw === "") return null;

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
export function rowHasDiscoveryScoreField(row) {
  if (row == null || typeof row !== "object") return false;
  const record = /** @type {Record<string, unknown>} */ (row);
  return "discoveryScore" in record || "discovery_score" in record;
}

/**
 * True when the catalog exposes discoveryScore on at least one row.
 *
 * @param {unknown[]} rows
 * @returns {boolean}
 */
export function catalogUsesDiscoveryScore(rows) {
  return Array.isArray(rows) && rows.some(rowHasDiscoveryScoreField);
}

/**
 * @param {unknown} row
 * @returns {number}
 */
export function categoryProductCount(row) {
  const n = Number(
    /** @type {Record<string, unknown>} */ (row)?.product_count ??
      /** @type {Record<string, unknown>} */ (row)?.total_product_count ??
      0,
  );
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {unknown} row
 * @returns {string}
 */
export function categoryCanonicalSlug(row) {
  const { canonicalSlug } = readCategoryFields(row);
  return canonicalSlug || "";
}

/**
 * Legacy ranking: productCount DESC only (DISCOVERY-PHASE-A1).
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compareDiscoveryCategoryRowsLegacy(a, b) {
  return categoryProductCount(b) - categoryProductCount(a);
}

/**
 * Full ranking: discoveryScore DESC, productCount DESC, slug ASC.
 * Rows without a numeric score are treated as 0 when score mode is active.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compareDiscoveryCategoryRowsWithScore(a, b) {
  const scoreA = readDiscoveryScore(a) ?? 0;
  const scoreB = readDiscoveryScore(b) ?? 0;
  if (scoreB !== scoreA) return scoreB - scoreA;

  const countDelta = categoryProductCount(b) - categoryProductCount(a);
  if (countDelta !== 0) return countDelta;

  const slugA = categoryCanonicalSlug(a);
  const slugB = categoryCanonicalSlug(b);
  return slugA.localeCompare(slugB);
}

/**
 * Picks comparator based on catalog shape. When discoveryScore is absent
 * from all rows, legacy productCount-only sort is used for exact fallback.
 *
 * @param {unknown[]} rows
 * @returns {(a: unknown, b: unknown) => number}
 */
export function getDiscoveryCategoryRowComparator(rows) {
  return catalogUsesDiscoveryScore(rows)
    ? compareDiscoveryCategoryRowsWithScore
    : compareDiscoveryCategoryRowsLegacy;
}

/**
 * @param {unknown[]} rows
 * @returns {unknown[]}
 */
export function rankDiscoveryCategoryRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const compare = getDiscoveryCategoryRowComparator(rows);
  return [...rows].sort(compare);
}
