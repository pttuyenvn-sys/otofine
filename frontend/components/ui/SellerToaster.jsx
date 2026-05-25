"use client";

/**
 * SellerToaster
 *
 * A tiny, dependency-free toast surface used by the seller UI. Designed
 * to feel like the inline toasts in Shopee/TikTok Shop seller — slide
 * up from the bottom (above the mobile bottom nav / save bar), auto-
 * dismiss, no buttons, no overlay.
 *
 * Anywhere in the seller bundle:
 *   sellerToast.success("Đã lưu thay đổi");
 *   sellerToast.error("Mất mạng. Thử lại sau.");
 *   sellerToast.info("Đã sao chép liên kết");
 *
 * The instance is a global singleton attached to `window` so the
 * popup, page-level components, and hooks can all call it without
 * dragging a context provider through every wrapper.
 */

import { useEffect, useState } from "react";

const STORE = {
  listeners: new Set(),
  toasts: [],
  seq: 1,
};

function notify() {
  for (const l of STORE.listeners) l(STORE.toasts);
}

function push(tone, message, opts = {}) {
  const id = STORE.seq++;
  const ttl = typeof opts.ttl === "number" ? opts.ttl : 2400;
  STORE.toasts = [...STORE.toasts, { id, tone, message }];
  notify();
  if (ttl > 0) {
    setTimeout(() => {
      STORE.toasts = STORE.toasts.filter((t) => t.id !== id);
      notify();
    }, ttl);
  }
  return id;
}

export const sellerToast = {
  success: (msg, opts) => push("success", msg, opts),
  error: (msg, opts) => push("error", msg, opts),
  info: (msg, opts) => push("info", msg, opts),
  dismiss: (id) => {
    STORE.toasts = STORE.toasts.filter((t) => t.id !== id);
    notify();
  },
};

// Mount this once at the app root and let any module fire toasts via
// the singleton helpers above.
export default function SellerToaster() {
  const [toasts, setToasts] = useState(STORE.toasts);

  useEffect(() => {
    function onChange(next) {
      setToasts([...next]);
    }
    STORE.listeners.add(onChange);
    return () => {
      STORE.listeners.delete(onChange);
    };
  }, []);

  if (typeof window === "undefined") return null;
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="seller-toaster"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`seller-toaster__toast seller-toaster__toast--${t.tone}`}
        >
          <span aria-hidden className="seller-toaster__icon">
            {t.tone === "success" ? "✓" : t.tone === "error" ? "!" : "i"}
          </span>
          <span className="seller-toaster__msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
