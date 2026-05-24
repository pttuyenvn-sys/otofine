"use client";

import { useEffect, useRef } from "react";
import { ShopsiteEvents, trackShopsiteEvent } from "@/lib/shopsite/shopsiteAnalytics";

/**
 * Fires a single `storefront_view` analytics event when the storefront
 * mounts in the browser. Lives at the layout level so it covers all
 * four storefront tabs (home / san-pham / gioi-thieu / lien-he).
 *
 * Renders nothing. The `useRef` guard prevents the React strict-mode
 * double-mount in development from inflating the event count.
 *
 * Why a dedicated mount component rather than inlining in layout.js?
 * `app/(shopsite)/shops/[slug]/layout.js` is a server component (it
 * needs `next/headers` + `notFound()`). We need a `use client` island
 * to run anything on `useEffect`.
 */
export default function ShopAnalyticsBoot({ shopSlug, shopName }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackShopsiteEvent(ShopsiteEvents.STOREFRONT_VIEW, { shopSlug, shopName });
  }, [shopSlug, shopName]);
  return null;
}
