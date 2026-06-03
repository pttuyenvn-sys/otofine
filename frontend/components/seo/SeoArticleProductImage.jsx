"use client";

import ListingProductImage from "@/components/common/ListingProductImage";
import { inferListingImageSlot } from "@/lib/media/listingProductImageVariant";

/**
 * SEO article product image — direct CDN thumb (Phase 7A).
 */
export default function SeoArticleProductImage({
  src,
  alt = "",
  width,
  height,
  fill = false,
  className = "",
  priority = false,
  slot,
}) {
  const normalized = src && String(src).trim() ? String(src).trim() : "";
  if (!normalized) return null;

  const resolvedSlot =
    slot || inferListingImageSlot({ width, height, fill });

  return (
    <ListingProductImage
      slot={resolvedSlot}
      src={normalized}
      alt={alt}
      fill={fill}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
