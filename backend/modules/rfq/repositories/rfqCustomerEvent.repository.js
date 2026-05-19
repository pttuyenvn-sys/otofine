import { pool } from "../../../config/db.js";

export async function insertCustomerEvent(conn, { rfq_request_id, event_type, metadata_json }) {
  const c = conn || pool;
  await c.query(
    `INSERT INTO rfq_customer_events (rfq_request_id, event_type, metadata_json)
     VALUES (?,?,?)`,
    [rfq_request_id, event_type.slice(0, 48), metadata_json ? JSON.stringify(metadata_json) : null],
  );
}
