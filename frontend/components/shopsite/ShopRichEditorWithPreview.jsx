"use client";

/**
 * ShopRichEditorWithPreview
 *
 * Wraps the Tiptap editor + a live storefront-preview pane.
 * Desktop  → side-by-side (editor left, preview right).
 * Mobile   → tabs toggle between "Chỉnh sửa" and "Xem trước".
 *
 * The preview uses `ShopRichContentRenderer` — the exact same component
 * the public storefront `/shops/[slug]/gioi-thieu` uses, so the seller
 * sees the rendered output pixel-for-pixel.  No duplicated rendering
 * logic.
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
  const [mobileTab, setMobileTab] = useState("edit"); // edit | preview

  return (
    <div className="space-y-3">
      {/* Mobile tab switcher (hidden ≥ lg) */}
      <div className="lg:hidden flex p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMobileTab("edit")}
          className={
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors " +
            (mobileTab === "edit" ? "bg-white shadow-sm text-emerald-700" : "text-gray-500")
          }
        >
          Chỉnh sửa
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors " +
            (mobileTab === "preview" ? "bg-white shadow-sm text-emerald-700" : "text-gray-500")
          }
        >
          Xem trước
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor pane */}
        <div className={mobileTab === "edit" ? "" : "hidden lg:block"}>
          <div className="text-xs font-medium text-gray-500 mb-1.5 hidden lg:block">Chỉnh sửa</div>
          <ShopRichEditor value={value} onChange={onChange} />
        </div>

        {/* Preview pane */}
        <div className={mobileTab === "preview" ? "" : "hidden lg:block"}>
          <div className="text-xs font-medium text-gray-500 mb-1.5 hidden lg:block">Xem trước (giống storefront)</div>
          <div className="border border-gray-200 rounded-xl bg-white p-4 sm:p-5 min-h-[280px]">
            <ShopRichContentRenderer
              html={value}
              emptyText="Bản xem trước sẽ hiển thị ở đây khi bạn viết nội dung."
            />
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        HTML sẽ được lọc lại trên server: chỉ giữ heading, danh sách, ảnh, link,
        embed YouTube/TikTok/Facebook, và nút CTA. Mọi thẻ <code>script</code>,
        <code>onclick</code>, <code>javascript:</code> hay iframe lạ sẽ bị loại bỏ tự động.
      </div>
    </div>
  );
}
