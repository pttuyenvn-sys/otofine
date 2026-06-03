"use client";

import { memo } from "react";
import AppImage from "@/components/common/AppImage";
import {
  inferListingImageSlot,
  LISTING_COMPACT_SLOT_MAX_PX,
  LISTING_IMAGE_BREAKPOINT_PX,
  LISTING_MOBILE_RENDER_WIDTH_PX,
  useListingImageVariant,
} from "@/lib/media/listingProductImageVariant";

/**
 * Phase 7A — direct CDN delivery for listing/grid product thumbnails.
 * Phase 7A.1 — shared viewport hook (one listener per page, not per card).
 */
function ListingProductImageComponent({
  src,
  alt = "",
  slot,
  fill = false,
  width,
  height,
  priority = false,
  className = "",
  emptyFallback,
  sizes: sizesProp,
  ...rest
}) {
  const resolvedSlot =
    slot || inferListingImageSlot({ width, height, fill });
  const variant = useListingImageVariant(resolvedSlot);
  const sizes =
    sizesProp ??
    (resolvedSlot === "grid"
      ? `(max-width: ${LISTING_IMAGE_BREAKPOINT_PX}px) ${LISTING_MOBILE_RENDER_WIDTH_PX}px, 400px`
      : resolvedSlot === "compact"
        ? `${LISTING_COMPACT_SLOT_MAX_PX}px`
        : "400px");

  return (
    <AppImage
      mode="img"
      src={src}
      variant={variant}
      allowOriginalFallback={false}
      fill={fill}
      width={width}
      height={height}
      sizes={sizes}
      alt={alt}
      priority={priority}
      className={className}
      emptyFallback={emptyFallback}
      {...rest}
    />
  );
}

function listingImagePropsAreEqual(prev, next) {
  return (
    prev.src === next.src &&
    prev.alt === next.alt &&
    prev.slot === next.slot &&
    prev.fill === next.fill &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.priority === next.priority &&
    prev.className === next.className &&
    prev.emptyFallback === next.emptyFallback
  );
}

const ListingProductImage = memo(
  ListingProductImageComponent,
  listingImagePropsAreEqual,
);

export default ListingProductImage;
