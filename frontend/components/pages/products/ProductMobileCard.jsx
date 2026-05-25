"use client";

/**
 * Compact mobile-friendly product row.
 *
 * Replaces the desktop `<ProductTable>` row on phones. Designed to
 * fit the seller's mental model from Shopee/TikTok Shop seller apps:
 *   - Square thumbnail on the left
 *   - Title (2-line clamp)
 *   - Price + stock chip on the same row
 *   - One kebab button for secondary actions (Sửa, Xóa) so the row
 *     is tappable as a whole into "Xem" (which opens the existing
 *     AddProductPopup in edit mode) without overloading the visible
 *     buttons.
 *
 * No business logic added or removed — every action this card surfaces
 * (`onEdit`, `onDelete`, select-toggle) maps 1:1 to a handler already
 * used by `ProductTable.jsx`. The desktop table stays exactly as-is.
 */

import { useEffect, useRef, useState } from "react";

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23f3f4f6'/><text x='50%' y='52%' fill='%239ca3af' font-family='sans-serif' font-size='11' text-anchor='middle'>no image</text></svg>`,
  );

function pickThumb(p) {
  const arr = Array.isArray(p?.images) ? p.images : [];
  const first = arr.find((i) => i && i.url) || arr[0];
  return first?.url || null;
}

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export default function ProductMobileCard({
  product,
  selected,
  onSelectToggle,
  onEdit,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const thumb = pickThumb(product);
  const price = Number(product.price || 0);
  const stock = Number(product.stock || 0);
  const car = stripHtml((product.car || "").replace(/<br\/?>/gi, " · "));
  const fitmentLine = car || product.origin || "";

  // Stock chip tone — green when in stock, gray when 0, amber when low.
  let stockTone = "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (stock <= 0) stockTone = "bg-gray-100 text-gray-500 border-gray-200";
  else if (stock < 5) stockTone = "bg-amber-50 text-amber-700 border-amber-100";

  return (
    <li
      className={
        "bg-white rounded-xl border " +
        (selected ? "border-emerald-300 ring-1 ring-emerald-200" : "border-gray-200") +
        " px-2.5 py-2.5 flex items-start gap-2.5 min-w-0"
      }
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelectToggle(product.id)}
        aria-label={`Chọn ${product.partName || product.partNumber}`}
        className="mt-1 shrink-0 w-4 h-4 accent-emerald-600"
      />

      <button
        type="button"
        onClick={() => onEdit(product)}
        className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-50 border border-gray-100"
        aria-label="Xem sản phẩm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb || FALLBACK_IMG}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => {
            if (e.currentTarget.src !== FALLBACK_IMG) {
              e.currentTarget.src = FALLBACK_IMG;
            }
          }}
        />
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(product)}
          className="block w-full text-left"
        >
          <p
            className="text-[13px] font-semibold text-gray-900 leading-snug"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product.partName || product.partNumber || "Sản phẩm"}
          </p>
        </button>

        {/* PartNumber + fitment one-liner */}
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
          {product.partNumber && (
            <span className="font-medium text-gray-600">{product.partNumber}</span>
          )}
          {product.partNumber && fitmentLine && <span className="mx-1.5">·</span>}
          {fitmentLine}
        </p>

        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-bold text-[#e60012] tabular-nums">
            {price.toLocaleString("vi-VN")}₫
          </span>
          <span
            className={
              "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none " +
              stockTone
            }
          >
            Tồn: {stock.toLocaleString("vi-VN")}
          </span>
        </div>
      </div>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          aria-label="Hành động"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-50 active:bg-gray-100 inline-flex items-center justify-center text-lg leading-none"
        >
          ⋮
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-10 z-30 min-w-[140px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onEdit(product);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              ✏️ Sửa / Xem ảnh
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(product.id);
              }}
              className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50"
            >
              🗑 Xóa
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
