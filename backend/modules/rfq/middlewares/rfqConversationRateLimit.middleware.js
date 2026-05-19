/**
 * Conversation API rate limits — in-memory per instance (same as rfqRateLimit).
 * Polling-friendly read caps; stricter send caps. WebSocket deferred.
 */

import { rfqLimits } from "../../../config/rfq.config.js";
import { rfqRateLimit } from "./rfqRateLimit.middleware.js";
import { rfqClientIp } from "../utils/rfqNet.js";

function participantKey(req) {
  const a = req.conversationAccess;
  if (a?.type === "shop") return `shop:${a.shopId}`;
  if (a?.type === "buyer") return `buyer:${a.rfqRequestId}`;
  return `ip:${rfqClientIp(req)}`;
}

function buyerRfqKey(req) {
  const a = req.conversationAccess;
  if (a?.type === "buyer") return `buyer:${a.rfqRequestId}`;
  return `ip:${rfqClientIp(req)}`;
}

const buyerSendLimiter = rfqRateLimit({
  windowMs: 60_000,
  max: rfqLimits.conversationBuyerSendPerMinute,
  bucketPrefix: "rfq_conv_send_buyer",
  keyFn: buyerRfqKey,
});

const shopSendLimiter = rfqRateLimit({
  windowMs: 60_000,
  max: rfqLimits.conversationShopSendPerMinute,
  bucketPrefix: "rfq_conv_send_shop",
  keyFn: (req) => {
    const a = req.conversationAccess;
    if (a?.type === "shop") return `shop:${a.shopId}`;
    return `ip:${rfqClientIp(req)}`;
  },
});

/** POST …/messages — 30/min buyer, 60/min shop */
export function rfqConvMessageSendRateLimit(req, res, next) {
  if (req.conversationAccess?.type === "shop") {
    return shopSendLimiter(req, res, next);
  }
  return buyerSendLimiter(req, res, next);
}

/** GET messages, GET conversation, POST read — avoids poll amplification abuse */
export const rfqConvReadRateLimit = rfqRateLimit({
  windowMs: 60_000,
  max: rfqLimits.conversationReadPerParticipantMinute,
  bucketPrefix: "rfq_conv_read",
  keyFn: participantKey,
});

/** GET unread-summary (buyer, multi-dispatch poll helper) */
export const rfqConvUnreadSummaryRateLimit = rfqRateLimit({
  windowMs: 60_000,
  max: rfqLimits.conversationUnreadSummaryPerBuyerMinute,
  bucketPrefix: "rfq_conv_unread_sum",
  keyFn: buyerRfqKey,
});
