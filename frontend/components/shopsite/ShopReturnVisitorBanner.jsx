"use client";

import { useEffect, useMemo, useState } from "react";
import { readRecentlyViewed } from "@/lib/shopsite/recentlyViewed";

const VISIT_KEY_PREFIX = "otofine_shop_visit_";
const BANNER_DISMISSED_PREFIX = "otofine_shop_welcome_dismissed_";

/**
 * "Chào mừng quay lại" return-visitor banner.
 *
 * Heuristic for "this is a return visit":
 *   - We write a `<slug>:<ts>` marker to localStorage every time the
 *     visitor lands on the shop home page. The component checks
 *     whether a marker already exists for THIS shop from a previous
 *     session (>30 min ago) before showing the banner.
 *   - First-time visitors never see the banner. Same-session reloads
 *     (within 30 min of the last marker) don't trigger it either, so
 *     a buyer who hits refresh once isn't greeted as if they just
 *     came back from a week away.
 *
 * Dismiss behaviour: tapping the close button writes a per-session
 * dismiss flag (sessionStorage) so the banner doesn't reappear until
 * the next visit. We deliberately do NOT persist the dismiss to
 * localStorage — return visitors should still get the welcome on the
 * NEXT real return visit.
 *
 * Renders nothing on the server (SSR HTML can't know localStorage),
 * nothing before mount, and nothing if the buyer has no recent
 * activity related to this shop. Avoids hydration mismatch and
 * avoids a hollow "Chào mừng quay lại — bạn chưa xem gì" UX.
 */
export default function ShopReturnVisitorBanner({
  shopId,
  shopName,
  shopSlug,
  className = "",
  onOpenContactDrawer,
}) {
  const visitKey = useMemo(
    () => `${VISIT_KEY_PREFIX}${shopSlug || shopId || ""}`,
    [shopSlug, shopId],
  );
  const dismissKey = useMemo(
    () => `${BANNER_DISMISSED_PREFIX}${shopSlug || shopId || ""}`,
    [shopSlug, shopId],
  );

  const [state, setState] = useState({
    ready: false,
    isReturn: false,
    recentCount: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(dismissKey) === "1";
    } catch {/* private mode */}

    let priorVisitAt = null;
    try {
      const raw = window.localStorage.getItem(visitKey);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) priorVisitAt = n;
      }
    } catch {/* private mode */}

    const now = Date.now();
    const THIRTY_MIN = 30 * 60 * 1000;
    const isReturn =
      !dismissed && priorVisitAt != null && now - priorVisitAt > THIRTY_MIN;

    const viewed = readRecentlyViewed();
    const ownShop = viewed.filter(
      (x) => x && String(x.shopId || "") === String(shopId || ""),
    );

    setState({
      ready: true,
      isReturn,
      recentCount: ownShop.length,
    });

    try {
      window.localStorage.setItem(visitKey, String(now));
    } catch {/* quota */}
  }, [visitKey, dismissKey, shopId]);

  if (!state.ready || !state.isReturn) return null;

  function handleDismiss() {
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {/* private mode */}
    setState((s) => ({ ...s, isReturn: false }));
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#fff7ed] via-[#fffbeb] to-[#fef2f2] ring-1 ring-amber-100 px-4 py-3 shadow-sm ${className}`}
      role="region"
      aria-label="Chào mừng quay lại"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white shadow ring-1 ring-amber-200 shrink-0"
        >
          <span className="text-lg leading-none">👋</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] sm:text-[15px] font-bold text-gray-900 leading-tight">
            Chào mừng quay lại{shopName ? ` ${shopName}` : ""}!
          </div>
          <div className="text-[12px] sm:text-[13px] text-gray-600 leading-snug mt-0.5">
            {state.recentCount > 0
              ? `Bạn đã xem ${state.recentCount} sản phẩm tại shop. Tiếp tục từ chỗ vừa xem hoặc gửi yêu cầu nhanh.`
              : "Khám phá tiếp các sản phẩm hoặc gửi yêu cầu nhanh để được tư vấn."}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return;
                try {
                  window.dispatchEvent(
                    new CustomEvent("shopsite:openQuickRfq", {
                      detail: { source: "return_visitor_banner" },
                    }),
                  );
                } catch {/* old WebView */}
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#e60012] hover:bg-[#c1000f] text-white text-[12px] font-semibold px-3 py-1.5 shadow-sm"
            >
              <span aria-hidden>📦</span>
              Gửi yêu cầu nhanh
            </button>
            {onOpenContactDrawer && (
              <button
                type="button"
                onClick={onOpenContactDrawer}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white text-gray-800 ring-1 ring-gray-200 hover:ring-gray-300 text-[12px] font-semibold px-3 py-1.5"
              >
                <span aria-hidden>💬</span>
                Liên hệ shop
              </button>
            )}
            {state.recentCount > 0 && (
              <a
                href="#recently-viewed"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white text-gray-800 ring-1 ring-gray-200 hover:ring-gray-300 text-[12px] font-semibold px-3 py-1.5"
              >
                <span aria-hidden>↩</span>
                Xem lại sản phẩm
              </a>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Đóng"
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-700 -m-1 p-1"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
