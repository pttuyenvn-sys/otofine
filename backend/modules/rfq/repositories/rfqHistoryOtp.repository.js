import { pool } from "../../../config/db.js";

export async function upsertChallenge(conn, row) {
  const c = conn || pool;
  await c.query(
    `INSERT INTO rfq_history_otp_challenges (
       phone_e164, phone_hash, otp_code_hash, otp_expires_at, otp_attempts
     ) VALUES (?,?,?,?,0)
     ON DUPLICATE KEY UPDATE
       otp_code_hash = VALUES(otp_code_hash),
       otp_expires_at = VALUES(otp_expires_at),
       otp_attempts = 0,
       updated_at = CURRENT_TIMESTAMP(3)`,
    [row.phone_e164, row.phone_hash, row.otp_code_hash, row.otp_expires_at],
  );
}

export async function findChallengeByPhoneHash(phoneHash, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT * FROM rfq_history_otp_challenges WHERE phone_hash = ? LIMIT 1`,
    [phoneHash],
  );
  return row || null;
}

export async function bumpChallengeAttempt(conn, id) {
  const c = conn || pool;
  await c.query(
    `UPDATE rfq_history_otp_challenges
     SET otp_attempts = otp_attempts + 1, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [id],
  );
}

export async function deleteChallengeByPhoneHash(conn, phoneHash) {
  const c = conn || pool;
  await c.query(`DELETE FROM rfq_history_otp_challenges WHERE phone_hash = ?`, [phoneHash]);
}
