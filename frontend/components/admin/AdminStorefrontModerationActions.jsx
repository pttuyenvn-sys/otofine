"use client";

import { useState } from "react";
import { postShopStorefrontAction } from "@/lib/adminApi";
import {
  formatStorefrontModerationError,
  getStorefrontModerationActions,
  moderationActionButtonStyle,
  moderationSuccessMessage,
} from "@/lib/storefrontModeration";

/**
 * Contextual storefront lifecycle actions (Phase 6D.2).
 * Uses shops.id (governanceShopId) — never shop_accounts.id.
 */
export default function AdminStorefrontModerationActions({
  governanceShopId,
  publicStatus,
  accountStatus,
  onSuccess,
  onError,
  compact = false,
}) {
  const [pendingAction, setPendingAction] = useState("");

  const actions = getStorefrontModerationActions({
    publicStatus,
    accountStatus,
  });

  if (!governanceShopId || !actions.length) return null;

  async function runAction(action, label) {
    if (pendingAction) return;

    const confirmMessages = {
      publish_storefront: "Public storefront cho shop này?",
      suspend_storefront: "Đình chỉ storefront (không khóa tài khoản seller)?",
      restore_storefront: "Khôi phục storefront public?",
      unpublish_storefront: "Gỡ public storefront (chuyển về nháp)?",
    };
    const msg = confirmMessages[action] || `Thực hiện "${label}"?`;
    if (!window.confirm(msg)) return;

    setPendingAction(action);
    onError?.("");

    try {
      await postShopStorefrontAction(governanceShopId, { action });
      onSuccess?.(moderationSuccessMessage(action));
    } catch (err) {
      onError?.(formatStorefrontModerationError(err));
    } finally {
      setPendingAction("");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: compact ? 6 : 8,
        marginTop: compact ? 0 : 4,
      }}
    >
      {actions.map((item) => {
        const busy = pendingAction === item.action;
        const disabled = Boolean(pendingAction) || item.disabled;
        return (
          <button
            key={item.action}
            type="button"
            title={item.disabled ? item.disabledReason : undefined}
            disabled={disabled}
            style={moderationActionButtonStyle(item.tone, disabled)}
            onClick={() => runAction(item.action, item.label)}
          >
            {busy ? "..." : item.label}
          </button>
        );
      })}
    </div>
  );
}
