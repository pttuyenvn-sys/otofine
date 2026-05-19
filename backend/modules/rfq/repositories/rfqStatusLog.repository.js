import { pool } from "../../../config/db.js";

export async function insertLog(conn, row) {
  const c = conn || pool;
  await c.query(
    `INSERT INTO rfq_status_logs (rfq_request_id, from_status, to_status, actor_type, actor_shop_id, metadata_json)
     VALUES (?,?,?,?,?,?)`,
    [
      row.rfq_request_id,
      row.from_status ?? null,
      row.to_status,
      row.actor_type ?? "system",
      row.actor_shop_id ?? null,
      row.metadata_json ? JSON.stringify(row.metadata_json) : null,
    ],
  );
}
