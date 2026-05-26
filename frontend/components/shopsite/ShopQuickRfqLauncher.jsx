"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Defer the modal bundle (axios + RFQ create POST + portal) until
// the first time the user actually opens it. Saves ~6 KB of hydrate
// payload on first paint, and the modal is only ever opened on
// explicit user intent (floating button or product-card CTA), so
// the deferred load is invisible.
const ShopQuickRfqModal = dynamic(() => import("./ShopQuickRfqModal"), {
  ssr: false,
  loading: () => null,
});

/**
 * Floating "Tìm phụ tùng nhanh" launcher.
 *
 * Behaviour:
 *   - Desktop: fixed pill button bottom-right (above the page edge).
 *   - Mobile: hidden by default because `ShopFloatingMobileCTA`
 *     already exposes the same "Tìm phụ tùng" CTA in the floating
 *     bottom bar. Showing both would create a CTA collision.
 *   - Hides on scroll-DOWN, returns on scroll-UP — same pattern as
 *     the floating bottom CTA so the two never fight for attention.
 *
 * The button never navigates — it opens an in-place compact RFQ
 * modal (`ShopQuickRfqModal`). The modal posts to the existing
 * `POST /api/rfq/create` endpoint and then redirects the user to
 * `/rfq/success` for OTP confirmation.
 */
export default function ShopQuickRfqLauncher({ shop, hideButton = false }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [prefill, setPrefill] = useState({ source: "floating_launcher" });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let lastY = window.scrollY || 0;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const delta = y - lastY;
        if (y < 200) setVisible(true);
        else if (delta > 10) setVisible(false);
        else if (delta < -6) setVisible(true);
        lastY = y;
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Cross-component opener — product cards (and any future trust
    // chip / "Hỏi nhanh" link) dispatch `shopsite:openQuickRfq` with
    // a `detail` payload that pre-fills the modal. Keeps the modal
    // single-mounted at the page level while letting many spawn
    // points trigger it without React context plumbing.
    if (typeof window === "undefined") return undefined;
    function onOpen(ev) {
      const next = ev?.detail || {};
      setPrefill({
        source: next.source || "external",
        part: next.part || "",
        vehicle: next.vehicle || "",
        brand: next.brand || "",
        model: next.model || "",
        year: next.year || "",
        productId: next.productId || null,
      });
      setOpen(true);
      // Ack pattern — listeners (e.g. the product-detail page on apex)
      // can fall back to navigating to /rfq/new when no launcher is
      // mounted. The ack confirms we DID open the in-place modal.
      try {
        window.dispatchEvent(new CustomEvent("shopsite:openQuickRfq:ack"));
      } catch {/* old WebView */}
    }
    window.addEventListener("shopsite:openQuickRfq", onOpen);
    return () => window.removeEventListener("shopsite:openQuickRfq", onOpen);
  }, []);

  return (
    <div data-shopsite-rfq-mount>
      {!hideButton && (
        <button
          type="button"
          onClick={() => {
            setPrefill({ source: "floating_launcher" });
            setOpen(true);
          }}
          aria-label="Tìm phụ tùng nhanh"
          className={`hidden sm:inline-flex fixed right-5 bottom-5 z-40 items-center gap-2 rounded-full bg-[#e60012] hover:bg-[#c1000f] text-white text-sm font-bold px-4 py-3 shadow-xl ring-2 ring-white/40 transition-all duration-200 ${visible ? "translate-y-0 opacity-100" : "translate-y-[140%] opacity-0"}`}
        >
          <span aria-hidden>📦</span>
          Tìm phụ tùng nhanh
        </button>
      )}
      <ShopQuickRfqModal
        open={open}
        onClose={() => setOpen(false)}
        shop={shop}
        prefill={prefill}
      />
    </div>
  );
}
