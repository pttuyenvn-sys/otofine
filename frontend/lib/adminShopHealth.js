/** Shared health badge helpers for admin shop UI. */

export const FLAG_LABELS_SHORT = {
  inactive_30d: "Inactive 30d",
  no_products: "No products",
  high_reject_ratio: "High reject",
  missing_contact: "No contact",
  storefront_suspended: "SF suspended",
  no_slug: "No slug",
};

export function healthTone(label) {
  switch (label) {
    case "healthy":
      return { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" };
    case "stable":
      return { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" };
    case "weak":
      return { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };
    case "attention":
    default:
      return { bg: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  }
}

export function healthLabelText(label) {
  switch (label) {
    case "healthy":
      return "Healthy";
    case "stable":
      return "Stable";
    case "weak":
      return "Weak";
    case "attention":
      return "Attention";
    default:
      return label || "—";
  }
}
