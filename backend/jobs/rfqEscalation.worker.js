#!/usr/bin/env node
/**
 * RFQ Zalo escalation worker — chạy process riêng (restart-safe, không chat HTTP).
 * Requires: RFQ_MODULE_ENABLED=true, RFQ_ZALO_ESCALATION_ENABLED=true
 */
import dotenv from "dotenv";
dotenv.config();

import { rfqFlags } from "../config/rfq.config.js";
import * as jobRepo from "../modules/rfq/repositories/rfqEscalationJob.repository.js";
import { processEscalationJob } from "../modules/rfq/services/rfqEscalation.processor.js";

const POLL_MS = Math.max(5000, Number(process.env.RFQ_ESCALATION_WORKER_POLL_MS || 25000));

async function tick() {
  if (!rfqFlags.RFQ_MODULE_ENABLED || !rfqFlags.RFQ_ZALO_ESCALATION_ENABLED) {
    return;
  }
  const unlocked = await jobRepo.unlockStaleProcessingJobs(
    Number(process.env.RFQ_ESCALATION_STALE_LOCK_MINUTES || 15),
  );
  if (unlocked) console.info("[rfq-worker] unlocked stale jobs:", unlocked);

  const ids = await jobRepo.claimDueJobs(Number(process.env.RFQ_ESCALATION_BATCH || 15));
  for (const id of ids) {
    try {
      await processEscalationJob(id);
    } catch (e) {
      console.error("[rfq-worker] job failed", id, e?.message || e);
    }
  }
}

console.info("[rfq-worker] starting poll_ms=", POLL_MS);
tick().catch(console.error);
setInterval(() => tick().catch(console.error), POLL_MS);
