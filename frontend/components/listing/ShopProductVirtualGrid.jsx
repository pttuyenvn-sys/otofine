"use client";

import { useMemo, useRef } from "react";
import ShopProductCard from "@/components/shopsite/ShopProductCard";
import { useIntersectionListingImagePrefetch } from "@/hooks/useIntersectionListingImagePrefetch";
import { useListingGridColumns } from "@/hooks/useListingGridColumns";
import { useSeoSafeClientVirtualization } from "@/hooks/useSeoSafeClientVirtualization";
import { useVirtualGridRange } from "@/hooks/useVirtualGridRange";
import { LISTING_IMAGE_PREFETCH_AHEAD } from "@/lib/listing/listingImagePrefetch";
import { collectListingPrefetchUrls } from "@/lib/listing/resolveListingPrefetchUrls";
import {
  LISTING_VIRTUAL_GRID_GAP_PX,
  LISTING_VIRTUAL_GRID_ROW_PX,
} from "@/lib/listing/listingVirtualization";

const GRID_CLASS =
  "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3";

/**
 * Phase 7H — storefront `/san-pham` grid.
 * SSR/first paint: full grid HTML for crawlers.
 * After hydration: row windowing with overscan on long pages.
 */
export default function ShopProductVirtualGrid({
  items,
  shopSlug,
  shopPhone,
}) {
  const count = items?.length || 0;
  const columns = useListingGridColumns();
  const sentinelRef = useRef(null);
  const rowCount = Math.max(0, Math.ceil(count / columns));
  const { enabled: virtualize } = useSeoSafeClientVirtualization(count);
  const { containerRef, startRow, endRow, paddingTop, paddingBottom } =
    useVirtualGridRange({
      rowCount,
      enabled: virtualize,
      rowHeight: LISTING_VIRTUAL_GRID_ROW_PX,
      rowGap: LISTING_VIRTUAL_GRID_GAP_PX,
    });

  const prefetchFromIndex = endRow * columns;
  const prefetchUrls = useMemo(
    () =>
      collectListingPrefetchUrls(
        items,
        prefetchFromIndex,
        LISTING_IMAGE_PREFETCH_AHEAD,
        "grid",
      ),
    [items, prefetchFromIndex, columns],
  );

  useIntersectionListingImagePrefetch(sentinelRef, prefetchUrls, {
    enabled: virtualize && prefetchUrls.length > 0,
  });

  if (!virtualize) {
    return (
      <div className={GRID_CLASS}>
        {items.map((product, idx) => (
          <ShopProductCard
            key={product.id}
            product={product}
            shopSlug={shopSlug}
            shopPhone={shopPhone}
            priority={idx < 3}
          />
        ))}
      </div>
    );
  }

  const rows = [];
  for (let row = startRow; row < endRow; row += 1) {
    const from = row * columns;
    const rowItems = items.slice(from, from + columns);
    if (!rowItems.length) continue;
    rows.push(
      <div key={`vrow-${row}`} className={GRID_CLASS}>
        {rowItems.map((product, idxInRow) => (
          <ShopProductCard
            key={product.id}
            product={product}
            shopSlug={shopSlug}
            shopPhone={shopPhone}
            priority={from + idxInRow < 3}
          />
        ))}
      </div>,
    );
  }

  return (
    <div ref={containerRef} className="shop-product-virtual-grid">
      {paddingTop > 0 ? (
        <div aria-hidden="true" style={{ height: paddingTop }} />
      ) : null}
      <div className="flex flex-col gap-2 sm:gap-3">{rows}</div>
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="listing-image-prefetch-sentinel"
        style={{ height: 1, width: "100%", pointerEvents: "none" }}
      />
      {paddingBottom > 0 ? (
        <div aria-hidden="true" style={{ height: paddingBottom }} />
      ) : null}
    </div>
  );
}
