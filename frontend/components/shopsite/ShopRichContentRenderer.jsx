"use client";

import "./ShopRichContent.css";

/**
 * Single rendering source of truth for the seller's rich storefront
 * content (`intro_html`).  Used by:
 *
 *   - the public storefront `/shops/[slug]/gioi-thieu` page
 *   - the editor's live-preview pane (so the seller sees the same
 *     visual the customer will see)
 *   - future SEO landing renderers that surface intro_html
 *
 * Trust model:
 *   HTML reaching this component is already sanitized by the backend
 *   (`backend/domains/shopPublic/utils/htmlSanitize.util.js`).  We
 *   still pass it through `dangerouslySetInnerHTML` — this component
 *   is therefore the second-most-trusted boundary; do NOT accept
 *   un-sanitized input on the editor preview path (the editor pipes
 *   its own output through a client-side `previewSanitize` helper).
 *
 * No behaviour beyond rendering: styling is delivered via the sibling
 * CSS file so the storefront and the seller preview match pixel-for-pixel.
 */
export default function ShopRichContentRenderer({ html, emptyText = "Shop chưa cập nhật phần giới thiệu chi tiết.", className = "" }) {
  if (!html || !String(html).trim()) {
    return (
      <div className={`shop-rich-content shop-rich-content--empty ${className}`}>
        {emptyText}
      </div>
    );
  }
  return (
    <article
      className={`shop-rich-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
