"use client";

import { memo } from "react";
import ProductHeatChip from "./ProductHeatChip";
import { SellerLifecycleBadge, SellerVisibilityBadge } from "./SellerProductStatusBadges";
import SellerProductRowActions from "./SellerProductRowActions";
import {
  FALLBACK_PRODUCT_IMG,
  pickProductThumb,
  formatProductCarLine,
} from "./sellerProductUi";

const ProductTableRow = memo(function ProductTableRow({
  product: p,
  selected,
  onSelectChange,
  selectedIds,
  onEdit,
  onDelete,
  onResubmit,
  resubmittingId,
}) {
  const thumb = pickProductThumb(p);
  const fitment = formatProductCarLine(p);
  const isRejected = p.sellerLifecycle === "rejected";
  const stock = Number(p.stock || 0);
  let stockClass = "seller-dash-stock seller-dash-stock--ok";
  if (stock <= 0) stockClass = "seller-dash-stock seller-dash-stock--empty";
  else if (stock < 5) stockClass = "seller-dash-stock seller-dash-stock--low";

  return (
    <tr className={selected ? "is-selected" : undefined}>
      <td className="seller-dash-col-check">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Chọn ${p.partName || p.partNumber}`}
          onChange={() =>
            onSelectChange(
              selectedIds.includes(p.id)
                ? selectedIds.filter((x) => x !== p.id)
                : [...selectedIds, p.id],
            )
          }
        />
      </td>

      <td className="seller-dash-col-product">
        <div className="seller-dash-product-cell">
          <div className="seller-dash-product-thumb">
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
          </div>
          <div className="seller-dash-product-meta">
            <div className="seller-dash-product-name-row">
              <span className="seller-dash-product-name">{p.partName || p.partNumber || "Sản phẩm"}</span>
              <ProductHeatChip productId={p.id} />
            </div>
            {p.partNumber ? <div className="seller-dash-product-sku">{p.partNumber}</div> : null}
            {fitment ? <div className="seller-dash-product-fitment">{fitment}</div> : null}
          </div>
        </div>
      </td>

      <td className="seller-dash-col-status">
        <SellerLifecycleBadge product={p} />
        {isRejected ? (
          <div className="seller-dash-reject-block">
            <div className="seller-dash-reject-title">⚠ Bị từ chối</div>
            {p.lastRejectReasonLabel ? (
              <div className="seller-dash-reject-reason">{p.lastRejectReasonLabel}</div>
            ) : null}
            <div className="seller-dash-reject-actions">
              <button type="button" className="seller-dash-reject-link" onClick={() => onEdit(p)}>
                Sửa sản phẩm
              </button>
              {onResubmit ? (
                <>
                  <span className="seller-dash-reject-sep">·</span>
                  <button
                    type="button"
                    className="seller-dash-reject-link"
                    disabled={resubmittingId === p.id}
                    onClick={() => onResubmit(p)}
                  >
                    {resubmittingId === p.id ? "Đang gửi…" : "Gửi duyệt lại"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </td>

      <td className="seller-dash-col-price">
        {Number(p.price || 0).toLocaleString("vi-VN")}₫
      </td>

      <td className="seller-dash-col-stock">
        <span className={stockClass}>{stock.toLocaleString("vi-VN")}</span>
      </td>

      <td className="seller-dash-col-visibility">
        <SellerVisibilityBadge product={p} />
      </td>

      <td className="seller-dash-col-actions">
        <SellerProductRowActions
          product={p}
          onEdit={onEdit}
          onDelete={onDelete}
          onResubmit={onResubmit}
          resubmitting={resubmittingId === p.id}
        />
      </td>
    </tr>
  );
});

export default function ProductTable({
  data = [],
  selectedIds = [],
  onSelectChange,
  onEdit,
  onDelete,
  onResubmit,
  resubmittingId = null,
}) {
  const allChecked = data.length > 0 && selectedIds.length === data.length;

  return (
    <div className="seller-dash-table-wrap">
      <table className="seller-dash-table">
        <thead>
          <tr>
            <th className="seller-dash-col-check">
              <input
                type="checkbox"
                checked={allChecked}
                aria-label="Chọn tất cả"
                onChange={(e) =>
                  onSelectChange(e.target.checked ? data.map((p) => p.id) : [])
                }
              />
            </th>
            <th>Sản phẩm</th>
            <th>Trạng thái</th>
            <th>Giá</th>
            <th>Tồn kho</th>
            <th>Hiển thị</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={7} className="seller-dash-empty">
                Chưa có sản phẩm nào
              </td>
            </tr>
          ) : (
            data.map((p) => (
              <ProductTableRow
                key={p.id}
                product={p}
                selected={selectedIds.includes(p.id)}
                selectedIds={selectedIds}
                onSelectChange={onSelectChange}
                onEdit={onEdit}
                onDelete={onDelete}
                onResubmit={onResubmit}
                resubmittingId={resubmittingId}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
