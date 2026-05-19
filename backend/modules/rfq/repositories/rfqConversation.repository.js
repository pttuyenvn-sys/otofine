import { pool } from "../../../config/db.js";

/**
 * Conversation rows are keyed by dispatch_id — one room per buyer↔shop dispatch.
 * rfq_request_id is denormalized for buyer-wide queries; dispatch_id is the anchor.
 */

export async function findByDispatchId(dispatchId, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT * FROM rfq_conversations WHERE dispatch_id = ? LIMIT 1`,
    [dispatchId],
  );
  return row || null;
}

export async function findByDispatchForShop(dispatchId, shopId, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT * FROM rfq_conversations
     WHERE dispatch_id = ? AND shop_id = ?
     LIMIT 1`,
    [dispatchId, shopId],
  );
  return row || null;
}

export async function findByDispatchForRfqRequest(dispatchId, rfqRequestId, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT * FROM rfq_conversations
     WHERE dispatch_id = ? AND rfq_request_id = ?
     LIMIT 1`,
    [dispatchId, rfqRequestId],
  );
  return row || null;
}

/**
 * Idempotent: UNIQUE(dispatch_id) — safe for dispatch waves, retries, auto-wave.
 */
export async function ensureForDispatch(
  conn,
  { rfq_request_id, dispatch_id, shop_id },
) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_conversations (rfq_request_id, dispatch_id, shop_id, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE
       updated_at = CURRENT_TIMESTAMP(3)`,
    [rfq_request_id, dispatch_id, shop_id],
  );
  if (r.insertId) {
    return { id: r.insertId, inserted: true };
  }
  const existing = await findByDispatchId(dispatch_id, c);
  return { id: existing?.id ?? null, inserted: false };
}

export async function touchLastQuoteAt(conn, conversationId, at = new Date()) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_conversations
     SET last_quote_at = ?, last_message_at = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [at, at, conversationId],
  );
}

export async function touchLastMessageAt(conn, conversationId, at = new Date()) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_conversations
     SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [at, conversationId],
  );
}
