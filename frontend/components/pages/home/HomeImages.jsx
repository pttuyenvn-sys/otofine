"use client";

import { memo } from "react";
import ListingProductImage from "@/components/common/ListingProductImage";

/**
 * Ảnh sản phẩm trong lưới — direct CDN thumb, fill trong `.product-image`.
 */
function ProductCardImageComponent({ src, alt, priority }) {
  const normalized = src && String(src).trim() ? String(src).trim() : "";

  return (
    <ListingProductImage
      slot="grid"
      fill
      src={normalized || null}
      alt={alt}
      priority={Boolean(priority)}
      className="product-image-next"
    />
  );
}

export const ProductCardImage = memo(ProductCardImageComponent);

/**
 * Thumbnail gợi ý tìm kiếm — kích thước cố định 40×40 (CSS `.search-suggest-thumb`).
 */
function SearchSuggestThumbComponent({ src }) {
  const normalized = src && String(src).trim() ? String(src).trim() : "";

  if (!normalized) {
    return <span className="search-suggest-thumb search-suggest-thumb--empty" />;
  }

  return (
    <ListingProductImage
      slot="compact"
      src={normalized}
      width={40}
      height={40}
      alt=""
      className="search-suggest-thumb"
    />
  );
}

export const SearchSuggestThumb = memo(SearchSuggestThumbComponent);
