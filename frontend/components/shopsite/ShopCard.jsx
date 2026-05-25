"use client";

import { useEffect, useRef } from "react";
import ShopImage from "./ShopImage";
import {
  ShopsiteEvents,
  trackShopsiteEvent,
} from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Phase 7.1 — reusable shop card for the directory, related-shops,
 * and featured-shops surfaces.
 *
 * Single source of truth so the discovery experience stays consistent
 * across `/shops`, `/shops/[slug]` related sections, and future
 * homepage placements.
 *
 * Hierarchy (top → bottom):
 *   1. Cover image (16:9, lazy)  ←  always present, gradient fallback
 *   2. Avatar overlay (rounded-2xl)
 *   3. Trust pill row: "Đã xác minh"
 *   4. Name (2-line clamp)
 *   5. Province · product count (single line)
 *   6. Top brand chips (max 3, horizontally scrollable on mobile)
 *   7. Short intro (1-line clamp)
 *
 * Click target: apex /shops/<slug>. We deliberately do NOT link to
 * the subdomain here — apex is the canonical destination and the
 * middleware/nginx layer can take over on the click-through page if
 * the slug is on the rollout allowlist. Keeping the link apex-only
 * also avoids cross-host fetch cost on hover-prefetch.
 *
 * Analytics:
 *   - emits SHOP_CARD_CLICK on click
 *   - optionally emits STOREFRONT_IMPRESSION via IntersectionObserver
 *     when `trackImpression` is true (default off so RelatedShops
 *     doesn't double-track storefront visits already counted by
 *     ShopAnalyticsBoot)
 */
export default function ShopCard({
  shop,
  listSource = "directory",
  trackImpression = false,
  showRank = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!trackImpression || !shop?.slug) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const node = ref.current;
    if (!node) return;
    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        for (const e of entries) {
          if (e.isIntersecting) {
            fired = true;
            trackShopsiteEvent(ShopsiteEvents.STOREFRONT_IMPRESSION, {
              shopSlug: shop.slug,
              listSource,
              rank: showRank ? shop.rank?.score ?? null : null,
            });
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [shop?.slug, listSource, showRank, trackImpression, shop?.rank?.score]);

  if (!shop) return null;

  const href = `/shops/${encodeURIComponent(shop.slug)}`;

  const handleClick = () => {
    trackShopsiteEvent(ShopsiteEvents.SHOP_CARD_CLICK, {
      shopSlug: shop.slug,
      listSource,
      rank: showRank ? shop.rank?.score ?? null : null,
    });
  };

  return (
    <a
      ref={ref}
      href={href}
      onClick={handleClick}
      className="group relative flex flex-col rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden hover:border-[#e60012] hover:shadow-md transition-all"
    >
      <div className="relative aspect-[16/9] bg-gray-100 overflow-hidden">
        <ShopImage
          src={shop.cover || ""}
          alt={`Ảnh bìa ${shop.name || "shop"}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          fallbackClassName="h-full w-full"
        />
        {shop.verified && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-blue-50/95 text-blue-700 ring-1 ring-blue-200 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold shadow-sm">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Đã xác minh
          </span>
        )}
        {showRank && shop.rank && (
          <span
            className="absolute top-2 left-2 inline-flex items-center rounded-full bg-white/95 text-gray-700 ring-1 ring-gray-200 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold shadow-sm tabular-nums"
            title={`Điểm chất lượng ${shop.rank.score}/${shop.rank.max}`}
          >
            {shop.rank.score}
            <span className="text-gray-400">/{shop.rank.max}</span>
          </span>
        )}
      </div>

      <div className="relative px-3 pt-2 pb-3 flex-1 flex flex-col">
        {/* Avatar floating up over the cover/body seam */}
        <div className="absolute -top-7 left-3 w-12 h-12 rounded-2xl ring-2 ring-white bg-white shadow-sm overflow-hidden">
          <ShopImage
            src={shop.avatar || ""}
            alt={`Logo ${shop.name || "shop"}`}
            className="h-full w-full object-cover"
            fallbackClassName="h-full w-full"
          />
        </div>

        <div className="pl-[3.5rem] min-h-[2.5rem]">
          <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
            {shop.name}
          </h3>
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
          {shop.province && (
            <>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">{shop.province}</span>
            </>
          )}
          {shop.province && shop.productCount > 0 && (
            <span className="text-gray-300">•</span>
          )}
          {shop.productCount > 0 && (
            <span className="tabular-nums whitespace-nowrap">
              {formatProductCount(shop.productCount)} sản phẩm
            </span>
          )}
        </div>

        {shop.topBrands?.length > 0 && (
          <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
            {shop.topBrands.slice(0, 3).map((b) => (
              <span
                key={b.brand}
                className="shrink-0 inline-flex items-center text-[11px] text-gray-700 bg-gray-100 rounded-full px-2 py-0.5"
              >
                {b.brand}
              </span>
            ))}
          </div>
        )}

        {shop.shortIntro && (
          <p className="mt-2 text-[12px] text-gray-600 leading-snug line-clamp-1">
            {shop.shortIntro}
          </p>
        )}
      </div>
    </a>
  );
}

function formatProductCount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  if (x >= 1000) return `${(x / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(x);
}
