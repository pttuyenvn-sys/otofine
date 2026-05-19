import * as evtRepo from "../repositories/rfqCustomerEvent.repository.js";
import { rfqLog } from "../utils/rfqLogger.js";

/** Fire-and-forget buyer UX events — tolerates migration 023 not applied */
export function trackCustomerRfqOpen(rfqRequestId, meta = {}) {
  const quoteCount = Number(meta.quoteCount ?? 0);
  const status = meta.status ?? null;

  void (async () => {
    try {
      await evtRepo.insertCustomerEvent(null, {
        rfq_request_id: rfqRequestId,
        event_type: "customer_token_open",
        metadata_json: { quoteCount, status },
      });
      if (quoteCount > 0) {
        await evtRepo.insertCustomerEvent(null, {
          rfq_request_id: rfqRequestId,
          event_type: "customer_quotes_surface_view",
          metadata_json: { quoteCount },
        });
      }
    } catch (e) {
      if (e.code !== "ER_NO_SUCH_TABLE") {
        rfqLog.warn("rfq.customer_event.failed", {
          rfq_request_id: rfqRequestId,
          err: e.message,
          code: e.code,
        });
      }
    }
  })();
}
