import { pool } from "../../../config/db.js";

export async function insertSession(conn, row) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_history_sessions (
       phone_e164, phone_hash, token_hash, expires_at, last_seen_at
     ) VALUES (?,?,?,?,NOW(3))`,
    [row.phone_e164, row.phone_hash, row.token_hash, row.expires_at],
  );
  return r.insertId;
}

export async function findByTokenHash(tokenHash) {
  const [[row]] = await pool.query(
    `SELECT * FROM rfq_history_sessions
     WHERE token_hash = ? AND expires_at > NOW(3)
     LIMIT 1`,
    [tokenHash],
  );
  return row || null;
}

export async function touchSession(id) {
  await pool.query(
    `UPDATE rfq_history_sessions SET last_seen_at = NOW(3) WHERE id = ?`,
    [id],
  );
}

export async function deleteSessionByTokenHash(tokenHash) {
  await pool.query(`DELETE FROM rfq_history_sessions WHERE token_hash = ?`, [tokenHash]);
}

export async function deleteExpiredSessions() {
  const [r] = await pool.query(`DELETE FROM rfq_history_sessions WHERE expires_at <= NOW(3)`);
  return r.affectedRows ?? 0;
}
