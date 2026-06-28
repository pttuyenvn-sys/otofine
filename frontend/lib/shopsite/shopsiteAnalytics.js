/**
 * Lightweight storefront analytics pipeline (Phase 5.1).
 *
 * Design intent:
 *   - ADDITIVE ONLY — adding a call site never changes UI, never blocks
 *     a click handler, never throws.
 *   - NO external SDK (no Segment / PostHog / Mixpanel) — we ship a
 *     thin in-app event bus and let future dashboards plug in by
 *     listening for the `shopsite:event` CustomEvent on `window`.
 *   - SSR-safe — every entry point bails when `window` is undefined so
 *     these helpers can be imported from server components.
 *   - Zero runtime dependencies, sub-1 KB, no bundle hit beyond the
 *     module itself.
 *
 * To wire a real analytics provider in a future phase:
 *
 *   window.addEventListener("shopsite:event", (e) => {
 *     posthog.capture(e.detail.type, e.detail);
 *   });
 *
 * The event payload shape is stable: `{ type, ts, page, shopSlug?, ...rest }`.
 */

export const ShopsiteEvents = Object.freeze({
  STOREFRONT_VIEW:        "storefront_view",
  PRODUCT_CLICK:          "product_click",
  PHONE_CLICK:            "phone_click",
  ZALO_CLICK:             "zalo_click",
  FACEBOOK_CLICK:         "facebook_click",
  SHARE_CLICK:            "share_click",
  // Mobile compression pass — the floating bottom CTA's third slot
  // now points at the universal RFQ flow (/rfq/new). Tracking it
  // separately lets us measure the value of "give every visitor a
  // pivot path" without conflating it with on-storefront conversions.
  RFQ_CTA_CLICK:          "rfq_cta_click",
  SHARE_COMPLETE:         "share_complete",
  SHARE_COPY:             "share_copy",

  /**
   * Phase 7.1 — discovery analytics.
   *
   *   STOREFRONT_IMPRESSION — fired when a shop card enters the
   *     viewport on the directory page or a related-shops section.
   *     Use a single IntersectionObserver per card list to keep
   *     the bus volume sane. Payload: { shopSlug, listSource, rank? }
   *
   *   SHOP_CARD_CLICK       — buyer clicked into a shop card.
   *     Payload: { shopSlug, listSource, rank? }
   *
   *   DIRECTORY_SEARCH      — search box value committed (debounced
   *     submit or pressed Enter). Payload: { q, resultCount? }
   *
   *   DIRECTORY_FILTER      — a filter chip toggled. Payload:
   *     { facet: "brand"|"province"|"verified"|"tier", value }
   */
  STOREFRONT_IMPRESSION:  "storefront_impression",
  SHOP_CARD_CLICK:        "shop_card_click",
  DIRECTORY_SEARCH:       "directory_search",
  DIRECTORY_FILTER:       "directory_filter",
});

/**
 * Emit a storefront analytics event. Safe to call from anywhere on
 * the client. No-op on the server.
 *
 * @param {string} type     One of `ShopsiteEvents.*`
 * @param {object} [data]   Optional extra payload (shopSlug, productId, ...)
 */
export function trackShopsiteEvent(type, data = {}) {
  if (typeof window === "undefined" || !type) return;
  const detail = {
    type,
    ts: Date.now(),
    page: typeof window.location?.pathname === "string" ? window.location.pathname : null,
    ...data,
  };
  try {
    window.dispatchEvent(new CustomEvent("shopsite:event", { detail }));
  } catch {
    // CustomEvent unavailable (very old WebViews) — silently drop.
  }
  // Dev signal so authors can confirm wiring without opening a tab in
  // the network panel. Stripped from production console noise.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[shopsite-analytics]", type, detail);
  }
}
