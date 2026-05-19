import { pool } from "../../../config/db.js";
import * as awRepo from "../repositories/rfqAutoWaveJob.repository.js";
import * as audit from "./rfqAudit.service.js";
import { appendDispatchWaveForRfq } from "./rfqDispatch.service.js";
import { rfqLog } from "../utils/rfqLogger.js";
import { rfqCounterInc } from "./rfqObservability.service.js";
import { scheduleNextAutoWaveRoundIfNeeded } from "./rfqAutoWave.schedule.js";
import { loadRfqRow, rfqHasSubmittedQuote, shouldStopAutoWaveForRfqRow } from "./rfqAutoWave.guards.js";

function backoffSeconds(attempt) {
  const base = Math.max(30, Number(process.env.RFQ_AUTO_WAVE_BACKOFF_BASE_SEC || 60));
  const raw = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(raw, 3600);
}

export async function processAutoWaveJob(jobId) {
  const [[job]] = await pool.query(`SELECT * FROM rfq_auto_wave_jobs WHERE id = ? LIMIT 1`, [jobId]);
  if (!job || job.status !== "processing") return;

  const rfqRequestId = Number(job.rfq_request_id);
  const seq = Number(job.round_sequence || 1);
  const maxAttempts = Math.max(1, Math.min(12, Number(process.env.RFQ_AUTO_WAVE_MAX_ATTEMPTS || 5)));
  const nextAttempt = Number(job.attempts || 0) + 1;

  try {
    const r = await loadRfqRow(rfqRequestId);
    const terminal = shouldStopAutoWaveForRfqRow(r);
    if (terminal.stop) {
      await awRepo.markAutoWaveJobSkipped(jobId, terminal.reason);
      rfqCounterInc("auto_wave_skipped");
      await audit.audit(null, {
        rfq_request_id: rfqRequestId,
        from_status: r?.status ?? null,
        to_status: "auto_wave_skipped",
        actor_type: "system",
        metadata_json: {
          escalation_reason: "auto_wave_delayed",
          skip_reason: terminal.reason,
          round_sequence: seq,
          wave_number: null,
          job_id: jobId,
        },
      });
      rfqLog.metric("rfq.auto_wave.skipped", { rfq_request_id: rfqRequestId, reason: terminal.reason, seq });
      return;
    }

    if (await rfqHasSubmittedQuote(rfqRequestId)) {
      await awRepo.markAutoWaveJobSkipped(jobId, "has_submitted_quote");
      rfqCounterInc("auto_wave_skipped");
      await audit.audit(null, {
        rfq_request_id: rfqRequestId,
        from_status: r.status,
        to_status: "auto_wave_skipped",
        actor_type: "system",
        metadata_json: {
          escalation_reason: "auto_wave_delayed",
          skip_reason: "has_submitted_quote",
          round_sequence: seq,
          wave_number: null,
          job_id: jobId,
        },
      });
      rfqLog.metric("rfq.auto_wave.skipped", { rfq_request_id: rfqRequestId, reason: "has_submitted_quote", seq });
      return;
    }

    const result = await appendDispatchWaveForRfq(rfqRequestId);
    const dispatched = Number(result?.dispatched ?? 0);
    const wave = Number(result?.wave ?? 0);

    await audit.audit(null, {
      rfq_request_id: rfqRequestId,
      from_status: r.status,
      to_status: "auto_wave_escalation",
      actor_type: "system",
      metadata_json: {
        escalation_reason: "auto_wave_delayed",
        skip_reason: null,
        round_sequence: seq,
        wave_number: wave,
        dispatched,
        job_id: jobId,
      },
    });

    if (dispatched <= 0) {
      await awRepo.markAutoWaveJobSkipped(jobId, "no_additional_dispatch");
      rfqCounterInc("auto_wave_skipped");
      rfqLog.metric("rfq.auto_wave.skipped", { rfq_request_id: rfqRequestId, reason: "no_additional_dispatch", seq });
      return;
    }

    rfqCounterInc("auto_wave_dispatched");
    rfqLog.metric("rfq.auto_wave.dispatched", {
      rfq_request_id: rfqRequestId,
      wave,
      dispatched,
      seq,
    });

    await awRepo.markAutoWaveJobSent(jobId);
    await scheduleNextAutoWaveRoundIfNeeded(rfqRequestId, seq, dispatched);
  } catch (e) {
    const msg = e?.message || String(e);
    if (nextAttempt >= maxAttempts) {
      await awRepo.markAutoWaveJobDead(jobId, msg);
      rfqCounterInc("auto_wave_dead");
      rfqLog.metric("rfq.auto_wave.dead", { rfq_request_id: rfqRequestId, job_id: jobId, err: msg });
      return;
    }
    const sec = backoffSeconds(nextAttempt);
    const nextRun = new Date(Date.now() + sec * 1000);
    await awRepo.rescheduleAutoWaveJobRetry(jobId, nextAttempt, nextRun, msg);
    rfqCounterInc("auto_wave_retry_scheduled");
    rfqLog.info("rfq.auto_wave.retry_scheduled", {
      rfq_request_id: rfqRequestId,
      job_id: jobId,
      attempt: nextAttempt,
      next_run: nextRun.toISOString(),
    });
  }
}
