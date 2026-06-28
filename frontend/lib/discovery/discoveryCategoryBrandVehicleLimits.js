/**
 * Adaptive vehicle link cap from eligible CBM inventory count (Phase B2).
 *
 * @param {number} eligibleCount
 * @returns {number}
 */
export function resolveDiscoveryVehicleLinkLimit(eligibleCount) {
  const n = Math.max(0, Number(eligibleCount) || 0);
  if (n <= 5) return n;
  if (n <= 15) return 8;
  return 10;
}
