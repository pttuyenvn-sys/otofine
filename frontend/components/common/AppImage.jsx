"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getProductImageFallbackChain,
  PRODUCT_IMAGE_PLACEHOLDER,
  PRODUCT_IMAGE_VARIANT,
} from "@/lib/media/productMediaUrl";
import {
  recordProductBrokenUrl,
  recordProductImageError,
  recordProductImageFallback,
  recordProductOriginalFallback,
} from "@/lib/media/productMediaMetrics";

/**
 * Central product image renderer.
 *
 * Fallback chain (via getProductImageFallbackChain):
 * - thumb + allowOriginalFallback: thumb → original R2 → placeholder
 * - thumb + listing (default): thumb → placeholder only
 * - original variant: original → placeholder
 */
export default function AppImage({
  src,
  variant = PRODUCT_IMAGE_VARIANT.ORIGINAL,
  alt = "",
  className = "",
  mode = "img",
  width,
  height,
  fill = false,
  sizes,
  quality = 80,
  priority = false,
  placeholder = PRODUCT_IMAGE_PLACEHOLDER,
  fallbackSrcs = [],
  /** When `src` is empty: `undefined` → show placeholder; `null` → render nothing. */
  emptyFallback,
  allowOriginalFallback = false,
  onError: onErrorProp,
  ...rest
}) {
  const hasSrc = Boolean(src && String(src).trim());
  const normalizedSrc = hasSrc ? String(src).trim() : "";

  const chain = useMemo(() => {
    const base = getProductImageFallbackChain(normalizedSrc, variant, {
      allowOriginalFallback,
    });
    const extra = (Array.isArray(fallbackSrcs) ? fallbackSrcs : [])
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    const merged = [...base];
    for (const url of extra) {
      if (!merged.includes(url)) merged.push(url);
    }
    const ph = placeholder || PRODUCT_IMAGE_PLACEHOLDER;
    if (ph && !merged.includes(ph)) merged.push(ph);
    return merged.filter(Boolean);
  }, [normalizedSrc, variant, allowOriginalFallback, fallbackSrcs, placeholder]);

  const [currentSrcIndex, setCurrentSrcIndex] = useState(0);

  useEffect(() => {
    setCurrentSrcIndex(0);
  }, [normalizedSrc, variant, allowOriginalFallback, chain.join("|")]);

  const currentSrc = chain[currentSrcIndex] || placeholder || PRODUCT_IMAGE_PLACEHOLDER;
  const atFinalFallback =
    currentSrcIndex >= chain.length - 1 ||
    currentSrc === placeholder ||
    currentSrc === PRODUCT_IMAGE_PLACEHOLDER;

  const handleError = useCallback(
    (event) => {
      recordProductImageError();
      onErrorProp?.(event);

      const failedUrl = chain[currentSrcIndex];
      const nextIndex = currentSrcIndex + 1;

      if (nextIndex < chain.length) {
        recordProductImageFallback();
        const nextUrl = chain[nextIndex];
        const original = normalizedSrc.split("?")[0];
        if (
          allowOriginalFallback &&
          nextUrl &&
          nextUrl !== placeholder &&
          nextUrl !== PRODUCT_IMAGE_PLACEHOLDER &&
          !nextUrl.includes("thumb_100_") &&
          !nextUrl.includes("thumb_400_") &&
          (nextUrl === original || nextUrl.startsWith(original.split("/").slice(0, -1).join("/")))
        ) {
          recordProductOriginalFallback();
        }
        setCurrentSrcIndex(nextIndex);
        return;
      }

      recordProductBrokenUrl();
      if (event?.currentTarget) {
        event.currentTarget.onerror = null;
      }
    },
    [
      allowOriginalFallback,
      chain,
      currentSrcIndex,
      normalizedSrc,
      onErrorProp,
      placeholder,
    ],
  );

  if (!hasSrc) {
    if (emptyFallback === null) return null;
    if (emptyFallback !== undefined) return emptyFallback;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={placeholder || PRODUCT_IMAGE_PLACEHOLDER}
        alt={alt}
        className={className}
        width={width}
        height={height}
        {...rest}
      />
    );
  }

  const imageKey = `${currentSrc}|${currentSrcIndex}`;

  if (mode === "next") {
    const nextProps = {
      src: currentSrc,
      alt,
      className,
      quality,
      priority,
      sizes,
      onError: handleError,
      ...rest,
    };

    if (fill) {
      return <Image key={imageKey} fill {...nextProps} />;
    }

    return (
      <Image
        key={imageKey}
        width={width || 100}
        height={height || 100}
        {...nextProps}
      />
    );
  }

  const imgClassName = fill
    ? [className, "absolute inset-0 h-full w-full object-cover"]
        .filter(Boolean)
        .join(" ")
    : className;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={imageKey}
      src={currentSrc}
      alt={alt}
      className={imgClassName}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" } : {})}
      onError={atFinalFallback ? undefined : handleError}
      {...rest}
    />
  );
}
