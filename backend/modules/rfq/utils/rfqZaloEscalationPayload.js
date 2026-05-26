import {
  buildShopActionUrl,
  shopRfqSiteOrigin,
  SHOP_RFQ_INBOX_PATH,
} from "./rfqShopDeepLink.js";

/** Default Zalo OA/ZNS CTA label for shop RFQ escalation. */
export const SHOP_ZALO_CTA_TITLE = "Mở hội thoại";

function inboxFallbackUrl() {
  return `${shopRfqSiteOrigin()}${SHOP_RFQ_INBOX_PATH}`;
}

/**
 * Resolve absolute shop action URL for Zalo CTA.
 * Prefers validated shopActionUrl, then dispatch deep-link, then inbox fallback.
 */
export function resolveShopZaloActionUrl(shopActionUrl, dispatchId) {
  const built = buildShopActionUrl(dispatchId);
  const candidate = String(shopActionUrl || "").trim() || built;
  if (!candidate) return inboxFallbackUrl();

  if (candidate.startsWith("/")) {
    return `${shopRfqSiteOrigin()}${candidate}`;
  }

  try {
    const u = new URL(candidate);
    if (!/^https?:$/i.test(u.protocol)) {
      return built || inboxFallbackUrl();
    }
    const allowedOrigin = new URL(shopRfqSiteOrigin()).origin;
    if (u.origin !== allowedOrigin) {
      return built || inboxFallbackUrl();
    }
    return u.href;
  } catch {
    return built || inboxFallbackUrl();
  }
}

/**
 * Primary CTA object for webhook bridge → Zalo OA/ZNS button mapping.
 * Bridge may map to Zalo OA: type "oa.open.url" with payload.url.
 */
export function buildZaloShopCta({ shopActionUrl, dispatchId } = {}) {
  const url = resolveShopZaloActionUrl(shopActionUrl, dispatchId);
  if (!url) return null;
  return {
    title: SHOP_ZALO_CTA_TITLE,
    url,
  };
}

/**
 * Build outgoing RFQ → Zalo bridge webhook body (additive CTA fields).
 *
 * Schema (v1 + CTA extension):
 * - shopActionUrl: absolute conversation URL
 * - cta: { title, url } — primary button
 * - buttons: [cta] — array form for multi-button templates
 * - zns: { button: cta } — hint for ZNS template mappers
 */
export function buildZaloEscalationWebhookBody(payload = {}) {
  const cta = buildZaloShopCta({
    shopActionUrl: payload.shopActionUrl,
    dispatchId: payload.dispatchId,
  });

  const body = {
    event: "rfq_escalation_zalo",
    version: 1,
    dispatchedAt: new Date().toISOString(),
    ...payload,
  };

  if (cta?.url) {
    body.shopActionUrl = cta.url;
    body.cta = cta;
    body.buttons = [cta];
    body.zns = { button: cta };
  } else {
    delete body.shopActionUrl;
    delete body.cta;
    delete body.buttons;
    delete body.zns;
  }

  return body;
}
