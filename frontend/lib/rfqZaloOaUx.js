/**
 * Zalo OA — analytics placeholder (UI-only).
 *
 * TODO: future follower verification — server-side confirm follow.
 * TODO: future OA API integration — deeplink / campaign ids.
 */

/**
 * Event: `oa_follow_click`
 *
 * @param {string} surface — e.g. shop_register, rfq_success, buyer_token_sticky, buyer_token_inline
 * @param {Record<string, unknown>} [extra]
 */
export function emitOaFollowClick(surface, extra = {}) {
  if (typeof window === "undefined") return;
  try {
    const detail = { name: "oa_follow_click", surface, ts: Date.now(), ...extra };
    window.dispatchEvent(new CustomEvent("otofine_analytics", { detail }));
  } catch {
    /* no-op */
  }
  if (process.env.NODE_ENV === "development") {
    console.debug("[otofine_analytics] oa_follow_click", surface, extra);
  }
}

/**
 * @param {string} url
 * @param {string} surface
 */
export function openZaloOaUrl(url, surface) {
  emitOaFollowClick(surface);
  const u = String(url || "").trim();
  if (!u) return;
  window.open(u, "_blank", "noopener,noreferrer");
}
