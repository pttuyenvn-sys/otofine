"use client";

import { useEffect } from "react";
import { API_BASE } from "@/lib/config";

/**
 * Bridges the in-app `window` "shopsite:event" CustomEvent bus to the
 * backend ingest endpoint `/api/storefront-events/track`.
 *
 * Why a separate forwarder (not built into `shopsiteAnalytics.js`)?
 *   - The analytics bus is intentionally network-free and dep-free.
 *     Anything that touches `fetch` or `axios` belongs in a client
 *     island that we can mount/unmount independently.
 *   - SSR-safe: the bus emits in the browser only, and this island
 *     subscribes in `useEffect` so the server build is untouched.
 *   - Defensive: every network call is fire-and-forget. A 5xx, an
 *     adblocker swallowing the POST, or a CSP block must NEVER stop
 *     a CTA click or product card navigation. We pass `keepalive`
 *     so the browser still flushes the request on page unload.
 *
 * Rate-control:
 *   - The client de-dupes by (type + key) inside a short rolling
 *     window so a buyer who taps "Gọi ngay" 3× in 200ms only ships
 *     one event. Real bursts go through; spurious double-fires
 *     don't pollute the seller dashboard.
 *   - The backend has its own per-IP cap; the client cap is just
 *     a courtesy.
 */

const ALLOWED_TYPES = new Set([
  "storefront_view",
  "product_click",
  "phone_click",
  "zalo_click",
  "facebook_click",
  "share_click",
  "share_complete",
  "share_copy",
  "rfq_cta_click",
]);

const DEDUPE_WINDOW_MS = 800;

export default function StorefrontAnalyticsForwarder({ shopSlug }) {
  useEffect(() => {
    if (typeof window === "undefined" || !shopSlug) return undefined;

    const recent = new Map();

    function shouldShip(type, key) {
      const k = `${type}|${key}`;
      const now = Date.now();
      const seen = recent.get(k);
      if (seen && now - seen < DEDUPE_WINDOW_MS) return false;
      recent.set(k, now);
      // Cheap-and-cheerful GC so the map doesn't grow forever in
      // a single-page-app navigation.
      if (recent.size > 64) {
        for (const [mk, ts] of recent) {
          if (now - ts > DEDUPE_WINDOW_MS * 4) recent.delete(mk);
        }
      }
      return true;
    }

    function ship(type, detail) {
      const body = {
        shopSlug,
        type,
        metadata: detail && typeof detail === "object" ? buildMetadata(detail) : null,
      };
      try {
        const url = `${API_BASE}/storefront-events/track`;
        // `fetch` over `navigator.sendBeacon` keeps us compatible
        // with the Content-Type contract the backend expects.
        fetch(url, {
          method: "POST",
          credentials: "omit",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {
          /* swallow — analytics must not affect UX */
        });
      } catch {
        /* swallow */
      }
    }

    function onEvent(e) {
      const detail = e?.detail;
      if (!detail || typeof detail !== "object") return;
      const type = String(detail.type || "");
      if (!ALLOWED_TYPES.has(type)) return;
      // Per-type "key" for dedupe — products use productId, others
      // use page path. Falsy → empty string so equal events still
      // collapse within the window.
      const key = String(detail.productId || detail.shopSlug || detail.page || "");
      if (!shouldShip(type, key)) return;
      ship(type, detail);
    }

    window.addEventListener("shopsite:event", onEvent);
    return () => {
      window.removeEventListener("shopsite:event", onEvent);
    };
  }, [shopSlug]);

  return null;
}

/**
 * Pull a small, stable subset of the in-app event payload into the
 * server-stored metadata. Stripped to keep the JSON column tight and
 * avoid persisting churny browser fields (UA, ts, etc.).
 */
function buildMetadata(detail) {
  const out = {};
  if (typeof detail.productId === "number") out.productId = detail.productId;
  if (typeof detail.productId === "string" && detail.productId) out.productId = detail.productId;
  if (typeof detail.page === "string" && detail.page) out.page = detail.page.slice(0, 120);
  if (typeof detail.source === "string" && detail.source) out.source = detail.source.slice(0, 32);
  if (typeof detail.placement === "string" && detail.placement) out.placement = detail.placement.slice(0, 32);
  return Object.keys(out).length ? out : null;
}
