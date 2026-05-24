import { pool } from "../../../config/db.js";

export async function createResetToken({
  accountId,
  tokenHash,
  expiresAt,
  ipAddress = null,
}) {
  await pool.query(
    `INSERT INTO password_reset_tokens (account_id, token_hash, expires_at, ip_address)
     VALUES (?, ?, ?, ?)`,
    [accountId, tokenHash, expiresAt, ipAddress],
  );
}

export async function findValidResetByHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT id, account_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function markResetUsed(id) {
  await pool.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?",
    [id],
  );
}

export async function invalidateAccountResets(accountId) {
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE account_id = ? AND used_at IS NULL`,
    [accountId],
  );
}
