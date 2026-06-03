"use client";

import { useEffect, useState } from "react";
import { LISTING_VIRTUAL_MIN_ITEMS } from "@/lib/listing/listingVirtualization";

/**
 * Phase 7H — SEO-safe virtualization gate.
 * First render (incl. RSC/SSR HTML) always returns `enabled: false`.
 * After hydration, windowing may activate when item count exceeds threshold.
 *
 * @param {number} itemCount
 * @param {{ minItems?: number }} [options]
 */
export function useSeoSafeClientVirtualization(
  itemCount,
  { minItems = LISTING_VIRTUAL_MIN_ITEMS } = {},
) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const enabled =
    hydrated && Number(itemCount) >= Math.max(1, Number(minItems) || 1);

  return { enabled, hydrated };
}
