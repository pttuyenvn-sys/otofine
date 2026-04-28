"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const NO_IMAGE = "/no-image.png";

/** Cùng `images.qualities` trong `next.config.mjs` (Next.js 16+). */
export const IMAGE_QUALITY = 80;
const SUGGEST_THUMB_QUALITY = 75;

/**
 * Ảnh sản phẩm trong lưới — fill trong `.product-image` (position: relative, aspect-ratio).
 */
export function ProductCardImage({ src, alt, sizes, priority }) {
  const normalized = src && String(src).trim() ? String(src).trim() : "";
  const [current, setCurrent] = useState(normalized || NO_IMAGE);

  useEffect(() => {
    setCurrent(normalized || NO_IMAGE);
  }, [normalized]);

  return (
    <Image
      fill
      src={current}
      alt={alt}
      sizes={sizes}
      priority={Boolean(priority)}
      quality={IMAGE_QUALITY}
      className="product-image-next"
      onError={() => {
        if (current !== NO_IMAGE) setCurrent(NO_IMAGE);
      }}
    />
  );
}

/**
 * Thumbnail gợi ý tìm kiếm — kích thước cố định 40×40 (CSS `.search-suggest-thumb`).
 */
export function SearchSuggestThumb({ src }) {
  const normalized = src && String(src).trim() ? String(src).trim() : "";
  const [current, setCurrent] = useState(normalized);

  useEffect(() => {
    setCurrent(normalized);
  }, [normalized]);

  if (!current) {
    return <span className="search-suggest-thumb search-suggest-thumb--empty" />;
  }

  return (
    <Image
      width={40}
      height={40}
      src={current}
      alt=""
      className="search-suggest-thumb"
      loading="lazy"
      quality={SUGGEST_THUMB_QUALITY}
      onError={() => setCurrent(NO_IMAGE)}
    />
  );
}
