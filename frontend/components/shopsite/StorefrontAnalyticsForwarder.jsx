"use client";

import { useEffect } from "react";
import { API_BASE } from "@/lib/config";
import {
  ANALYTICS_DEDUPE_WINDOW_MS,
  createAnalyticsBatchQueue,
} from "@/lib/analytics/analyticsEventQueue";

/**
 * Bridges the in-app `window` "shopsite:event" CustomEvent bus to the
 * backend ingest endpoint `/api/storefront-events/track`.
 *
 * Phase 7J — events are deduped and batched (≤10 or 500ms) before
 * JSON serialization / fetch so scroll/click bursts stay off the hot path.
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

export default function StorefrontAnalyticsForwarder({ shopSlug }) {
  useEffect(() => {
    if (typeof window === "undefined" || !shopSlug) return undefined;

    function ship(type, detail) {
      const body = {
        shopSlug,
        type,
        metadata: detail && typeof detail === "object" ? buildMetadata(detail) : null,
      };
      try {
        const url = `${API_BASE}/storefront-events/track`;
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

    const queue = createAnalyticsBatchQueue({
      flush(batch) {
        for (const item of batch) {
          ship(item.type, item.detail);
        }
      },
      dedupeKey: (item) =>
        `${item.type}|${String(
          item.detail?.productId || item.detail?.shopSlug || item.detail?.page || "",
        )}`,
      dedupeWindowMs: ANALYTICS_DEDUPE_WINDOW_MS,
    });

    function onEvent(e) {
      const detail = e?.detail;
      if (!detail || typeof detail !== "object") return;
      const type = String(detail.type || "");
      if (!ALLOWED_TYPES.has(type)) return;
      queue.enqueue({ type, detail });
    }

    function onPageHide() {
      queue.flushNow();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") queue.flushNow();
    }

    window.addEventListener("shopsite:event", onEvent);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      queue.flushNow();
      queue.destroy();
      window.removeEventListener("shopsite:event", onEvent);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
