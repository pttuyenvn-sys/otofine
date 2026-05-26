"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ShopsiteEvents,
  trackShopsiteEvent,
} from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Bottom-sheet contact drawer (mobile-first, also usable on desktop).
 *
 * Renders 5 rows when data is available:
 *   1. Gọi điện
 *   2. Nhắn Zalo
 *   3. Tìm phụ tùng nhanh (RFQ) — opens the existing Quick-RFQ modal
 *      via the `shopsite:openQuickRfq` event so we never own the RFQ
 *      flow twice
 *   4. Xem trên Google Maps
 *   5. Facebook
 *
 * Missing channels are silently omitted. If only the phone is set we
 * still render a usable drawer with one row, so the launcher button
 * never feels broken.
 *
 * Layout: full-screen overlay with a bottom sheet on `<sm` and a
 * centered card on `sm+`. Body-scroll-lock prevents background scroll
 * while the drawer is open. ESC + backdrop close.
 */
export default function ShopContactMiniDrawerImpl({ open, onClose, shop }) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add("overflow-hidden");
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("overflow-hidden");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const phone = (shop?.phone || "").replace(/\s/g, "");
  const zalo = (shop?.zalo || phone || "").replace(/\s/g, "");
  const mapsUrl = buildMapsHref(shop);
  const fb = extractFacebookUrl(shop?.facebook);
  const meta = { shopSlug: shop?.slug || null, source: "contact_drawer" };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-drawer-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-5"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#e60012]/10 text-[#e60012] shrink-0 text-base"
          >
            💬
          </span>
          <div className="flex-1 min-w-0">
            <div
              id="contact-drawer-title"
              className="text-base sm:text-lg font-bold text-gray-900 leading-tight"
            >
              Liên hệ {shop?.name || "shop"}
            </div>
            <div className="text-[12px] text-gray-500 mt-0.5">
              Chọn kênh phù hợp để được tư vấn nhanh nhất.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 hover:text-gray-700 -m-1 p-1"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
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

        <ul className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {phone && (
            <Row
              href={`tel:${phone}`}
              tone="primary"
              icon={<PhoneIcon />}
              title="Gọi điện"
              hint={shop?.phone}
              onClick={() => trackShopsiteEvent(ShopsiteEvents.PHONE_CLICK, meta)}
            />
          )}
          {zalo && (
            <Row
              href={`https://zalo.me/${zalo}`}
              tone="zalo"
              icon={<ChatIcon />}
              title="Nhắn Zalo"
              hint="Trả lời nhanh trong giờ làm việc"
              external
              onClick={() => trackShopsiteEvent(ShopsiteEvents.ZALO_CLICK, meta)}
            />
          )}
          <Row
            asButton
            tone="neutral"
            icon={<BoxIcon />}
            title="Gửi yêu cầu nhanh"
            hint="Mô tả phụ tùng cần tìm — shop báo giá lại"
            onClick={() => {
              onClose?.();
              if (typeof window !== "undefined") {
                try {
                  window.dispatchEvent(
                    new CustomEvent("shopsite:openQuickRfq", {
                      detail: { source: "contact_drawer" },
                    }),
                  );
                } catch {/* old WebView */}
              }
            }}
          />
          {mapsUrl && (
            <Row
              href={mapsUrl}
              tone="neutral"
              icon={<MapIcon />}
              title="Xem trên Google Maps"
              hint={shop?.addressDetail || shop?.address || shop?.province}
              external
              onClick={() =>
                trackShopsiteEvent(
                  ShopsiteEvents.MAPS_CLICK || "maps_click",
                  meta,
                )
              }
            />
          )}
          {fb && (
            <Row
              href={fb}
              tone="neutral"
              icon={<FacebookIcon />}
              title="Facebook"
              hint="Theo dõi cập nhật từ shop"
              external
              onClick={() =>
                trackShopsiteEvent(
                  ShopsiteEvents.FACEBOOK_CLICK || "facebook_click",
                  meta,
                )
              }
            />
          )}
        </ul>

        <p className="mt-3 text-[11px] text-gray-400 leading-snug text-center">
          Mọi tương tác được ghi nhận để cải thiện trải nghiệm với shop.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Row({ href, asButton, tone = "neutral", icon, title, hint, onClick, external }) {
  const tonePalette =
    tone === "primary"
      ? "bg-red-50 text-[#e60012]"
      : tone === "zalo"
      ? "bg-blue-50 text-blue-600"
      : "bg-gray-100 text-gray-700";

  const inner = (
    <div className="flex items-center gap-3 px-3 py-3 active:bg-gray-50">
      <span
        aria-hidden
        className={`inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${tonePalette}`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-gray-900 leading-tight">
          {title}
        </div>
        {hint && (
          <div className="text-[12px] text-gray-500 leading-snug truncate">
            {hint}
          </div>
        )}
      </div>
      <span aria-hidden className="text-gray-300">
        <ChevronRight />
      </span>
    </div>
  );

  if (asButton) {
    return (
      <li>
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left"
        >
          {inner}
        </button>
      </li>
    );
  }
  return (
    <li>
      <a
        href={href}
        onClick={onClick}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="block"
      >
        {inner}
      </a>
    </li>
  );
}

function buildMapsHref(shop) {
  if (!shop) return null;
  const lat = Number(shop.lat);
  const lng = Number(shop.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const addr = (
    shop.addressDetail ||
    shop.address ||
    shop.fullAddress ||
    [shop.phuong_xa, shop.tinh_tp, shop.province]
      .filter(Boolean)
      .join(", ")
  )?.trim();
  if (addr) {
    return `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
  }
  return null;
}

function extractFacebookUrl(fb) {
  if (!fb) return null;
  if (typeof fb === "string") {
    const s = fb.trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^facebook\.com\//i.test(s)) return `https://${s}`;
    return `https://facebook.com/${s.replace(/^\/+/, "")}`;
  }
  if (typeof fb === "object" && typeof fb.url === "string" && fb.url.trim()) {
    return fb.url.trim();
  }
  return null;
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
