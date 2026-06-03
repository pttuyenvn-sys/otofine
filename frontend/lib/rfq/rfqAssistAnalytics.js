import { postRfqAssistEvent } from "@/lib/rfq/rfqAssistApi";
import {
  ANALYTICS_DEDUPE_WINDOW_MS,
  createAnalyticsBatchQueue,
} from "@/lib/analytics/analyticsEventQueue";

/**
 * Phase 8.2 — RFQ Assist analytics tracker.
 *
 * Two responsibilities:
 *
 *   1. DEDUP impressions — IntersectionObserver fires repeatedly as
 *      the user scrolls; we only want ONE `impression` row per
 *      (rfqId, shopId) per page load. The Set lives in module scope
 *      so re-mounting the component during fast navigation doesn't
 *      double-count.
 *
 *   2. DUAL-SINK — every event is POSTed to the backend AND
 *      dispatched as a window `CustomEvent('shopsite:event', ...)`
 *      so existing storefront analytics taps see it without any
 *      cross-module wiring. Future ML feedback pipeline subscribes
 *      to the CustomEvent stream the same way Phase 5.1+ does.
 *
 * Phase 7J — network POSTs are batched (≤10 or 500ms) with rolling
 * dedupe so rapid card interactions don't spam the main thread.
 */

const impressionsSeen = new Set();

/** @type {ReturnType<typeof createAnalyticsBatchQueue> | null} */
let assistPostQueue = null;

function getAssistPostQueue() {
  if (assistPostQueue) return assistPostQueue;
  assistPostQueue = createAnalyticsBatchQueue({
    flush(batch) {
      for (const item of batch) {
        void postRfqAssistEvent(item.viewerToken, item.payload);
      }
    },
    dedupeKey: (item) => item.dedupeKey || "",
    dedupeWindowMs: ANALYTICS_DEDUPE_WINDOW_MS,
  });
  return assistPostQueue;
}

/** @internal — test reset */
export function resetAssistPostQueueForTests() {
  assistPostQueue?.destroy();
  assistPostQueue = null;
}

function dedupeKey(rfqId, shopId) {
  return `${rfqId}::${shopId}`;
}

/**
 * Public dispatcher. Resolves on success/failure both — fire-and-forget.
 *
 * @param {object} args
 * @param {string} args.viewerToken
 * @param {number} args.rfqId
 * @param {string} args.action
 * @param {number} [args.shopId]
 * @param {number} [args.matchScore]
 * @param {string} [args.matchTier]
 * @param {string} [args.source="viewer"]
 * @param {object} [args.metadata]
 */
export async function trackAssistEvent({
  viewerToken,
  rfqId,
  action,
  shopId,
  matchScore,
  matchTier,
  source = "viewer",
  metadata,
}) {
  if (!viewerToken || !action) return { ok: false, reason: "client-noop" };

  if (action === "impression" && shopId != null) {
    const key = dedupeKey(rfqId, shopId);
    if (impressionsSeen.has(key)) return { ok: false, reason: "client-dedup" };
    impressionsSeen.add(key);
  }

  const payload = {
    action,
    source,
    ...(shopId != null ? { shopId } : {}),
    ...(matchScore != null ? { matchScore } : {}),
    ...(matchTier != null ? { matchTier } : {}),
    ...(metadata ? { metadata } : {}),
  };

  // Dual-sink: dispatch to the global analytics stream first so any
  // attached listener (existing storefront tap, future ML pipeline)
  // sees the event even if the network beacon never lands.
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("shopsite:event", {
          detail: {
            type: `rfq_assist_${action}`,
            ...payload,
            rfqId,
          },
        }),
      );
    } catch {
      // CustomEvent dispatch should never throw, but be defensive.
    }
  }

  const dedupeKey = `${rfqId}|${action}|${shopId ?? ""}`;
  getAssistPostQueue().enqueue({ viewerToken, payload, dedupeKey });

  return { ok: true, reason: "queued" };
}

/**
 * Clear the impression dedup set. Exposed for tests / future
 * cross-RFQ navigation patterns; not used by the production
 * component itself.
 */
export function resetAssistImpressionDedup() {
  impressionsSeen.clear();
}
