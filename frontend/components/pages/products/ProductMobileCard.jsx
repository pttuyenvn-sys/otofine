"use client";

/**
 * Compact mobile-friendly product row.
 *
 * Operational additions (seller-ops pass):
 *   - Inline stock edit — tap the stock chip to swap into a numeric
 *     input. Save fires `PATCH /products/:id/stock` (additive endpoint)
 *     with optimistic UI; on failure we rollback and surface a toast.
 *   - Derived status pill (Đang bán / Hết hàng) sits beside price so
 *     the seller can tell at a glance which SKUs are dead.
 *   - Kebab menu picks up a "Sao chép liên kết" quick share that
 *     copies the storefront canonical product URL to the clipboard.
 *
 * Desktop layout (`ProductTable`) is untouched.
 */

import { useEffect, useRef, useState } from "react";
import { updateProductStock } from "../../../services/product.api";
import ProductHeatChip from "../../products/ProductHeatChip";
import { sellerToast } from "../../ui/SellerToaster";
import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

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

function siteOrigin() {
  if (typeof window === "undefined") return "https://otofine.com";
  return window.location.origin.replace(/\/$/, "");
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

  // Inline stock edit local state. `localStock` mirrors the server
  // value but switches to user input while editing — this lets us
  // be optimistic without forcing the parent to reload the whole
  // product list on every stock tweak.
  const [localStock, setLocalStock] = useState(Number(product.stock || 0));
  const [editingStock, setEditingStock] = useState(false);
  const [stockDraft, setStockDraft] = useState(String(localStock));
  const [stockSaving, setStockSaving] = useState(false);
  const stockInputRef = useRef(null);

  useEffect(() => {
    // Re-sync if the parent reloads with a different product or stock.
    setLocalStock(Number(product.stock || 0));
    setStockDraft(String(Number(product.stock || 0)));
  }, [product.id, product.stock]);

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

  useEffect(() => {
    if (editingStock && stockInputRef.current) {
      stockInputRef.current.focus();
      stockInputRef.current.select();
    }
  }, [editingStock]);

  const thumb = pickThumb(product);
  const price = Number(product.price || 0);
  const stock = localStock;
  const car = stripHtml((product.car || "").replace(/<br\/?>/gi, " · "));
  const fitmentLine = car || product.origin || "";

  // Stock chip tone — green when in stock, gray when 0, amber when low.
  let stockTone = "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (stock <= 0) stockTone = "bg-gray-100 text-gray-500 border-gray-200";
  else if (stock < 5) stockTone = "bg-amber-50 text-amber-700 border-amber-100";

  // Derived status pill — "Đang bán" while stock > 0, "Hết hàng"
  // otherwise. (We deliberately do NOT surface a "Tạm ẩn" state here
  // because there's no schema column to back it; future work.)
  const status = stock > 0 ? "selling" : "oos";
  const statusLabel = status === "selling" ? "Đang bán" : "Hết hàng";
  const statusTone =
    status === "selling"
      ? "bg-emerald-600/10 text-emerald-700 border-emerald-200"
      : "bg-gray-100 text-gray-500 border-gray-200";

  async function commitStock(nextValue) {
    const next = Math.max(0, Math.floor(Number(nextValue) || 0));
    if (next === localStock) {
      setEditingStock(false);
      return;
    }
    const prev = localStock;
    setLocalStock(next); // optimistic
    setStockSaving(true);
    setEditingStock(false);
    try {
      await updateProductStock(product.id, next);
      sellerToast.success(
        next === 0 ? "Đã cập nhật: Hết hàng" : `Tồn kho: ${next}`,
      );
    } catch (err) {
      // Rollback on failure.
      setLocalStock(prev);
      setStockDraft(String(prev));
      sellerToast.error(
        err?.response?.data?.message || "Cập nhật tồn kho thất bại",
      );
    } finally {
      setStockSaving(false);
    }
  }

  function handleCopyLink() {
    try {
      const path = buildProductSeoUrl({
        id: product.id,
        partName: product.partName,
        partNumber: product.partNumber,
        ...(product.cars?.[0] || {}),
      });
      const url = path.startsWith("http") ? path : siteOrigin() + path;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(
          () => sellerToast.success("Đã sao chép liên kết"),
          () => sellerToast.error("Không thể sao chép liên kết"),
        );
      } else {
        // Fallback for very old mobile browsers.
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        sellerToast.success("Đã sao chép liên kết");
      }
    } catch (e) {
      sellerToast.error("Không thể sao chép liên kết");
    }
  }

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

        {/* Product interest heat chip — silent when below threshold. */}
        <div className="mt-1">
          <ProductHeatChip productId={product.id} />
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-bold text-[#e60012] tabular-nums">
            {price.toLocaleString("vi-VN")}₫
          </span>

          {/* Status pill — derived from stock. One-tap to "Sửa nhanh"
              from the kebab. */}
          <span
            className={
              "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none " +
              statusTone
            }
          >
            {statusLabel}
          </span>

          {/* Inline stock edit. Tapping the chip swaps it for a small
              numeric input; Enter / blur commits. */}
          {editingStock ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-[10px] text-gray-500">Tồn:</span>
              <input
                ref={stockInputRef}
                type="number"
                inputMode="numeric"
                min={0}
                value={stockDraft}
                onChange={(e) => setStockDraft(e.target.value)}
                onBlur={() => commitStock(stockDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitStock(stockDraft);
                  } else if (e.key === "Escape") {
                    setEditingStock(false);
                    setStockDraft(String(localStock));
                  }
                }}
                className="w-14 px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50/30 text-[12px] text-gray-900 tabular-nums"
              />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStockDraft(String(localStock));
                setEditingStock(true);
              }}
              disabled={stockSaving}
              aria-label={`Sửa tồn kho (hiện ${stock})`}
              className={
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none " +
                stockTone +
                " active:scale-95 transition-transform"
              }
            >
              <span aria-hidden>{stockSaving ? "⏳" : "✏️"}</span>
              Tồn: {stock.toLocaleString("vi-VN")}
            </button>
          )}
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
            className="absolute right-0 top-10 z-30 min-w-[170px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm"
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
                setStockDraft(String(localStock));
                setEditingStock(true);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              🔢 Sửa tồn kho
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                handleCopyLink();
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              🔗 Sao chép liên kết
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
