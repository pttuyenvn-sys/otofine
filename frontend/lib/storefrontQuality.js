/** Storefront quality UI helpers (Phase 6D.4). */

export const QUALITY_TIER = Object.freeze({
  EXCELLENT: "excellent",
  GOOD: "good",
  BASIC: "basic",
  POOR: "poor",
});

export const QUALITY_TIER_LABEL = Object.freeze({
  excellent: "Excellent",
  good: "Good",
  basic: "Basic",
  poor: "Poor",
});

export const QUALITY_SIGNAL_LABELS = Object.freeze({
  branding: "Branding",
  catalog: "Catalog",
  activity: "Activity",
  trust: "Trust",
  engagement: "Engagement",
});

export const QUALITY_FLAG_LABELS = Object.freeze({
  storefront_suspended: "Storefront suspended",
  enforcement_suspended: "Enforcement suspension",
  inactive_30d: "Inactive 30d",
  high_reject_ratio: "High reject ratio",
  sparse_catalog: "Sparse catalog",
  missing_branding: "Missing branding",
  no_rfq_activity: "No RFQ activity",
  unverified_contact: "Unverified contact",
});

export function qualityTierLabel(tier) {
  return QUALITY_TIER_LABEL[tier] || tier || "—";
}

export function qualityTone(tier) {
  switch (tier) {
    case QUALITY_TIER.EXCELLENT:
      return { bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" };
    case QUALITY_TIER.GOOD:
      return { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" };
    case QUALITY_TIER.BASIC:
      return { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };
    case QUALITY_TIER.POOR:
    default:
      return { bg: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  }
}

export function qualityCardTone(tier) {
  switch (tier) {
    case QUALITY_TIER.EXCELLENT:
      return "purple";
    case QUALITY_TIER.GOOD:
      return "ok";
    case QUALITY_TIER.BASIC:
      return "warn";
    case QUALITY_TIER.POOR:
    default:
      return "danger";
  }
}

export function formatQualityBadge(score, tier) {
  const s = Number.isFinite(Number(score)) ? Math.round(Number(score)) : "—";
  return `${s} ${qualityTierLabel(tier)}`;
}
