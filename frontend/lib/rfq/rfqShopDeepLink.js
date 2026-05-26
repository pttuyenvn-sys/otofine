/** Canonical shop RFQ inbox list route. */
export const SHOP_RFQ_INBOX_PATH = "/rfq/shop/inbox";

/** Parse dispatch id from URL/query segments. */
export function parseShopDispatchId(raw) {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

/**
 * Stable deep-link path for a shop RFQ conversation.
 * Used by push, Zalo bridge (future), and in-app navigation.
 */
export function buildShopRfqConversationPath(dispatchId) {
  const id = parseShopDispatchId(dispatchId);
  if (!id) return SHOP_RFQ_INBOX_PATH;
  return `/rfq/shop/${id}`;
}

/** Optional absolute URL for external notification systems. */
export function buildShopRfqConversationUrl(dispatchId, origin = "") {
  const path = buildShopRfqConversationPath(dispatchId);
  const base = String(origin || "").trim().replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/** Inbox URL with optional pre-select hint (desktop split-pane). */
export function buildShopRfqInboxPath({ dispatchId } = {}) {
  const id = parseShopDispatchId(dispatchId);
  if (!id) return SHOP_RFQ_INBOX_PATH;
  return `${SHOP_RFQ_INBOX_PATH}?dispatchId=${id}`;
}
