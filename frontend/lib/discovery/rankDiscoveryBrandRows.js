/**
 * @param {unknown} row
 * @returns {number}
 */
export function brandProductCount(row) {
  const n = Number(
    /** @type {Record<string, unknown>} */ (row)?.productCount ??
      /** @type {Record<string, unknown>} */ (row)?.product_count ??
      0,
  );
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {unknown} row
 * @returns {string}
 */
export function brandName(row) {
  return String(/** @type {Record<string, unknown>} */ (row)?.brand ?? "").trim();
}

/**
 * Inventory ranking: productCount DESC, brand ASC.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compareDiscoveryBrandRows(a, b) {
  const countDelta = brandProductCount(b) - brandProductCount(a);
  if (countDelta !== 0) return countDelta;
  return brandName(a).localeCompare(brandName(b), "vi");
}

/**
 * @param {unknown[]} rows
 * @returns {unknown[]}
 */
export function rankDiscoveryBrandRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return [...rows].sort(compareDiscoveryBrandRows);
}
