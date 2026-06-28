"use client";

import { useEffect, useState } from "react";
import {
  readRecentlyViewed,
  excludeCurrent,
} from "@/lib/shopsite/recentlyViewed";
import { toThumb400 } from "@/lib/imageVariants";
import { productImageDimensionProps } from "@/lib/image/productImageDimensions";

/**
 * "Bạn vừa xem" — recently viewed products strip.
 *
 * Reads from the shared `recentlyViewed` localStorage helper that
 * `ProductDetail.jsx` populates on every visit. Renders a compact
 * horizontal scroller of the buyer's last 12 viewed products.
 *
 * SSR-safe: the component does NOTHING on the server (returns
 * `null`) and only paints once `useEffect` runs in the browser.
 * This avoids:
 *   - hydration mismatch (the SSR HTML cannot know what's in the
 *     user's localStorage)
 *   - cumulative layout shift before the strip mounts (we reserve
 *     a placeholder height during the brief "deciding" window so
 *     the page below doesn't jump if there ARE items to show)
 *
 * Filtering:
 *   - `excludeProductId` — drops the current product when the strip
 *     is rendered inside that product's detail page.
 *   - `onlyShopId` — when set, keeps only entries that belong to
 *     this shop (so the storefront strip stays on-brand and doesn't
 *     redirect the buyer to another seller). When unset the strip
 *     shows everything the buyer has viewed.
 *
 * Click target: each tile links to the canonical apex URL the
 * entry was written with (`/<slug>-<id>` if present, otherwise
 * `/p/<id>` which 308s to canonical in a single hop).
 */
export default function ShopRecentlyViewed({
  className = "",
  excludeProductId = null,
  onlyShopId = null,
  title = "Bạn vừa xem",
  compact = false,
  minItems = 1,
}) {
  const [items, setItems] = useState(null); // null = pre-mount, []|[…] = decided

  useEffect(() => {
    const arr = readRecentlyViewed();
    const filtered = excludeCurrent(arr, excludeProductId)
      .filter((x) => {
        if (!onlyShopId) return true;
        return String(x.shopId || "") === String(onlyShopId);
      })
      .slice(0, 12);
    const visible = filtered.slice(0, 12);
    if (!visible || visible.length < (minItems || 1)) {
      setItems([]);
    } else {
      setItems(visible);
    }
  }, [excludeProductId, onlyShopId, minItems]);

  // Pre-mount: render nothing (no placeholder either — we don't yet
  // know whether the strip will have content, so reserving height
  // would create a visible empty slot for users with no history).
  if (items === null) return null;
  if (items.length === 0) return null;

  const visible = compact ? items.slice(0, 5) : items.slice(0, 12);

  return (
    <section
      aria-label={title}
      className={`bg-white rounded-2xl shadow-sm p-2 sm:p-3 ${className}`}
    >
      <div className="flex items-end justify-between gap-3 mb-2 sm:mb-3">
        <h2 className="text-[14px] sm:text-[15px] font-bold text-gray-900 leading-tight">
          {title}
        </h2>
        <span className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {visible.length} sản phẩm
        </span>
      </div>
      <div className="-mx-1 px-1 flex gap-2 sm:gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar">
        {visible.map((it) => (
          <a
            key={`${it.id}`}
            href={buildHref(it)}
            rel="noopener"
            className={`snap-start shrink-0 ${compact ? 'w-[110px] sm:w-[140px]' : 'w-[44%] sm:w-[180px]'} flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-[#e60012] hover:shadow-md transition-all`}
          >
            <div className={`aspect-square ${compact ? 'bg-gray-50' : 'bg-gray-50'} overflow-hidden`}>
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={toThumb400(it.image) || it.image}
                  alt={it.title || ""}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                  {...productImageDimensionProps({
                    src: toThumb400(it.image) || it.image,
                    layout: "thumb400",
                  })}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200" />
              )}
            </div>
            <div className="p-2 flex-1 flex flex-col">
              <div className={`text-[12px] ${compact ? 'sm:text-[12px]' : 'sm:text-[13px]'} text-gray-900 leading-snug ${compact ? 'line-clamp-2 min-h-[2.5rem]' : 'line-clamp-2 min-h-[2rem]'}`}>
                {it.title || "Sản phẩm"}
              </div>
              {it.priceLabel && (
                <div className={`mt-1 ${compact ? 'text-[#d97706] font-semibold text-[12px]' : 'text-[#e60012] font-bold text-[13px] sm:text-sm'} tabular-nums`}>
                  {it.priceLabel}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function buildHref(it) {
  if (!it || it.id == null) return "/";
  // The persisted `slug` from ProductDetail is the DB shop slug, NOT
  // the canonical SEO slug suffix. We always link via `/p/<id>` which
  // 308-redirects to the canonical SEO URL in a single hop — this is
  // the same fallback `buildProductSeoUrl` uses when called without a
  // full product DTO and keeps us 1) correct, 2) chain-free.
  return `/p/${it.id}`;
}
