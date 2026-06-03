/** Storefront moderation action helpers (Phase 6D.2). */

export const STOREFRONT_MODERATION_ACTIONS = Object.freeze({
  PUBLISH: "publish_storefront",
  SUSPEND: "suspend_storefront",
  RESTORE: "restore_storefront",
  UNPUBLISH: "unpublish_storefront",
});

const BLOCKED_ACCOUNT_STATUSES = new Set(["blocked", "suspended"]);

export function normalizeStorefrontPublicStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s || s === "pending" || s === "inactive") return "inactive";
  return s;
}

export function isAccountBlockedForStorefront(accountStatus) {
  return BLOCKED_ACCOUNT_STATUSES.has(String(accountStatus || "").trim().toLowerCase());
}

/**
 * Contextual storefront moderation actions for admin UI.
 * @returns {Array<{ action: string, label: string, tone: string, disabled?: boolean, disabledReason?: string }>}
 */
export function getStorefrontModerationActions({ publicStatus, accountStatus } = {}) {
  const sf = normalizeStorefrontPublicStatus(publicStatus);
  const accountBlocked = isAccountBlockedForStorefront(accountStatus);
  const actions = [];

  if (sf === "inactive") {
    actions.push({
      action: STOREFRONT_MODERATION_ACTIONS.PUBLISH,
      label: "Public SF",
      tone: "green",
      disabled: accountBlocked,
      disabledReason: accountBlocked ? "Tài khoản seller bị khóa" : "",
    });
  }

  if (sf === "public") {
    actions.push({
      action: STOREFRONT_MODERATION_ACTIONS.SUSPEND,
      label: "Đình chỉ SF",
      tone: "amber",
    });
    actions.push({
      action: STOREFRONT_MODERATION_ACTIONS.UNPUBLISH,
      label: "Gỡ public",
      tone: "neutral",
    });
  }

  if (sf === "suspended") {
    actions.push({
      action: STOREFRONT_MODERATION_ACTIONS.RESTORE,
      label: "Khôi phục SF",
      tone: "green",
      disabled: accountBlocked,
      disabledReason: accountBlocked ? "Tài khoản seller bị khóa" : "",
    });
  }

  return actions;
}

export function moderationActionButtonStyle(tone, disabled = false) {
  const colors = {
    green: "#059669",
    amber: "#d97706",
    neutral: "#4b5563",
  };
  const bg = disabled ? "#d1d5db" : colors[tone] || colors.neutral;
  return {
    background: bg,
    color: "white",
    border: "none",
    padding: "5px 10px",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

export function formatStorefrontModerationError(err) {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    "Không thực hiện được thao tác storefront"
  );
}

export function moderationSuccessMessage(action) {
  switch (action) {
    case STOREFRONT_MODERATION_ACTIONS.PUBLISH:
      return "Đã public storefront";
    case STOREFRONT_MODERATION_ACTIONS.SUSPEND:
      return "Đã đình chỉ storefront";
    case STOREFRONT_MODERATION_ACTIONS.RESTORE:
      return "Đã khôi phục storefront";
    case STOREFRONT_MODERATION_ACTIONS.UNPUBLISH:
      return "Đã gỡ public storefront";
    default:
      return "Đã cập nhật storefront";
  }
}
