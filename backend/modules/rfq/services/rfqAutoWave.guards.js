import { pool } from "../../../config/db.js";

export async function loadRfqRow(rfqRequestId) {
  const [[row]] = await pool.query(
    `SELECT id, status, expires_at FROM rfq_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [rfqRequestId],
  );
  return row || null;
}

export function shouldStopAutoWaveForRfqRow(r) {
  if (!r) return { stop: true, reason: "rfq_not_found" };
  const st = String(r.status || "");
  if (st === "closed" || st === "cancelled" || st === "expired") return { stop: true, reason: st };
  if (r.expires_at) {
    const t = new Date(r.expires_at).getTime();
    if (Number.isFinite(t) && t < Date.now()) return { stop: true, reason: "expired" };
  }
  return { stop: false, reason: null };
}

export async function rfqHasSubmittedQuote(rfqRequestId) {
  const [[row]] = await pool.query(
    `SELECT 1 AS ok FROM rfq_quotes
     WHERE rfq_request_id = ? AND deleted_at IS NULL AND status = 'submitted' LIMIT 1`,
    [rfqRequestId],
  );
  return Boolean(row);
}
