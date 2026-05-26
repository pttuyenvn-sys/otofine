"use client";

import { useBuyerPushPrompt } from "@/lib/useBuyerPushPrompt";

const cardStyle = {
  width: 340,
  maxWidth: "calc(100vw - 32px)",
  background: "white",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
};

const titleStyle = {
  fontWeight: 700,
  fontSize: 22,
  lineHeight: 1.4,
};

const bodyStyle = {
  marginTop: 12,
  fontSize: 16,
  lineHeight: 1.7,
  color: "#333",
};

/**
 * Non-intrusive buyer push opt-in. Caller handles registration after permission.
 */
export default function BuyerPushPrompt({ onSubscribed, compact = false }) {
  const { visible, busy, dismiss, requestPermission } = useBuyerPushPrompt();

  if (!visible) return null;

  async function handleAllow() {
    const subscriptionId = await requestPermission();
    if (subscriptionId) {
      await onSubscribed?.(subscriptionId);
    }
  }

  return (
    <div
      className={`rfq-buyer-push-prompt ${compact ? "rfq-buyer-push-prompt--compact" : ""}`}
      role="region"
      aria-label="Thông báo báo giá"
    >
      <div style={cardStyle}>
        <div style={titleStyle}>🔔 Nhận thông báo báo giá</div>
        <div style={bodyStyle}>
          Bật thông báo để biết ngay khi cửa hàng phản hồi hoặc gửi báo giá.
        </div>
        <div className="rfq-buyer-push-prompt__actions">
          <button
            type="button"
            className="rfq-otp-submit"
            onClick={() => void handleAllow()}
            disabled={busy}
          >
            {busy ? "Đang bật…" : "Cho phép thông báo"}
          </button>
          <button type="button" className="rfq-history-logout" onClick={dismiss} disabled={busy}>
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
