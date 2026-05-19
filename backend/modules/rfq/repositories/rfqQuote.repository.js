import { pool } from "../../../config/db.js";

export async function insertQuote(conn, row) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_quotes (rfq_request_id, dispatch_id, shop_id, status, price_amount, currency, note, line_type, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,NOW(3))`,
    [
      row.rfq_request_id,
      row.dispatch_id,
      row.shop_id,
      row.status ?? "submitted",
      row.price_amount,
      row.currency ?? "VND",
      row.note ?? null,
      row.line_type ?? "unknown",
    ],
  );
  return r.insertId;
}

export async function findQuoteByDispatchForUpdate(conn, dispatchId) {
  const [[row]] = await conn.query(
    `SELECT id FROM rfq_quotes WHERE dispatch_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
    [dispatchId],
  );
  return row || null;
}

export async function listQuotesForRequest(rfqRequestId) {
  const [rows] = await pool.query(
    `SELECT q.id, q.shop_id, q.price_amount, q.currency, q.note, q.line_type, q.submitted_at,
            s.name AS shop_name
     FROM rfq_quotes q
     LEFT JOIN shops s ON s.id = q.shop_id
     WHERE q.rfq_request_id = ? AND q.deleted_at IS NULL AND q.status = 'submitted'
     ORDER BY q.submitted_at ASC`,
    [rfqRequestId],
  );
  return rows;
}

export async function listQuotesForShopOnRequest(rfqRequestId, shopId) {
  const [rows] = await pool.query(
    `SELECT * FROM rfq_quotes
     WHERE rfq_request_id = ? AND shop_id = ? AND deleted_at IS NULL
     ORDER BY id DESC`,
    [rfqRequestId, shopId],
  );
  return rows;
}
