export const CONTACT_DRIFT_LABELS = {
  account_shop_phone_mismatch: "TK ≠ shop phone",
  zalo_column_drift: "Zalo columns drift",
};

export function contactDriftTone(flags = []) {
  if (flags.includes("account_shop_phone_mismatch") || flags.includes("zalo_column_drift")) {
    return { bg: "#fffbeb", color: "#92400e", border: "#fde68a" };
  }
  return { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };
}

export function formatContactLine(value) {
  if (!value) return "—";
  return String(value);
}

export function timelineSeverityTone(severity) {
  switch (severity) {
    case "critical":
      return { dot: "#dc2626", text: "#991b1b" };
    case "warning":
      return { dot: "#d97706", text: "#92400e" };
    default:
      return { dot: "#6b7280", text: "#374151" };
  }
}

export const TIMELINE_CATEGORY_LABELS = {
  shop: "Shop",
  moderation: "Moderation",
  enforcement: "Enforcement",
  suspension: "Suspension",
  note: "Note",
  slug: "Slug",
  storefront: "Storefront",
  audit: "Audit",
};
