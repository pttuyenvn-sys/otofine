"use client";

import { useEffect, useRef, useState } from "react";
import { productImageDimensionProps } from "@/lib/image/productImageDimensions";

/**
 * Storefront image with graceful broken-src fallback.
 *
 * Why a dedicated component:
 *   - Many storefronts will load their avatar / cover from R2 with
 *     dynamic seller-managed URLs. A typo, a 404, or a CDN warm-cache
 *     blip would otherwise leave a broken-icon hole in the layout.
 *   - When the seller hasn't uploaded an image yet we want a clean,
 *     branded placeholder — not Chrome's grey square.
 *
 * Strategy:
 *   - render the real <img> when a non-empty `src` is provided
 *   - on `onError`, swap to the `fallback` slot (defaults to the
 *     gradient skeleton). The state flip is final — we never retry,
 *     because retries amplify a real outage.
 *   - keep `loading="lazy"` and `decoding="async"` defaults so the
 *     non-LCP positions don't fight for the main thread
 *   - allow callers to opt INTO `loading="eager"` + `fetchpriority="high"`
 *     for the LCP element (cover image)
 *
 * SSR contract:
 *   - We `use client` because of useState, but the markup tree is
 *     identical between server-rendered HTML and hydrated DOM — no
 *     hydration mismatch.
 *   - When `src` is empty on the server, the fallback ships in SSR
 *     and the layout is correct on first paint.
 */
export default function ShopImage({
  src,
  alt,
  className = "",
  fallbackClassName = "",
  fallback = null,
  fallbackSrc = null,
  priority = false,
  dimensionLayout = null,
  ...rest
}) {
  const [errored, setErrored] = useState(false);
  const [fallbackErrored, setFallbackErrored] = useState(false);
  const imgRef = useRef(null);

  // Post-mount recovery for the "SSR'd <img> 404'd before React
  // attached its onError" case. The browser fires the error event
  // before hydration, then React adds the handler too late to
  // see it. We detect the situation via `complete && !naturalWidth`
  // and flip to the fallback tier without waiting for a second error.
  useEffect(() => {
    const node = imgRef.current;
    if (!node) return;
    function check() {
      if (!node) return;
      if (node.complete && node.naturalWidth === 0) {
        if (!errored) setErrored(true);
        else if (fallbackSrc && !fallbackErrored) setFallbackErrored(true);
      }
    }
    check();
    node.addEventListener("load", check);
    return () => node.removeEventListener("load", check);
  }, [src, fallbackSrc, errored, fallbackErrored]);

  // Three-tier strategy:
  //   1. Try `src` (seller-provided / resolver-picked URL).
  //   2. On error, if `fallbackSrc` is set, swap to that <img src>
  //      and try once more. This lets callers ship a curated
  //      "guaranteed-good" URL behind a potentially flaky primary
  //      source (e.g. seller pasted an intro image URL that 404'd
  //      after they replaced their host).
  //   3. If `fallbackSrc` also fails (or isn't provided) AND a
  //      placeholder slot exists, render the gradient placeholder.
  const showPlaceholder =
    (!src && !fallbackSrc) ||
    (errored && (!fallbackSrc || fallbackErrored));

  if (showPlaceholder) {
    return (
      <div
        aria-hidden={alt ? undefined : true}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={`flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400 text-xs ${fallbackClassName || className}`}
      >
        {fallback ?? <span>Không có ảnh</span>}
      </div>
    );
  }

  const activeSrc = errored && fallbackSrc ? fallbackSrc : src || fallbackSrc;
  const onFallbackTier = errored && fallbackSrc;
  const dim = productImageDimensionProps({
    src: activeSrc,
    layout: dimensionLayout,
  });

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={activeSrc}
      alt={alt || ""}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" } : {})}
      {...dim}
      onError={(e) => {
        // Detach the error handler so an attacker can't intentionally
        // re-trigger a render loop by feeding a broken src that
        // resolves differently on retry.
        e.currentTarget.onerror = null;
        if (onFallbackTier) {
          setFallbackErrored(true);
        } else {
          setErrored(true);
        }
        if (typeof window !== "undefined") {
          // Lightweight observability — dashboards can listen for this
          // CustomEvent (same bus as `shopsiteAnalytics`).
          try {
            window.dispatchEvent(
              new CustomEvent("shopsite:event", {
                detail: {
                  type: "image_fallback",
                  src: activeSrc,
                  tier: onFallbackTier ? "fallback" : "primary",
                  ts: Date.now(),
                },
              }),
            );
          } catch {/* old WebView */}
        }
      }}
      {...rest}
    />
  );
}
