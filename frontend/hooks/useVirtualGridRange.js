"use client";

import { useEffect, useRef, useState } from "react";
import { LISTING_VIRTUAL_OVERSCAN } from "@/lib/listing/listingVirtualization";

/**
 * Window-scroll virtual range by grid row index.
 *
 * @param {object} opts
 * @param {number} opts.rowCount
 * @param {boolean} opts.enabled
 * @param {number} opts.rowHeight
 * @param {number} [opts.rowGap]
 * @param {number} [opts.overscan]
 */
export function useVirtualGridRange({
  rowCount,
  enabled,
  rowHeight,
  rowGap = 0,
  overscan = LISTING_VIRTUAL_OVERSCAN,
}) {
  const containerRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: rowCount });

  useEffect(() => {
    if (!enabled || rowCount <= 0) {
      setRange({ start: 0, end: rowCount });
      return;
    }

    const stride = rowHeight + rowGap;

    const update = () => {
      const el = containerRef.current;
      if (!el) return;

      const top = el.getBoundingClientRect().top + window.scrollY;
      const viewTop = window.scrollY;
      const viewBottom = viewTop + window.innerHeight;

      const rawStart = Math.floor((viewTop - top) / stride);
      const rawEnd = Math.ceil((viewBottom - top) / stride);

      setRange({
        start: Math.max(0, rawStart - overscan),
        end: Math.min(rowCount, rawEnd + overscan),
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled, rowCount, rowHeight, rowGap, overscan]);

  const startRow = enabled ? range.start : 0;
  const endRow = enabled ? range.end : rowCount;
  const stride = rowHeight + rowGap;
  const paddingTop = enabled ? startRow * stride : 0;
  const paddingBottom = enabled ? Math.max(0, (rowCount - endRow) * stride) : 0;

  return { containerRef, startRow, endRow, paddingTop, paddingBottom };
}
