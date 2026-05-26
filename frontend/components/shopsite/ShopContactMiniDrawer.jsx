"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Drawer = dynamic(() => import("./ShopContactMiniDrawerImpl"), {
  ssr: false,
  loading: () => null,
});

/**
 * Mount-once mobile contact drawer.
 *
 * Listens to the global `shopsite:openContactDrawer` CustomEvent so any
 * CTA in the storefront tree can open it without React context plumbing:
 *
 *   window.dispatchEvent(new CustomEvent("shopsite:openContactDrawer"))
 *
 * Drawer body is dynamically imported (no SSR weight) and only loads
 * the first time the buyer opens it. Until then the launcher pays
 * zero bytes.
 *
 * The drawer renders ALL contact channels (call / zalo / Maps /
 * Facebook / RFQ) so the buyer can pick the one they trust instead
 * of being shunted into a direct redirect. Each row preserves the
 * existing analytics events (PHONE_CLICK / ZALO_CLICK / etc.) so
 * the seller-side metrics stay accurate.
 */
export default function ShopContactMiniDrawer({ shop }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("shopsite:openContactDrawer", onOpen);
    return () => window.removeEventListener("shopsite:openContactDrawer", onOpen);
  }, []);

  if (!shop) return null;
  return (
    <Drawer open={open} onClose={() => setOpen(false)} shop={shop} />
  );
}
