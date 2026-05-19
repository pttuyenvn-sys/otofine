import crypto from "crypto";
import { pool } from "../../../config/db.js";
import * as jobRepo from "../repositories/rfqEscalationJob.repository.js";
import * as audit from "./rfqAudit.service.js";
import { appendDispatchWaveForRfq } from "./rfqDispatch.service.js";
import { rfqFlags } from "../../../config/rfq.config.js";

function escalationReplayDelaySec() {
  return Math.max(30, Number(process.env.RFQ_OPS_ESCALATION_REPLAY_DELAY_SEC || 120));
}

export async function opsReplayEscalation(dispatchId) {
  if (!rfqFlags.RFQ_ZALO_ESCALATION_ENABLED) {
    throw Object.assign(new Error("ZALO_ESC_OFF"), { status: 400 });
  }
  const [[d]] = await pool.query(`SELECT id, rfq_request_id FROM rfq_dispatches WHERE id = ? LIMIT 1`, [
    dispatchId,
  ]);
  if (!d) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  const suffix = crypto.randomBytes(16).toString("hex");
  const key = crypto.createHash("sha256").update(`zalo:replay:${dispatchId}:${suffix}`, "utf8").digest("hex");
  const runAt = new Date(Date.now() + escalationReplayDelaySec() * 1000);
  await jobRepo.enqueueZaloJobWithKey(dispatchId, runAt, key);

  await audit.audit(null, {
    rfq_request_id: d.rfq_request_id,
    from_status: null,
    to_status: "ops_replay_escalation",
    actor_type: "admin",
    metadata_json: { dispatchId, runAt: runAt.toISOString() },
  });

  return { ok: true, dispatchId, rfq_request_id: d.rfq_request_id, runAt: runAt.toISOString() };
}

export async function opsAppendDispatchWave(rfqRequestId) {
  const [[r]] = await pool.query(`SELECT id FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [
    rfqRequestId,
  ]);
  if (!r) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  const res = await appendDispatchWaveForRfq(rfqRequestId);

  await audit.audit(null, {
    rfq_request_id: rfqRequestId,
    from_status: null,
    to_status: "ops_dispatch_append",
    actor_type: "admin",
    metadata_json: { result: res },
  });

  return res;
}

export async function opsMarkSpam(rfqRequestId, reason) {
  const [[r]] = await pool.query(`SELECT id FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [
    rfqRequestId,
  ]);
  if (!r) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  await pool.query(
    `UPDATE rfq_requests SET spam_flag = 1, status = 'cancelled', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [rfqRequestId],
  );

  await audit.audit(null, {
    rfq_request_id: rfqRequestId,
    from_status: "any",
    to_status: "spam_cancelled",
    actor_type: "admin",
    metadata_json: { reason: String(reason || "spam").slice(0, 200) },
  });

  return { ok: true };
}

export async function opsCloseRfq(rfqRequestId, reason) {
  const [[r]] = await pool.query(`SELECT id FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [
    rfqRequestId,
  ]);
  if (!r) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  await pool.query(`UPDATE rfq_requests SET status = 'closed', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [
    rfqRequestId,
  ]);

  await audit.audit(null, {
    rfq_request_id: rfqRequestId,
    from_status: "any",
    to_status: "closed",
    actor_type: "admin",
    metadata_json: { reason: String(reason || "manual_close").slice(0, 200) },
  });

  return { ok: true };
}

export async function opsSellerActivity(shopId, days = 30) {
  const d = Math.max(1, Math.min(120, Number(days) || 30));

  const [[shop]] = await pool.query(`SELECT id, name, last_seen_at FROM shops WHERE id = ? LIMIT 1`, [shopId]);
  if (!shop) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  const [[disp]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rfq_dispatches WHERE shop_id = ? AND web_notified_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [shopId, d],
  );

  const [[quotes]] = await pool.query(
    `SELECT COUNT(*) AS c FROM rfq_quotes q
     INNER JOIN rfq_dispatches d ON d.id = q.dispatch_id
     WHERE d.shop_id = ? AND q.submitted_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND q.deleted_at IS NULL`,
    [shopId, d],
  );

  const [[vnq]] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL AND COALESCE(r.spam_flag, 0) = 0
     WHERE d.shop_id = ?
       AND d.first_viewed_at IS NOT NULL
       AND d.web_notified_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
       AND d.status NOT IN ('quoted','expired','failed','skipped')
       AND NOT EXISTS (
         SELECT 1 FROM rfq_quotes q WHERE q.dispatch_id = d.id AND q.deleted_at IS NULL AND q.status = 'submitted'
       )
       AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
       AND r.status NOT IN ('expired','cancelled','closed')`,
    [shopId, d],
  );

  return {
    shop,
    window_days: d,
    dispatches: Number(disp?.c || 0),
    quotes_submitted: Number(quotes?.c || 0),
    viewed_no_quote_dispatches: Number(vnq?.c || 0),
  };
}
