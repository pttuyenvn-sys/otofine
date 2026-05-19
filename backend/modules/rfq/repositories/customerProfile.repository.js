import { pool } from "../../../config/db.js";

export async function upsertVerifiedProfile(conn, { phoneE164, phoneHash }) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO customer_profiles (phone_e164, phone_hash, verified_at, status)
     VALUES (?, ?, NOW(3), 'active')
     ON DUPLICATE KEY UPDATE
       verified_at = NOW(3),
       status = 'active',
       updated_at = CURRENT_TIMESTAMP(3)`,
    [phoneE164, phoneHash],
  );
  if (r.insertId) return r.insertId;
  const [[row]] = await c.query(
    `SELECT id FROM customer_profiles WHERE phone_e164 = ? LIMIT 1`,
    [phoneE164],
  );
  return row?.id ?? null;
}

export async function findProfileByPhone(phoneE164) {
  const [[row]] = await pool.query(
    `SELECT id FROM customer_profiles WHERE phone_e164 = ? LIMIT 1`,
    [phoneE164],
  );
  return row || null;
}
