"use client";

import ListingProductImage from "@/components/common/ListingProductImage";

/**
 * SEO listing card image — direct CDN thumb (Phase 7A).
 */
export default function SeoListingProductImage({
  src,
  alt = "",
}) {
  const normalized = src && String(src).trim() ? String(src).trim() : "";

  if (!normalized) return null;

  return (
    <ListingProductImage
      slot="grid"
      fill
      src={normalized}
      alt={alt}
    />
  );
}
