#!/usr/bin/env node
/** One-shot buyer reminder tick — for cron/systemd timer (exit 0). */
import dotenv from "dotenv";
dotenv.config();

import { rfqFlags } from "../config/rfq.config.js";
import { runBuyerReminderTick } from "../modules/rfq/services/rfqBuyerReminder.service.js";

const DRY_RUN = ["1", "true", "yes", "on"].includes(
  String(process.env.RFQ_BUYER_REMINDER_DRY_RUN || "").trim().toLowerCase(),
);

async function main() {
  if (!rfqFlags.RFQ_MODULE_ENABLED) {
    console.info("[rfq-buyer-reminder-cron] RFQ_MODULE_ENABLED=false — skip");
    return;
  }
  if (!rfqFlags.RFQ_BUYER_REMINDER_ENABLED) {
    console.info("[rfq-buyer-reminder-cron] RFQ_BUYER_REMINDER_ENABLED=false — skip");
    return;
  }

  const summary = await runBuyerReminderTick({ dryRun: DRY_RUN });
  console.info("[rfq-buyer-reminder-cron]", JSON.stringify(summary));
}

main().catch((e) => {
  console.error("[rfq-buyer-reminder-cron] FAILED:", e?.message || e);
  process.exit(1);
});
