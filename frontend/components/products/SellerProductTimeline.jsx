"use client";

import { useEffect, useState } from "react";
import { getSellerProductTimeline } from "@/services/product.api";
import { formatRejectTime } from "@/lib/seller/sellerProductGovernance";

export default function SellerProductTimeline({ productId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!productId) {
      setRows([]);
      return undefined;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getSellerProductTimeline(productId);
        if (!cancelled) setRows(res.data?.rows || []);
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || "Không tải được lịch sử");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [productId]);

  if (!productId) return null;

  return (
    <div className="seller-product-timeline">
      <div className="seller-product-timeline-title">Lịch sử kiểm duyệt</div>
      {loading ? <div className="seller-product-timeline-empty">Đang tải…</div> : null}
      {error ? <div className="seller-product-timeline-error">{error}</div> : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="seller-product-timeline-empty">Chưa có sự kiện</div>
      ) : null}
      <div className="seller-product-timeline-list">
        {rows.map((row) => (
          <div key={row.id} className="seller-product-timeline-item">
            <div className="seller-product-timeline-item-head">
              <strong>{row.title}</strong>
              <span>{formatRejectTime(row.createdAt)}</span>
            </div>
            <div className="seller-product-timeline-item-meta">{row.actorLabel}</div>
            {row.rejectReasonLabel ? (
              <div className="seller-product-timeline-item-reject">Lý do: {row.rejectReasonLabel}</div>
            ) : null}
            {row.notes ? <div className="seller-product-timeline-item-note">{row.notes}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
