"use client";

/**
 * "Hiệu quả" — seller-center insights page.
 *
 * This is the 5th seller-IA destination introduced alongside the unified
 * desktop sidebar. The page is intentionally lightweight: it reuses the
 * existing `<ShopMetricsOverview />` (read-only aggregates from
 * /api/shop/metrics/overview) and adds a friendly intro + quick links
 * back to the actions that move each metric.
 *
 * The standalone route exists so:
 *   - Desktop sidebar gets a real "Hiệu quả" tab instead of an anchor
 *     into /shop/settings#metrics (cleaner active-state logic).
 *   - Mobile users land on a focused screen instead of scrolling a long
 *     settings form when they tap the metrics row on the account hub.
 *
 * No new API. No new data. Pure UI composition over an existing block.
 */

import Link from "next/link";
import ShopMetricsOverview from "./shop-settings/ShopMetricsOverview";
import useSellerStorefrontUrl from "@/hooks/useSellerStorefrontUrl";

function ActionTile({ href, icon, title, sub, external = false }) {
  const cls =
    "flex items-start gap-3 p-3 sm:p-4 bg-white border border-gray-200 rounded-xl hover:border-emerald-300 hover:shadow-sm transition-all";
  const inner = (
    <>
      <span
        aria-hidden
        className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 inline-flex items-center justify-center text-base shrink-0"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 leading-tight">
          {title}
        </span>
        {sub && (
          <span className="block text-xs text-gray-500 mt-0.5 leading-tight">
            {sub}
          </span>
        )}
      </span>
      <span aria-hidden className="text-gray-300 text-lg leading-none">
        ›
      </span>
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={false} className={cls}>
      {inner}
    </Link>
  );
}

export default function ShopInsights() {
  const { url: storefrontUrl } = useSellerStorefrontUrl();
  return (
    <div className="main-content">
      <div className="max-w-4xl mx-auto w-full px-1 sm:px-3 py-1 sm:py-2">
        <header className="mb-3 sm:mb-5">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">
            Hiệu quả shop
          </h1>
          <p className="text-[12px] sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
            Số liệu vận hành tổng quan trong 30 ngày gần đây và hôm nay.
          </p>
        </header>

        <ShopMetricsOverview />

        <section className="mt-4 sm:mt-6">
          <h2 className="text-[12px] sm:text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2 sm:mb-3">
            Hành động nhanh
          </h2>
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
            <ActionTile
              href="/rfq/shop/inbox"
              icon="💬"
              title="Trả lời RFQ mới"
              sub="Phản hồi nhanh giúp tăng tỉ lệ chốt đơn"
            />
            <ActionTile
              href="/shop/products"
              icon="📦"
              title="Cập nhật sản phẩm"
              sub="Bổ sung ảnh, giá, tồn kho cho sản phẩm xem nhiều"
            />
            <ActionTile
              href="/shop/settings#contact"
              icon="📞"
              title="Cập nhật liên hệ"
              sub="Đảm bảo số điện thoại & Zalo hoạt động"
            />
            {storefrontUrl ? (
              <ActionTile
                href={storefrontUrl}
                icon="🌐"
                title="Xem storefront"
                sub="Mở trang công khai để kiểm tra trải nghiệm khách"
                external
              />
            ) : (
              <ActionTile
                href="/shop/settings"
                icon="🌐"
                title="Cài đặt storefront"
                sub="Hoàn thiện slug & trạng thái công khai để mở storefront"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
