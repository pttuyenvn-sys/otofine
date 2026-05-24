"use client";

/**
 * ShopPolicyEditor — lightweight rich editor for marketplace policy
 * fields (`salePolicy`, `warrantyPolicy`).
 *
 * Differences vs. ShopRichEditor(mode="storefront"):
 *   - no live preview pane (policies don't need WYSIWYG visualisation
 *     beside the editor; the editor itself uses storefront typography)
 *   - no CTA toolbar block — policy text is documentation, not a call
 *     to action
 *
 * Same trust model: emits HTML, server runs `sanitizeShopHtml` before
 * persisting, same image upload + embed parser pipeline.
 */

import dynamic from "next/dynamic";

const ShopRichEditor = dynamic(() => import("./ShopRichEditor"), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-200 rounded-xl bg-white p-6 text-sm text-gray-400">
      Đang tải trình soạn thảo…
    </div>
  ),
});

export default function ShopPolicyEditor({ value, onChange, placeholder }) {
  return (
    <ShopRichEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      mode="policy"
    />
  );
}
