import { pool } from "../../../config/db.js";
import crypto from "crypto";

export function idempotencyAutoWaveSeq(rfqRequestId, roundSequence) {
  return crypto
    .createHash("sha256")
    .update(`rfq:auto_wave:${rfqRequestId}:${roundSequence}`, "utf8")
    .digest("hex");
}

/**
 * @param {number} rfqRequestId
 * @param {number} roundSequence
 * @param {Date} runAt
 * @param {import('mysql2/promise').PoolConnection | null} [conn]
 */
export async function enqueueAutoWaveRound(rfqRequestId, roundSequence, runAt, conn = null) {
  const c = conn || pool;
  const key = idempotencyAutoWaveSeq(rfqRequestId, roundSequence);
  try {
    const [r] = await c.query(
      `INSERT INTO rfq_auto_wave_jobs (
         rfq_request_id, round_sequence, idempotency_key, run_at, status, attempts
       ) VALUES (?, ?, ?, ?, 'queued', 0)`,
      [rfqRequestId, roundSequence, key, runAt],
    );
    return { inserted: true, id: r.insertId };
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return { inserted: false };
    throw e;
  }
}

/**
 * NON-TRANSACTIONAL claim — no FOR UPDATE / SKIP LOCKED.
 * Rows can race duplicate processing; processor + dispatch idempotency must tolerate retries.
 *
 * @param {number} limit
 * @returns {Promise<number[]>}
 */
export async function claimDueAutoWaveJobs(limit = 10) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 10));
  const [candidates] = await pool.query(
    `SELECT id FROM rfq_auto_wave_jobs
     WHERE status = 'queued'
       AND run_at <= NOW(3)
       AND (locked_until IS NULL OR locked_until < NOW(3))
     ORDER BY run_at ASC, id ASC
     LIMIT ?`,
    [lim],
  );

  const claimed = [];
  for (const row of candidates) {
    const [res] = await pool.query(
      `UPDATE rfq_auto_wave_jobs
       SET status = 'processing',
           locked_until = DATE_ADD(NOW(3), INTERVAL 10 MINUTE),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND status = 'queued'`,
      [row.id],
    );
    if (res.affectedRows > 0) claimed.push(Number(row.id));
  }
  return claimed;
}

export async function markAutoWaveJobSent(jobId) {
  await pool.query(
    `UPDATE rfq_auto_wave_jobs SET status = 'sent', locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [jobId],
  );
}

export async function markAutoWaveJobSkipped(jobId, reason) {
  await pool.query(
    `UPDATE rfq_auto_wave_jobs SET status = 'skipped', skip_reason = ?, locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [String(reason || "").slice(0, 128), jobId],
  );
}

export async function markAutoWaveJobDead(jobId, errMsg) {
  await pool.query(
    `UPDATE rfq_auto_wave_jobs SET status = 'dead', last_error = ?, locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [String(errMsg || "").slice(0, 512), jobId],
  );
}

export async function rescheduleAutoWaveJobRetry(jobId, attempts, nextRunAt, errMsg) {
  await pool.query(
    `UPDATE rfq_auto_wave_jobs SET status = 'queued', attempts = ?, run_at = ?,
      last_error = ?, locked_until = NULL, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [attempts, nextRunAt, String(errMsg || "").slice(0, 512), jobId],
  );
}

export async function unlockStaleAutoWaveProcessingJobs(staleBeforeMinutes = 15) {
  const [r] = await pool.query(
    `UPDATE rfq_auto_wave_jobs
     SET status = 'queued', locked_until = NULL, updated_at = CURRENT_TIMESTAMP(3)
     WHERE status = 'processing'
       AND locked_until IS NOT NULL
       AND locked_until < DATE_SUB(NOW(3), INTERVAL ? MINUTE)`,
    [staleBeforeMinutes],
  );
  return r.affectedRows ?? 0;
}

export async function countAutoWaveJobsByStatus() {
  const [rows] = await pool.query(`SELECT status, COUNT(*) AS c FROM rfq_auto_wave_jobs GROUP BY status`);
  const out = {};
  for (const x of rows) out[x.status] = Number(x.c);
  return out;
}
