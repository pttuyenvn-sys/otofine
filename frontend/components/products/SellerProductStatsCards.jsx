"use client";

import { memo } from "react";
import { deriveOutOfStockFromStats } from "./sellerProductUi";

function StatCard({ label, value, tone = "default" }) {
  return (
    <div className={`seller-dash-stat seller-dash-stat--${tone}`}>
      <div className="seller-dash-stat-value">{value.toLocaleString("vi-VN")}</div>
      <div className="seller-dash-stat-label">{label}</div>
    </div>
  );
}

function SellerProductStatsCards({ stats = {} }) {
  const outOfStock = deriveOutOfStockFromStats(stats);

  return (
    <div className="seller-dash-stats">
      <StatCard label="Tổng sản phẩm" value={Number(stats.all) || 0} tone="default" />
      <StatCard label="Đang bán" value={Number(stats.published) || 0} tone="success" />
      <StatCard label="Chờ duyệt" value={Number(stats.pending_review) || 0} tone="warning" />
      <StatCard label="Từ chối" value={Number(stats.rejected) || 0} tone="danger" />
      <StatCard label="Hết hàng" value={outOfStock} tone="muted" />
    </div>
  );
}

export default memo(SellerProductStatsCards);
