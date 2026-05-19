"use client";

import { useEffect } from "react";
import { useOneSignalCustomPrompt } from "@/lib/useOneSignalCustomPrompt";

const cardStyle = {
  width: 340,
  maxWidth: "calc(100vw - 32px)",
  background: "white",
  borderRadius: 18,
  padding: 20,
  boxShadow:
    "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
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

export default function ShopPushPrompt() {
  const { visible, onAllowClick } =
    useOneSignalCustomPrompt();

  useEffect(() => {
    async function autoAsk() {
      try {
        await onAllowClick();
      } catch (_) { }
    }

    if (visible) {
      autoAsk();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: window.innerWidth < 768 ? 90 : 250,
        left: window.innerWidth < 768 ? 12 : 120,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          ...cardStyle,
          position: "relative",
        }}
      >
        <div style={titleStyle}>
          🔔 Cho phép thông báo
        </div>

        <div style={bodyStyle}>
          Hãy bấm <b>Allow</b> trên trình duyệt để nhận
          HỎI GIÁ mới từ khách hàng.
        </div>
      </div>
    </div>
  );
}