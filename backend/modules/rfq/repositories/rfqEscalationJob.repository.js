import { pool } from "../../../config/db.js";
import crypto from "crypto";

export function idempotencyKeyZaloWave1(dispatchId) {
  return crypto.createHash("sha256").update(`zalo:w1:${dispatchId}`, "utf8").digest("hex");
}

export async function enqueueZaloJob(dispatchId, runAt, conn = null) {
  const c = conn || pool;
  const key = idempotencyKeyZaloWave1(dispatchId);
  try {
    const [r] = await c.query(
      `INSERT INTO rfq_escalation_jobs (
         dispatch_id, channel, idempotency_key, run_at, status, attempts
       ) VALUES (?, 'zalo', ?, ?, 'queued', 0)`,
      [dispatchId, key, runAt],
    );
    return { inserted: true, id: r.insertId };
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return { inserted: false };
    throw e;
  }
}

/** Manual replay / ops — unique idempotency key per enqueue */
export async function enqueueZaloJobWithKey(dispatchId, runAt, idempotencyKey, conn = null) {
  const c = conn || pool;
  const key = String(idempotencyKey || "").slice(0, 64);
  const [r] = await c.query(
    `INSERT INTO rfq_escalation_jobs (
       dispatch_id, channel, idempotency_key, run_at, status, attempts
     ) VALUES (?, 'zalo', ?, ?, 'queued', 0)`,
    [dispatchId, key, runAt],
  );
  return { inserted: true, id: r.insertId };
}

export async function claimDueJobs(limit = 15) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id FROM rfq_escalation_jobs
       WHERE status = 'queued'
         AND run_at <= NOW(3)
         AND (locked_until IS NULL OR locked_until < NOW(3))
       ORDER BY run_at ASC, id ASC
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    const ids = rows.map((x) => x.id);
    if (!ids.length) {
      await conn.commit();
      return [];
    }
    const placeholders = ids.map(() => "?").join(",");
    await conn.query(
      `UPDATE rfq_escalation_jobs
       SET status = 'processing', locked_until = DATE_ADD(NOW(3), INTERVAL 10 MINUTE),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id IN (${placeholders})`,
      ids,
    );
    await conn.commit();
    return ids;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function markJobSent(jobId) {
  await pool.query(
    `UPDATE rfq_escalation_jobs SET status = 'sent', locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [jobId],
  );
}

export async function markJobSkipped(jobId, reason) {
  await pool.query(
    `UPDATE rfq_escalation_jobs SET status = 'skipped', skip_reason = ?, locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [reason.slice(0, 64), jobId],
  );
}

export async function markJobDead(jobId, errMsg) {
  await pool.query(
    `UPDATE rfq_escalation_jobs SET status = 'dead', last_error = ?, locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [String(errMsg || "").slice(0, 512), jobId],
  );
}

export async function rescheduleJobRetry(jobId, attempts, nextRunAt, errMsg) {
  await pool.query(
    `UPDATE rfq_escalation_jobs SET status = 'queued', attempts = ?, run_at = ?,
      last_error = ?, locked_until = NULL, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [attempts, nextRunAt, String(errMsg || "").slice(0, 512), jobId],
  );
}

export async function unlockStaleProcessingJobs(staleBeforeMinutes = 15) {
  const [r] = await pool.query(
    `UPDATE rfq_escalation_jobs
     SET status = 'queued', locked_until = NULL, updated_at = CURRENT_TIMESTAMP(3)
     WHERE status = 'processing'
       AND locked_until IS NOT NULL
       AND locked_until < DATE_SUB(NOW(3), INTERVAL ? MINUTE)`,
    [staleBeforeMinutes],
  );
  return r.affectedRows ?? 0;
}

export async function countJobsByStatus() {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS c FROM rfq_escalation_jobs GROUP BY status`,
  );
  const out = {};
  for (const x of rows) out[x.status] = Number(x.c);
  return out;
}

export async function listRecentDeadOrSkipped(limit = 50) {
  const [rows] = await pool.query(
    `SELECT j.*, d.shop_id, d.rfq_request_id
     FROM rfq_escalation_jobs j
     INNER JOIN rfq_dispatches d ON d.id = j.dispatch_id
     WHERE j.status IN ('dead','skipped')
     ORDER BY j.updated_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows;
}

/** Repair: enqueue missing Zalo jobs for eligible dispatches (idempotent INSERT). */
export async function repairMissingZaloJobs(runAtForNewJobs) {
  const delaySec = Number(process.env.RFQ_ZALO_ESCALATION_DELAY_SEC || 300);
  const runAtDefault = new Date(Date.now() + delaySec * 1000);
  const runAt = runAtForNewJobs || runAtDefault;

  const [dispatches] = await pool.query(
    `SELECT d.id AS dispatch_id
     FROM rfq_dispatches d
     INNER JOIN rfq_requests r ON r.id = d.rfq_request_id AND r.deleted_at IS NULL
     LEFT JOIN rfq_escalation_jobs j ON j.dispatch_id = d.id AND j.channel = 'zalo'
     WHERE d.web_notified_at IS NOT NULL
       AND j.id IS NULL
       AND d.web_viewed_at IS NULL
       AND d.status NOT IN ('quoted','accepted','skipped','expired','failed')
       AND (r.expires_at IS NULL OR r.expires_at > NOW(3))
       AND r.status NOT IN ('expired','cancelled','closed')
       AND d.zalo_notified_at IS NULL`,
  );

  let inserted = 0;
  for (const row of dispatches) {
    const res = await enqueueZaloJob(row.dispatch_id, runAt);
    if (res.inserted) inserted += 1;
  }
  return { scanned: dispatches.length, inserted };
}
