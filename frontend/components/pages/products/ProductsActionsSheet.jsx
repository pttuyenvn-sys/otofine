"use client";

/**
 * Mobile overflow sheet for the Products toolbar.
 *
 * Hosts the secondary actions that no longer fit on a phone toolbar:
 *   - Import Ảnh
 *   - Import Sản phẩm
 *   - Xuất Excel
 *
 * The desktop toolbar still shows everything inline; this sheet is
 * mounted unconditionally but only opens on mobile via the kebab
 * button next to the primary "+ Thêm" CTA.
 *
 * Implementation notes:
 *   - Lazy mounted via the parent's `open` prop — when closed, the
 *     sheet's contents are not in the DOM, so no hidden listeners
 *     leak.
 *   - Body scroll-lock + ESC handler mirror the existing bottom-sheet
 *     patterns used by the shopsite mobile filters / categories.
 *   - Pure presentational: callers wire the actual action handlers
 *     (e.g. setShowImportImagePopup) onto the items array, so the
 *     existing popups / pipelines are untouched.
 */

import { useEffect } from "react";

export default function ProductsActionsSheet({ open, onClose, items = [] }) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-stretch"
      role="dialog"
      aria-modal="true"
      aria-label="Hành động phụ"
    >
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-black/40 animate-fadeIn"
        onClick={onClose}
      />
      <div className="relative w-full bg-white rounded-t-2xl shadow-2xl animate-slideUp pb-[max(env(safe-area-inset-bottom,0px),16px)]">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Hành động khác</p>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 text-xl leading-none px-2 -mr-2"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>
        <ul className="py-1">
          {items.map((it, idx) => (
            <li key={`${it.label}-${idx}`}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  it.onClick?.();
                }}
                disabled={it.disabled}
                className={
                  "w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:bg-gray-50 disabled:opacity-50 " +
                  (it.danger ? "text-red-600" : "text-gray-900")
                }
              >
                <span
                  className="w-9 h-9 rounded-lg bg-gray-50 inline-flex items-center justify-center text-base shrink-0"
                  aria-hidden
                >
                  {it.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{it.label}</span>
                  {it.subtitle && (
                    <span className="block text-[11px] text-gray-500 mt-0.5 leading-tight">
                      {it.subtitle}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        :global(.animate-fadeIn) { animation: fadeIn 0.18s ease-out; }
        :global(.animate-slideUp) { animation: slideUp 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }
      `}</style>
    </div>
  );
}
