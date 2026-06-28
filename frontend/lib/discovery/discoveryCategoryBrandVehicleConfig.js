/**
 * Category-page brand+vehicle discovery flag (Phase B2).
 * Server-only — do not expose via NEXT_PUBLIC_*.
 *
 * Default: disabled (false) when unset.
 */
export function isDiscoveryCategoryBrandVehicleEnabled() {
  const raw = String(process.env.DISCOVERY_CATEGORY_BRAND_VEHICLE_ENABLED ?? "")
    .trim()
    .toLowerCase();

  return (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "on"
  );
}
