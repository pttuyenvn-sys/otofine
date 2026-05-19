import { rfqFlags, rfqT1OnlineTimeoutMinutes } from "../../../config/rfq.config.js";
import { enqueueZaloJob } from "../repositories/rfqEscalationJob.repository.js";
import { rfqLog } from "../utils/rfqLogger.js";

function escalationDelaySeconds() {
  const t1m = rfqT1OnlineTimeoutMinutes();
  if (t1m > 0) return Math.max(30, t1m * 60);
  return Math.max(30, Number(process.env.RFQ_ZALO_ESCALATION_DELAY_SEC || 300));
}

export async function scheduleZaloEscalationJob(dispatchId) {
  if (!rfqFlags.RFQ_ZALO_ESCALATION_ENABLED) return;
  const delaySec = escalationDelaySeconds();
  const runAt = new Date(Date.now() + delaySec * 1000);
  const res = await enqueueZaloJob(dispatchId, runAt);
  if (res.inserted) {
    rfqLog.info("rfq.escalation.enqueued", {
      dispatch_id: dispatchId,
      run_at: runAt.toISOString(),
    });
  }
}
