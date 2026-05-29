"use client";

import { formatRejectTime } from "@/lib/seller/sellerProductGovernance";

export default function SellerProductRejectBanner({ product, onResubmit, resubmitting = false }) {
  if (!product || product.sellerLifecycle !== "rejected") return null;

  return (
    <div className="seller-reject-banner">
      <div className="seller-reject-banner-title">Sản phẩm bị từ chối</div>
      {product.lastRejectReasonLabel ? (
        <div className="seller-reject-banner-reason">
          <strong>Lý do:</strong> {product.lastRejectReasonLabel}
        </div>
      ) : null}
      {product.lastRejectNotes ? (
        <div className="seller-reject-banner-note">{product.lastRejectNotes}</div>
      ) : null}
      {product.lastRejectedAt ? (
        <div className="seller-reject-banner-time">{formatRejectTime(product.lastRejectedAt)}</div>
      ) : null}
      {onResubmit ? (
        <button
          type="button"
          className="seller-reject-resubmit-btn"
          disabled={resubmitting}
          onClick={() => onResubmit(product)}
        >
          {resubmitting ? "Đang gửi…" : "Gửi duyệt lại"}
        </button>
      ) : null}
    </div>
  );
}
