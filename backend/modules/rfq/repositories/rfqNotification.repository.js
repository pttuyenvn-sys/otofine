import { pool } from "../../../config/db.js";

export async function insertNotification(conn, row) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_notifications (rfq_request_id, dispatch_id, channel, recipient_type, recipient_shop_id, payload_json, status)
     VALUES (?,?,?,?,?,?,?)`,
    [
      row.rfq_request_id,
      row.dispatch_id ?? null,
      row.channel ?? "in_app",
      row.recipient_type ?? "shop",
      row.recipient_shop_id ?? null,
      JSON.stringify(row.payload_json ?? {}),
      row.status ?? "sent",
    ],
  );
  return r.insertId;
}
