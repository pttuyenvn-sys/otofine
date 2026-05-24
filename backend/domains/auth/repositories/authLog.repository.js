import { pool } from "../../../config/db.js";

export async function insertAuthLog({
  accountId = null,
  eventType,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) {
  const metaJson = metadata != null ? JSON.stringify(metadata) : null;
  await pool.query(
    `INSERT INTO auth_logs (account_id, event_type, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?)`,
    [accountId, eventType, ipAddress, userAgent, metaJson],
  );
}
