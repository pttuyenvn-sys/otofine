"use client";

import { getLifecycleMeta, getVisibilityMeta } from "@/lib/seller/sellerProductGovernance";

const VISIBILITY_LABELS = {
  public: "Hiển thị công khai",
  hidden: "Ẩn khỏi marketplace",
};

function GovernanceBadge({ meta, className = "" }) {
  if (!meta) return null;
  return (
    <span className={`seller-gov-badge ${className}`.trim()} style={{ "--badge-color": meta.color, "--badge-bg": meta.bg, "--badge-border": meta.border }}>
      {meta.label}
    </span>
  );
}

export function SellerLifecycleBadge({ product }) {
  const lifecycle = getLifecycleMeta(product);
  return <GovernanceBadge meta={lifecycle} className="seller-gov-badge--lifecycle" />;
}

export function SellerVisibilityBadge({ product }) {
  const visibility = getVisibilityMeta(product);
  const label = VISIBILITY_LABELS[product?.visibility] || visibility.label;
  return (
    <GovernanceBadge
      meta={{ ...visibility, label }}
      className="seller-gov-badge--visibility"
    />
  );
}

export default function SellerProductStatusBadges({ product, compact = false, mode = "both" }) {
  if (mode === "lifecycle") return <SellerLifecycleBadge product={product} />;
  if (mode === "visibility") return <SellerVisibilityBadge product={product} />;

  return (
    <div className={`seller-gov-badges${compact ? " seller-gov-badges--compact" : ""}`}>
      <SellerLifecycleBadge product={product} />
      <SellerVisibilityBadge product={product} />
    </div>
  );
}
