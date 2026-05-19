import { rfqFlags, rfqAutoWaveDelayMinutes, rfqAutoWaveExtraRounds } from "../../../config/rfq.config.js";
import * as awRepo from "../repositories/rfqAutoWaveJob.repository.js";

/** First delayed wave (round_sequence = 2) after RFQ opens + wave‑1 dispatch. */
export async function scheduleInitialAutoWaveJob(rfqRequestId) {
  if (!rfqFlags.RFQ_MODULE_ENABLED || !rfqFlags.RFQ_AUTO_WAVE_ENABLED) return;
  const extra = rfqAutoWaveExtraRounds();
  if (extra < 1) return;
  const runAt = new Date(Date.now() + rfqAutoWaveDelayMinutes() * 60 * 1000);
  await awRepo.enqueueAutoWaveRound(rfqRequestId, 2, runAt);
}

/**
 * Chain further delayed rounds if EXTRA_ROUNDS allows and last wave dispatched shops.
 *
 * @param {number} rfqRequestId
 * @param {number} completedSeq — round_sequence of the job that just ran
 * @param {number} dispatched — shops appended this tick
 */
export async function scheduleNextAutoWaveRoundIfNeeded(rfqRequestId, completedSeq, dispatched) {
  if (!rfqFlags.RFQ_MODULE_ENABLED || !rfqFlags.RFQ_AUTO_WAVE_ENABLED) return;
  if (dispatched <= 0) return;
  const extra = rfqAutoWaveExtraRounds();
  const maxSeq = 1 + extra;
  if (completedSeq < maxSeq) {
    const runAt = new Date(Date.now() + rfqAutoWaveDelayMinutes() * 60 * 1000);
    await awRepo.enqueueAutoWaveRound(rfqRequestId, completedSeq + 1, runAt);
  }
}
