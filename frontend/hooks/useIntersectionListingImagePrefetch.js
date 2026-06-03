"use client";

import { useEffect, useMemo } from "react";
import {
  enqueueListingImagePrefetch,
  LISTING_IMAGE_PREFETCH_ROOT_MARGIN,
} from "@/lib/listing/listingImagePrefetch";

/**
 * Prefetch listing thumb URLs when a sentinel nears the viewport.
 *
 * @param {React.RefObject<Element|null>} triggerRef
 * @param {string[]} urls — next N card image URLs (already resolved)
 * @param {{ enabled?: boolean, rootMargin?: string }} [options]
 */
export function useIntersectionListingImagePrefetch(
  triggerRef,
  urls,
  { enabled = true, rootMargin = LISTING_IMAGE_PREFETCH_ROOT_MARGIN } = {},
) {
  const urlsKey = useMemo(() => urls.join("\0"), [urls]);

  useEffect(() => {
    if (!enabled || !urls.length) return undefined;

    const el = triggerRef.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          enqueueListingImagePrefetch(urls);
        }
      },
      { root: null, rootMargin, threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggerRef, urlsKey, enabled, rootMargin, urls]);
}
