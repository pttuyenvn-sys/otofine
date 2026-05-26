/** Canonical shop RFQ inbox list route (frontend). */
export const SHOP_RFQ_INBOX_PATH = "/rfq/shop/inbox";

const DEFAULT_SITE_ORIGIN = "https://otofine.com";

/** Production site origin for absolute notification/deep-link URLs. */
export function shopRfqSiteOrigin() {
  const raw = String(process.env.FRONTEND_URL || process.env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).trim();
  return raw.replace(/\/$/, "") || DEFAULT_SITE_ORIGIN;
}

/** Parse dispatch id — returns null when invalid. */
export function parseShopDispatchId(raw) {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

/** Relative deep-link path for a shop RFQ conversation. */
export function buildShopRfqConversationPath(dispatchId) {
  const id = parseShopDispatchId(dispatchId);
  if (!id) return SHOP_RFQ_INBOX_PATH;
  return `/rfq/shop/${id}`;
}

/** Absolute deep-link URL — null when dispatchId invalid. */
export function buildShopRfqConversationUrl(dispatchId) {
  const id = parseShopDispatchId(dispatchId);
  if (!id) return null;
  return `${shopRfqSiteOrigin()}${buildShopRfqConversationPath(id)}`;
}

/** Alias for Zalo/escalation bridge payloads (`shopActionUrl` field). */
export function buildShopActionUrl(dispatchId) {
  return buildShopRfqConversationUrl(dispatchId);
}
