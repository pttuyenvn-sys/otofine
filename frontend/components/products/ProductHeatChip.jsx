"use client";

import { deriveProductHeatBadge, useShopProductHeat } from "@/hooks/useShopProductHeat";

/**
 * Inline "product interest heat" chip for the seller catalogue.
 *
 * Renders one of:
 *   🔥 Quan tâm cao  (≥ 20 storefront clicks in 7d)
 *   📈 Tăng tương tác (≥ 10)
 *   👀 Được xem nhiều (≥ 5)
 *
 * Nothing else. When the product has fewer than 5 clicks, or the
 * heat map is still loading, or the seller is on a fresh session
 * with no analytics yet — the component renders null. This is
 * deliberate: the chip is a positive signal, never a negative one.
 *
 * Pulls from the shared session-cached `useShopProductHeat()` hook,
 * so the network cost is the SAME single GET regardless of how many
 * products are visible on the page.
 */
export default function ProductHeatChip({ productId, className = "" }) {
  const { map, loading } = useShopProductHeat();
  if (loading) return null;
  const clicks = map.get(Number(productId)) || 0;
  const badge = deriveProductHeatBadge(clicks);
  if (!badge) return null;

  const tone =
    badge.tone === "hot"
      ? "bg-red-50 text-red-700 border-red-100"
      : badge.tone === "warm"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-blue-50 text-blue-700 border-blue-100";

  return (
    <span
      className={
        "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold leading-none whitespace-nowrap " +
        tone +
        (className ? ` ${className}` : "")
      }
      title={`${badge.clicks} lượt xem từ storefront trong 7 ngày`}
    >
      {badge.label}
    </span>
  );
}
