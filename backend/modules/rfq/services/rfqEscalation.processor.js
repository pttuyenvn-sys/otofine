import { pool } from "../../../config/db.js";
import * as jobRepo from "../repositories/rfqEscalationJob.repository.js";
import { sendRfqZaloEscalation } from "../providers/zaloEscalation.provider.js";
import { rfqLog } from "../utils/rfqLogger.js";
import { buildShopActionUrl } from "../utils/rfqShopDeepLink.js";
import { rfqCounterInc } from "./rfqObservability.service.js";

function backoffSeconds(attempt) {
  const base = Math.max(30, Number(process.env.RFQ_ESCALATION_BACKOFF_BASE_SEC || 60));
  const raw = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(raw, 3600);
}

async function loadDispatchBundle(dispatchId) {
  const [[row]] = await pool.query(
    `SELECT d.*, r.public_id, r.part_description, r.status AS rfq_status, r.expires_at AS rfq_expires_at,
            s.zalo AS shop_zalo, s.name AS shop_name, s.phone AS shop_phone
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL
     INNER JOIN shops s ON s.id = d.shop_id
     WHERE d.id = ?
     LIMIT 1`,
    [dispatchId],
  );
  return row || null;
}

async function hasSubmittedQuote(dispatchId) {
  const [[x]] = await pool.query(
    `SELECT 1 AS ok FROM rfq_quotes
     WHERE dispatch_id = ? AND deleted_at IS NULL AND status = 'submitted' LIMIT 1`,
    [dispatchId],
  );
  return Boolean(x?.ok);
}

export async function processEscalationJob(jobId) {
  const [[job]] = await pool.query(`SELECT * FROM rfq_escalation_jobs WHERE id = ? LIMIT 1`, [jobId]);
  if (!job || job.status !== "processing") return;

  const row = await loadDispatchBundle(job.dispatch_id);
  if (!row) {
    await jobRepo.markJobSkipped(jobId, "missing_dispatch");
    return;
  }

  if (row.web_viewed_at != null) {
    await jobRepo.markJobSkipped(jobId, "skipped_web_viewed");
    rfqCounterInc("escalation_skipped_web_viewed");
    rfqLog.metric("rfq.escalation.skipped", { reason: "web_viewed", dispatch_id: row.id });
    return;
  }

  if (["quoted", "accepted"].includes(row.status)) {
    await jobRepo.markJobSkipped(jobId, "skipped_dispatch_terminal");
    rfqCounterInc("escalation_skipped_other");
    return;
  }

  if (await hasSubmittedQuote(job.dispatch_id)) {
    await jobRepo.markJobSkipped(jobId, "skipped_has_quote");
    rfqCounterInc("escalation_skipped_other");
    return;
  }

  const rfqExpired =
    row.rfq_status === "expired" ||
    (row.rfq_expires_at && new Date(row.rfq_expires_at) < new Date());
  if (rfqExpired) {
    await jobRepo.markJobSkipped(jobId, "skipped_rfq_expired");
    rfqCounterInc("escalation_skipped_other");
    return;
  }

  if (row.zalo_notified_at != null) {
    await jobRepo.markJobSkipped(jobId, "skipped_zalo_already");
    rfqCounterInc("escalation_skipped_other");
    return;
  }

  const snippet = String(row.part_description || "").slice(0, 280);
  const result = await sendRfqZaloEscalation({
    dispatchId: row.id,
    shopId: row.shop_id,
    rfqRequestId: row.rfq_request_id,
    publicId: row.public_id,
    shopZalo: row.shop_zalo || null,
    shopName: row.shop_name || null,
    shopPhone: row.shop_phone || null,
    snippet,
    respondBy: row.respond_by ? new Date(row.respond_by).toISOString() : null,
    webNotifiedAt: row.web_notified_at ? new Date(row.web_notified_at).toISOString() : null,
    shopActionUrl: buildShopActionUrl(row.id),
  });

  const maxAttempts = Math.max(1, Math.min(12, Number(process.env.RFQ_ESCALATION_MAX_ATTEMPTS || 5)));
  const nextAttempt = Number(job.attempts || 0) + 1;

  if (result.ok) {
    await pool.query(
      `UPDATE rfq_dispatches SET zalo_notified_at = NOW(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [row.id],
    );
    await jobRepo.markJobSent(jobId);
    rfqCounterInc("escalation_sent");
    rfqLog.metric("rfq.escalation.sent", { dispatch_id: row.id, shop_id: row.shop_id });
    return;
  }

  if (nextAttempt >= maxAttempts) {
    await jobRepo.markJobDead(jobId, result.reason || "send_failed");
    rfqCounterInc("escalation_dead");
    rfqLog.metric("rfq.escalation.dead", { dispatch_id: row.id, job_id: jobId });
    return;
  }

  const sec = backoffSeconds(nextAttempt);
  const nextRun = new Date(Date.now() + sec * 1000);
  await jobRepo.rescheduleJobRetry(jobId, nextAttempt, nextRun, result.reason || "retry");
  rfqCounterInc("escalation_retry_scheduled");
  rfqLog.info("rfq.escalation.retry_scheduled", {
    dispatch_id: row.id,
    job_id: jobId,
    attempt: nextAttempt,
    next_run: nextRun.toISOString(),
  });
}
