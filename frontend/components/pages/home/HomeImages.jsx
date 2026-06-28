"use client";

import { productImageDimensionProps } from "@/lib/image/productImageDimensions";

const NO_IMAGE = "/no-image.png";

/** Cùng `images.qualities` trong `next.config.mjs` (Next.js 16+). */
export const IMAGE_QUALITY = 80;

export function ProductCardImage({
  src,
  alt,
  priority,
}) {
  const normalized =
    src && String(src).trim()
      ? String(src).trim()
      : NO_IMAGE;

  const dim = productImageDimensionProps({
    src: normalized,
    layout: "square",
  });

  return (
    <img
      src={normalized}
      alt={alt}
      className="product-image-next"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...dim}
    />
  );
}

/**
 * Ảnh sản phẩm trong lưới — fill trong `.product-image` (position: relative, aspect-ratio).
 */
export function SearchSuggestThumb({ src, alt = "" }) {
  const normalized =
    src && String(src).trim()
      ? String(src).trim()
      : "";

  if (!normalized) {
    return <span className="search-suggest-thumb search-suggest-thumb--empty" />;
  }

  const dim = productImageDimensionProps({
    src: normalized,
    layout: "thumb100",
  });

  return (
    <img
      src={normalized}
      alt={alt}
      className="search-suggest-thumb"
      loading="lazy"
      decoding="async"
      {...dim}
    />
  );
}
