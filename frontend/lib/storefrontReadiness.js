/** Storefront readiness UI helpers (Phase 6D.1). */

export const READINESS_STATUS = Object.freeze({
  READY: "ready",
  ATTENTION: "attention",
  INCOMPLETE: "incomplete",
});

export const READINESS_STATUS_LABEL = Object.freeze({
  ready: "Ready",
  attention: "Attention",
  incomplete: "Incomplete",
});

export const READINESS_CHECK_LABELS = Object.freeze({
  hasName: "Shop name",
  hasAvatar: "Avatar",
  hasCover: "Cover image",
  hasPhone: "Phone / Zalo",
  hasIntro: "Intro / bio",
  hasSlug: "Storefront slug",
  hasPublicProducts: "Approved products",
});

export const READINESS_MISSING_LABELS = Object.freeze({
  name: "Name",
  avatar: "Avatar",
  cover: "Cover",
  phone: "Phone",
  intro: "Intro",
  slug: "Slug",
  public_products: "Public products",
});

export function readinessTone(status) {
  switch (status) {
    case READINESS_STATUS.READY:
      return { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" };
    case READINESS_STATUS.ATTENTION:
      return { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };
    case READINESS_STATUS.INCOMPLETE:
    default:
      return { bg: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  }
}

export function readinessLabelText(status) {
  return READINESS_STATUS_LABEL[status] || status || "—";
}

export function formatReadinessBadge(score, status) {
  const s = Number.isFinite(Number(score)) ? Math.round(Number(score)) : "—";
  return `${s} ${readinessLabelText(status)}`;
}

export function readinessCardTone(status) {
  switch (status) {
    case READINESS_STATUS.READY:
      return "ok";
    case READINESS_STATUS.ATTENTION:
      return "warn";
    case READINESS_STATUS.INCOMPLETE:
    default:
      return "danger";
  }
}

export const REVIEW_RECOMMENDATION = Object.freeze({
  ready: "Ready for public storefront",
  attention: "Needs minor storefront improvements",
  incomplete: "Storefront incomplete",
});

/** Moderation recommendation copy for admin review drawer (Phase 6D.3). */
export function getStorefrontReviewRecommendation(readiness) {
  if (!readiness) return REVIEW_RECOMMENDATION.incomplete;
  if (readiness.status === READINESS_STATUS.READY) return REVIEW_RECOMMENDATION.ready;
  if (readiness.status === READINESS_STATUS.ATTENTION) return REVIEW_RECOMMENDATION.attention;
  return REVIEW_RECOMMENDATION.incomplete;
}

export const STOREFRONT_PUBLIC_STATUS_LABEL = Object.freeze({
  pending: "Pending review",
  public: "Public",
  suspended: "Suspended",
});
