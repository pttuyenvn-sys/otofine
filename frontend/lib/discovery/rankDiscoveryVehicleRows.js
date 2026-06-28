import { brandProductCount } from "@/lib/discovery/rankDiscoveryBrandRows.js";

/**
 * @param {unknown} row
 * @returns {string}
 */
export function vehicleModelName(row) {
  return String(/** @type {Record<string, unknown>} */ (row)?.model ?? "").trim();
}

/**
 * Inventory ranking: productCount DESC, model ASC.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compareDiscoveryVehicleRows(a, b) {
  const countDelta = brandProductCount(b) - brandProductCount(a);
  if (countDelta !== 0) return countDelta;
  return vehicleModelName(a).localeCompare(vehicleModelName(b), "vi");
}

/**
 * @param {unknown[]} rows
 * @returns {unknown[]}
 */
export function rankDiscoveryVehicleRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return [...rows].sort(compareDiscoveryVehicleRows);
}
