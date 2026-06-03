"use client";

import { useEffect, useRef, useState } from "react";
import { LISTING_VIRTUAL_OVERSCAN } from "@/lib/listing/listingVirtualization";

/**
 * Window-scroll virtual range for a vertical list container.
 *
 * @param {object} opts
 * @param {number} opts.count
 * @param {boolean} opts.enabled
 * @param {number} [opts.estimateSize]
 * @param {number} [opts.gap]
 * @param {number} [opts.overscan]
 */
export function useVirtualListRange({
  count,
  enabled,
  estimateSize,
  gap = 0,
  overscan = LISTING_VIRTUAL_OVERSCAN,
}) {
  const listRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: count });

  useEffect(() => {
    if (!enabled || count <= 0) {
      setRange({ start: 0, end: count });
      return;
    }

    const stride = estimateSize + gap;

    const update = () => {
      const el = listRef.current;
      if (!el) return;

      const listTop = el.getBoundingClientRect().top + window.scrollY;
      const viewTop = window.scrollY;
      const viewBottom = viewTop + window.innerHeight;

      const rawStart = Math.floor((viewTop - listTop) / stride);
      const rawEnd = Math.ceil((viewBottom - listTop) / stride);

      setRange({
        start: Math.max(0, rawStart - overscan),
        end: Math.min(count, rawEnd + overscan),
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled, count, estimateSize, gap, overscan]);

  const start = enabled ? range.start : 0;
  const end = enabled ? range.end : count;
  const stride = estimateSize + gap;
  const paddingTop = enabled ? start * stride : 0;
  const paddingBottom = enabled ? Math.max(0, (count - end) * stride) : 0;

  return { listRef, start, end, paddingTop, paddingBottom };
}
