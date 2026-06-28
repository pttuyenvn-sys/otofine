/**
 * Category-page brand discovery flag (Phase B).
 * Server-only — do not expose via NEXT_PUBLIC_*.
 *
 * Default: disabled (false) when unset.
 */
export function isDiscoveryCategoryBrandEnabled() {
  const raw = String(process.env.DISCOVERY_CATEGORY_BRAND_ENABLED ?? "")
    .trim()
    .toLowerCase();

  return (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "on"
  );
}
