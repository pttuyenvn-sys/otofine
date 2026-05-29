import React from "react";

export const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const REJECT_REASON_LABELS = {
  counterfeit: "Hàng giả/nhái",
  duplicate: "Trùng lặp sản phẩm",
  prohibited: "Hàng cấm",
  wrong_category: "Sai danh mục",
  poor_images: "Ảnh sản phẩm kém",
  insufficient_info: "Thiếu thông tin",
  misleading: "Thông tin gây hiểu lầm",
  spam: "Rao vặt/Spam",
  other: "Khác",
};

export const RISK_FLAG_LABELS = {
  LOW_IMAGE_COUNT: "Ảnh sản phẩm quá ít",
  HIGH_REJECT_RATE: "Tỉ lệ bị từ chối cao",
  DUPLICATE_PART_NUMBER: "Mã phụ tùng trùng",
  SUSPICIOUS_PRICE: "Giá khả nghi",
  NO_DESCRIPTION: "Thiếu mô tả",
  NEW_SHOP_HIGH_VOLUME: "Cửa hàng mới, lượng lớn",
  TOO_MANY_PENDING: "Quá nhiều đơn chờ",
};

export default function ModerationFilters({ selectedRisk = [], onRiskChange, compact = false }) {
  function toggle(level) {
    const has = selectedRisk.includes(level);
    const next = has ? selectedRisk.filter((l) => l !== level) : [...selectedRisk, level];
    onRiskChange && onRiskChange(next);
  }

  return (
    <div style={{ display: "flex", gap: compact ? 4 : 8, alignItems: "center", flexWrap: "nowrap" }}>
      {!compact ? <div style={{ fontSize: 13, opacity: 0.8 }}>Risk level:</div> : null}
      {RISK_LEVELS.map((lvl) => {
        const active = selectedRisk.includes(lvl);
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => toggle(lvl)}
            title={lvl}
            style={{
              padding: compact ? "3px 5px" : "6px 8px",
              borderRadius: compact ? 5 : 8,
              border: active ? "1px solid #111827" : "1px solid #e5e7eb",
              background: active ? "#fef3c7" : "#fff",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: compact ? 10 : 12,
              whiteSpace: "nowrap",
            }}
          >
            {compact ? (lvl === "CRITICAL" ? "CRIT" : lvl === "MEDIUM" ? "MED" : lvl === "LOW" ? "LOW" : "HIGH") : lvl}
          </button>
        );
      })}
    </div>
  );
}

