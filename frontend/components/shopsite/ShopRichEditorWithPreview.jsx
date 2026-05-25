"use client";

/**
 * ShopRichEditorWithPreview
 *
 * UX-polish redesign — the storefront intro editor is the page's
 * PRIMARY branding surface, so the editor itself dominates the layout
 * and the preview becomes supporting context.
 *
 * Layout
 * ──────
 * Desktop XL+ (≥1280px):
 *   ┌──────────────────────────────┬──────────────┐
 *   │ Tiptap editor (1fr)           │ preview      │
 *   │   sticky toolbar              │ 320–360 px   │
 *   │   min-height 480 px           │ sticky aside │
 *   │                               │ subtle bg    │
 *   └──────────────────────────────┴──────────────┘
 *
 * Tablet / Mobile (< xl): single column, editor full width. Preview
 *   collapsed by default behind a toggle button ("Xem trước storefront")
 *   so the editing canvas isn't squeezed by a permanently-visible
 *   preview panel. Toggle expands a lightweight preview card
 *   directly below the editor.
 *
 * Why a collapsible (and not always-on) mobile preview
 * ────────────────────────────────────────────────────
 * On phones an always-on preview meant the editor became a tiny
 * textarea — the opposite of "editing a real business landing page".
 * The toggle gives the seller editor-first focus while preserving a
 * one-tap path to the live preview.
 *
 * Everything else is unchanged: ShopRichContentRenderer is still the
 * preview engine, Tiptap is still the editor engine, the sanitizer
 * contract on the server is untouched, the value/onChange API is
 * identical so all data bindings and the save flow keep working.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import ShopRichContentRenderer from "./ShopRichContentRenderer";

// Tiptap pulls ProseMirror's contentEditable engine which is window-bound.
// Loading it via next/dynamic with ssr:false keeps it out of the SSR bundle.
const ShopRichEditor = dynamic(() => import("./ShopRichEditor"), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-200 rounded-xl bg-white p-6 text-sm text-gray-400">
      Đang tải trình soạn thảo…
    </div>
  ),
});

export default function ShopRichEditorWithPreview({ value, onChange }) {
  // The mobile/tablet preview drawer is collapsed by default so the
  // editor canvas isn't competing for vertical real-estate below xl.
  // Sellers tap "Xem trước storefront" when they want to verify.
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6 xl:items-start">
      {/*
        Editor column — dominant.
        The `shop-rich-editor--tall` wrapper bumps the ProseMirror
        canvas to ~480 px via ShopRichEditor.css. The underlying
        Tiptap component still owns its toolbar (sticky), file
        picker, embed insertion, CTA shortcuts and sanitizer
        contract — we only enlarge the canvas around it.
      */}
      <div className="min-w-0 shop-rich-editor--tall">
        <ShopRichEditor value={value} onChange={onChange} />

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400 leading-relaxed flex-1">
            HTML sẽ được lọc lại trên server: chỉ giữ heading, danh sách, ảnh, link,
            embed YouTube/TikTok/Facebook và nút CTA. Các thẻ <code>script</code>,
            <code>onclick</code>, <code>javascript:</code> và iframe lạ sẽ bị loại bỏ.
          </p>
          {/* Toggle is only shown < xl; xl+ has a permanent sticky aside */}
          <button
            type="button"
            onClick={() => setMobilePreviewOpen((o) => !o)}
            className="xl:hidden shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50"
            aria-expanded={mobilePreviewOpen}
            aria-controls="shop-intro-preview-mobile"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {mobilePreviewOpen ? "Ẩn xem trước" : "Xem trước storefront"}
          </button>
        </div>

        {/* Mobile / tablet collapsible preview — below the editor. */}
        {mobilePreviewOpen && (
          <div
            id="shop-intro-preview-mobile"
            className="xl:hidden mt-4 border border-gray-200 rounded-xl bg-gray-50 p-4"
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Xem trước nội dung trên storefront
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <ShopRichContentRenderer
                html={value}
                emptyText="Bản xem trước sẽ hiển thị ở đây khi bạn viết nội dung."
              />
            </div>
          </div>
        )}
      </div>

      {/*
        XL+ side panel — sticky, supporting context.
        Smaller font, lighter background, narrower max-width so it
        reads as secondary while still rendering the EXACT storefront
        component (ShopRichContentRenderer) — pixel-equivalence with
        production preserved.
      */}
      <aside className="hidden xl:block">
        <div className="sticky top-24 border border-gray-200 rounded-xl bg-gray-50/60 backdrop-blur-sm">
          <div className="px-4 py-2.5 border-b border-gray-200/80 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
              Xem trước storefront
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />
          </div>
          <div className="p-4 max-h-[70vh] overflow-y-auto">
            <ShopRichContentRenderer
              html={value}
              emptyText="Bản xem trước sẽ hiển thị ở đây khi bạn viết nội dung."
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
