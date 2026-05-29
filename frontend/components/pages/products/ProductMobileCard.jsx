"use client";

import { useEffect, useRef, useState } from "react";
import { updateProductStock } from "../../../services/product.api";
import SellerProductStatusBadges from "../../products/SellerProductStatusBadges";
import SellerProductRowActions from "../../products/SellerProductRowActions";
import { sellerToast } from "../../ui/SellerToaster";
import {
  FALLBACK_PRODUCT_IMG,
  pickProductThumb,
  formatProductCarLine,
} from "../../products/sellerProductUi";

export default function ProductMobileCard({
  product,
  selected,
  onSelectToggle,
  onEdit,
  onDelete,
  onResubmit,
  resubmittingId = null,
}) {
  const [localStock, setLocalStock] = useState(Number(product.stock || 0));
  const [editingStock, setEditingStock] = useState(false);
  const [stockDraft, setStockDraft] = useState(String(localStock));
  const [stockSaving, setStockSaving] = useState(false);
  const stockInputRef = useRef(null);

  useEffect(() => {
    setLocalStock(Number(product.stock || 0));
    setStockDraft(String(Number(product.stock || 0)));
  }, [product.id, product.stock]);

  useEffect(() => {
    if (editingStock && stockInputRef.current) {
      stockInputRef.current.focus();
      stockInputRef.current.select();
    }
  }, [editingStock]);

  const thumb = pickProductThumb(product);
  const price = Number(product.price || 0);
  const stock = localStock;
  const fitmentLine = formatProductCarLine(product);
  const isRejected = product.sellerLifecycle === "rejected";
  const resubmitting = resubmittingId === product.id;

  let stockClass = "seller-dash-mobile-stock-inline seller-dash-mobile-stock-inline--ok";
  if (stock <= 0) stockClass = "seller-dash-mobile-stock-inline seller-dash-mobile-stock-inline--empty";
  else if (stock < 5) stockClass = "seller-dash-mobile-stock-inline seller-dash-mobile-stock-inline--low";

  async function commitStock(nextValue) {
    const next = Math.max(0, Math.floor(Number(nextValue) || 0));
    if (next === localStock) {
      setEditingStock(false);
      return;
    }
    const prev = localStock;
    setLocalStock(next);
    setStockSaving(true);
    setEditingStock(false);
    try {
      await updateProductStock(product.id, next);
      sellerToast.success(next === 0 ? "Đã cập nhật: Hết hàng" : `Tồn kho: ${next}`);
    } catch (err) {
      setLocalStock(prev);
      setStockDraft(String(prev));
      sellerToast.error(err?.response?.data?.message || "Cập nhật tồn kho thất bại");
    } finally {
      setStockSaving(false);
    }
  }

  return (
    <li className={`seller-dash-mobile-card${selected ? " is-selected" : ""}`}>
      <div className="seller-dash-mobile-row">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelectToggle(product.id)}
          aria-label={`Chọn ${product.partName || product.partNumber}`}
          className="seller-dash-mobile-check"
        />

        <button
          type="button"
          onClick={() => onEdit(product)}
          className="seller-dash-mobile-thumb"
          aria-label="Xem sản phẩm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb || FALLBACK_PRODUCT_IMG}
            alt=""
            loading="lazy"
            onError={(e) => {
              if (e.currentTarget.src !== FALLBACK_PRODUCT_IMG) {
                e.currentTarget.src = FALLBACK_PRODUCT_IMG;
              }
            }}
          />
        </button>

        <div className="seller-dash-mobile-content">
          <button type="button" onClick={() => onEdit(product)} className="seller-dash-mobile-title-btn">
            <span className="seller-dash-mobile-title">{product.partName || product.partNumber || "Sản phẩm"}</span>
          </button>

          <div className="seller-dash-mobile-meta">
            {product.partNumber ? (
              <span className="seller-dash-mobile-sku">{product.partNumber}</span>
            ) : null}
            {product.partNumber ? <span className="seller-dash-mobile-meta-sep" aria-hidden>•</span> : null}
            {editingStock ? (
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
                className="seller-dash-mobile-stock-input"
              />
            ) : (
              <button
                type="button"
                className={stockClass}
                disabled={stockSaving}
                onClick={() => {
                  setStockDraft(String(localStock));
                  setEditingStock(true);
                }}
              >
                Tồn: {stock.toLocaleString("vi-VN")}
              </button>
            )}
          </div>

          {fitmentLine ? <div className="seller-dash-mobile-fitment">{fitmentLine}</div> : null}

          <div className="seller-dash-mobile-badges">
            <SellerProductStatusBadges product={product} compact />
          </div>

          {isRejected ? (
            <div className="seller-dash-mobile-reject">
              <div className="seller-dash-mobile-reject-row">
                <span className="seller-dash-mobile-reject-pill">Bị từ chối</span>
              </div>
              {product.lastRejectReasonLabel ? (
                <div className="seller-dash-mobile-reject-reason">{product.lastRejectReasonLabel}</div>
              ) : null}
            </div>
          ) : null}

          <div className="seller-dash-mobile-price">{price.toLocaleString("vi-VN")}₫</div>
        </div>

        <SellerProductRowActions
          product={product}
          onEdit={onEdit}
          onDelete={onDelete}
          onResubmit={onResubmit}
          resubmitting={resubmitting}
          layout="dock"
        />
      </div>
    </li>
  );
}
