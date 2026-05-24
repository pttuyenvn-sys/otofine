"use client";

import { useState } from "react";

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
  priority = false,
  ...rest
}) {
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;

  if (showFallback) {
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

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ""}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" } : {})}
      onError={(e) => {
        // Detach the error handler so an attacker can't intentionally
        // re-trigger a render loop by feeding a broken src that
        // resolves differently on retry.
        e.currentTarget.onerror = null;
        setErrored(true);
        if (typeof window !== "undefined") {
          // Lightweight observability — dashboards can listen for this
          // CustomEvent (same bus as `shopsiteAnalytics`).
          try {
            window.dispatchEvent(
              new CustomEvent("shopsite:event", {
                detail: { type: "image_fallback", src, ts: Date.now() },
              }),
            );
          } catch {/* old WebView */}
        }
      }}
      {...rest}
    />
  );
}
