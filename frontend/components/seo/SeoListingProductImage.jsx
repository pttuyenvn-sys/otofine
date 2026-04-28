"use client";

/**
 * Ảnh card listing SEO — cần client vì xử lý onError (Server Component không cho event handler).
 */
export default function SeoListingProductImage({ src, alt = "", sizes }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      sizes={sizes}
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
