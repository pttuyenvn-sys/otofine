"use client";

import { useMemo, useRef } from "react";
import { HomeProductCard } from "@/components/pages/home/HomeProductCard";
import { useIntersectionListingImagePrefetch } from "@/hooks/useIntersectionListingImagePrefetch";
import { useSeoSafeClientVirtualization } from "@/hooks/useSeoSafeClientVirtualization";
import { useVirtualListRange } from "@/hooks/useVirtualListRange";
import { LISTING_IMAGE_PREFETCH_AHEAD } from "@/lib/listing/listingImagePrefetch";
import { collectListingPrefetchUrls } from "@/lib/listing/resolveListingPrefetchUrls";
import {
  LISTING_VIRTUAL_LIST_GAP_PX,
  LISTING_VIRTUAL_LIST_ROW_PX,
} from "@/lib/listing/listingVirtualization";

/**
 * Phase 7H — marketplace home product list.
 * Phase 7I — IntersectionObserver prefetch for cards just below the window.
 * SSR/first paint: all cards (SEO + crawlable links).
 * After hydration: window-scroll virtualization with overscan.
 */
export default function HomeProductList({
  products,
  onSelectPhone,
  onBeforeProductNavigate,
  marketplaceContext = null,
}) {
  const count = products?.length || 0;
  const sentinelRef = useRef(null);
  const { enabled: virtualize } = useSeoSafeClientVirtualization(count);
  const { listRef, start, end, paddingTop, paddingBottom } = useVirtualListRange({
    count,
    enabled: virtualize,
    estimateSize: LISTING_VIRTUAL_LIST_ROW_PX,
    gap: LISTING_VIRTUAL_LIST_GAP_PX,
  });

  const slice = virtualize ? products.slice(start, end) : products;

  const prefetchUrls = useMemo(
    () =>
      collectListingPrefetchUrls(
        products,
        end,
        LISTING_IMAGE_PREFETCH_AHEAD,
        "grid",
      ),
    [products, end],
  );

  useIntersectionListingImagePrefetch(sentinelRef, prefetchUrls, {
    enabled: virtualize && prefetchUrls.length > 0,
  });

  return (
    <div className="center of-product-list" ref={listRef}>
      {virtualize && paddingTop > 0 ? (
        <div aria-hidden="true" className="of-product-list__vpad" style={{ height: paddingTop }} />
      ) : null}
      {slice.map((item, i) => (
        <HomeProductCard
          key={item.id}
          item={item}
          index={virtualize ? start + i : i}
          onSelectPhone={onSelectPhone}
          onBeforeNavigate={onBeforeProductNavigate}
          marketplaceContext={marketplaceContext}
        />
      ))}
      {virtualize ? (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          className="listing-image-prefetch-sentinel"
          style={{ height: 1, width: "100%", pointerEvents: "none" }}
        />
      ) : null}
      {virtualize && paddingBottom > 0 ? (
        <div aria-hidden="true" className="of-product-list__vpad" style={{ height: paddingBottom }} />
      ) : null}
    </div>
  );
}
