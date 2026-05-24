import { pool } from "../../../config/db.js";

export async function createResetToken({ accountId, tokenHash, expiresAt }) {
  await pool.query(
    `INSERT INTO shop_password_reset_tokens (account_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [accountId, tokenHash, expiresAt],
  );
}

export async function findValidResetByHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT id, account_id, expires_at, used_at
     FROM shop_password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function markResetUsed(id) {
  await pool.query(
    "UPDATE shop_password_reset_tokens SET used_at = NOW() WHERE id = ?",
    [id],
  );
}

export async function invalidateAccountResets(accountId) {
  await pool.query(
    `UPDATE shop_password_reset_tokens SET used_at = NOW()
     WHERE account_id = ? AND used_at IS NULL`,
    [accountId],
  );
}
