/**
 * Discovery nav feature flag (DISCOVERY-PHASE-A0).
 * Server-only — do not expose via NEXT_PUBLIC_*.
 *
 * Default: disabled (false) when unset.
 */
export function isDiscoveryNavEnabled() {
  const raw = String(process.env.DISCOVERY_NAV_ENABLED ?? "")
    .trim()
    .toLowerCase();

  return (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "on"
  );
}
