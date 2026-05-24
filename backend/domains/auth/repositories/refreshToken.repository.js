import { pool } from "../../../config/db.js";

export async function insertRefreshToken({
  accountId,
  tokenHash,
  expiresAt,
  userAgent,
  ip,
}) {
  const [result] = await pool.query(
    `INSERT INTO shop_refresh_tokens (account_id, token_hash, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?)`,
    [accountId, tokenHash, expiresAt, userAgent ?? null, ip ?? null],
  );
  return result.insertId;
}

export async function findValidRefreshByHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT id, account_id, expires_at
     FROM shop_refresh_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function revokeRefreshByHash(tokenHash) {
  await pool.query(
    `UPDATE shop_refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash],
  );
}

export async function revokeAllForAccount(accountId) {
  await pool.query(
    `UPDATE shop_refresh_tokens SET revoked_at = NOW()
     WHERE account_id = ? AND revoked_at IS NULL`,
    [accountId],
  );
}
