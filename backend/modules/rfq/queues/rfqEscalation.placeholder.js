import { rfqFlags } from "../../config/rfq.config.js";
import { rfqLog } from "../utils/rfqLogger.js";

/** SMS escalation stub — không triển khai worker SMS trong Sprint 2. */
export function scheduleSmsEscalationPlaceholder(ctx) {
  if (!rfqFlags.RFQ_SMS_ESCALATION_ENABLED) return;
  rfqLog.info("rfq.escalation.sms_placeholder", { rfq_request_id: ctx?.rfqRequestId ?? null });
}
