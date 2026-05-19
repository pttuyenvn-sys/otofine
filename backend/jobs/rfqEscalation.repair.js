#!/usr/bin/env node
/** Repair cron: stale locks + enqueue missed Zalo jobs. Exit 0 — schedule via cron/systemd timer. */
import dotenv from "dotenv";
dotenv.config();

import { rfqFlags } from "../config/rfq.config.js";
import * as jobRepo from "../modules/rfq/repositories/rfqEscalationJob.repository.js";

async function main() {
  if (!rfqFlags.RFQ_MODULE_ENABLED || !rfqFlags.RFQ_ZALO_ESCALATION_ENABLED) {
    console.info("[rfq-repair] flags off — noop");
    return;
  }
  const u = await jobRepo.unlockStaleProcessingJobs(Number(process.env.RFQ_ESCALATION_STALE_LOCK_MINUTES || 15));
  console.info("[rfq-repair] unlocked stale:", u);
  const rep = await jobRepo.repairMissingZaloJobs();
  console.info("[rfq-repair] repair_missing:", rep);
}

main().catch((e) => {
  console.error("[rfq-repair] FAILED", e);
  process.exit(1);
});
