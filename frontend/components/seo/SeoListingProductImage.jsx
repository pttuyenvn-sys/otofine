"use client";

import { productImageDimensionProps } from "@/lib/image/productImageDimensions";

/**
 * Ảnh card listing SEO — cần client vì xử lý onError (Server Component không cho event handler).
 */
export default function SeoListingProductImage({ src, alt, sizes }) {
  const dim = productImageDimensionProps({ src, layout: "square" });

  return (
    <img
      src={src}
      alt={alt || "Phụ tùng ô tô"}
      loading="lazy"
      decoding="async"
      sizes={sizes}
      {...dim}
      onError={(e) => {
        const img = e.currentTarget;
        img.onerror = null;
        img.style.opacity = "0";
        img.src = "/no-image.png";
        img.onload = () => {
          img.style.opacity = "1";
        };
      }}
    />
  );
}
