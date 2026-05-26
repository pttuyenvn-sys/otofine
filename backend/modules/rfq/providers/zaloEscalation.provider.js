import { rfqLog } from "../utils/rfqLogger.js";
import { sendShopRfqEscalation } from "../../../services/zalo.service.js";

/**
 * RFQ Zalo escalation transport — native Zalo OA API (CS message + CTA, optional ZNS).
 * Queue/worker/retry unchanged; processor only checks result.ok.
 */
export async function sendRfqZaloEscalation(payload) {
  const dispatchId = payload?.dispatchId;

  try {
    const result = await sendShopRfqEscalation(payload);

    if (result.ok) {
      rfqLog.info("rfq.zalo.provider.sent", {
        dispatch_id: dispatchId,
        shop_id: payload.shopId,
        channel: result.channel,
        selection_reason: result.selectionReason ?? null,
        fallback_reason: result.fallbackReason ?? null,
        message_id: result.messageId,
        http_status: result.httpStatus ?? null,
      });
      return {
        ok: true,
        messageId: result.messageId ?? null,
        channel: result.channel ?? null,
      };
    }

    rfqLog.warn("rfq.zalo.provider.failed", {
      dispatch_id: dispatchId,
      shop_id: payload.shopId,
      reason: result.reason,
      channel: result.channel ?? null,
      selection_reason: result.selectionReason ?? null,
      fallback_reason: result.fallbackReason ?? null,
      http_status: result.httpStatus ?? null,
      error_body: result.errorBody ?? null,
    });

    return {
      ok: false,
      reason: result.reason || "send_failed",
      messageId: null,
      errorBody: result.errorBody ?? null,
      channel: result.channel ?? null,
    };
  } catch (e) {
    rfqLog.warn("rfq.zalo.provider.exception", {
      dispatch_id: dispatchId,
      err: String(e?.message || e),
      error_body: e?.responseBody ?? null,
    });
    return {
      ok: false,
      reason: String(e?.message || e),
      messageId: null,
      errorBody: e?.responseBody ?? null,
    };
  }
}
