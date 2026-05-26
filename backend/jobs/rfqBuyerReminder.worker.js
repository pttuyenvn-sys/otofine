#!/usr/bin/env node
/**
 * RFQ buyer inactive reminder worker — polls every 15–30 min (default 20).
 * Requires: RFQ_MODULE_ENABLED=true, RFQ_BUYER_REMINDER_ENABLED=true
 */
import dotenv from "dotenv";
dotenv.config();

import { rfqFlags, rfqBuyerReminderPollMs } from "../config/rfq.config.js";
import { runBuyerReminderTick } from "../modules/rfq/services/rfqBuyerReminder.service.js";

const POLL_MS = rfqBuyerReminderPollMs();
const DRY_RUN = ["1", "true", "yes", "on"].includes(
  String(process.env.RFQ_BUYER_REMINDER_DRY_RUN || "").trim().toLowerCase(),
);

async function tick() {
  if (!rfqFlags.RFQ_MODULE_ENABLED || !rfqFlags.RFQ_BUYER_REMINDER_ENABLED) {
    return;
  }

  const summary = await runBuyerReminderTick({ dryRun: DRY_RUN });
  console.info("[rfq-buyer-reminder]", JSON.stringify({
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    sent: summary.sent,
    skipped: summary.skipped,
    scanned: summary.scanned,
  }));
}

console.info("[rfq-buyer-reminder] starting poll_ms=", POLL_MS, "dry_run=", DRY_RUN);
tick().catch((e) => console.error("[rfq-buyer-reminder] tick failed:", e?.message || e));
setInterval(() => {
  tick().catch((e) => console.error("[rfq-buyer-reminder] tick failed:", e?.message || e));
}, POLL_MS);
