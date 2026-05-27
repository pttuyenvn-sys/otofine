/**
 * Admin Session Governance Service — Slice 5
 *
 * Handles session creation, refresh-token rotation, and revocation for admin logins.
 * All session records use SHA-256 hashed tokens — plaintext never reaches the DB.
 *
 * Redis key format: admin:session:revoked:{sid}  (integer — admin_sessions.id)
 * Redis TTL:        Math.min(sessionRemainingMs, JWT_ACCESS_TTL_MS)
 *
 * No startup side effects: no module-load DB/Redis connections, no scheduled jobs.
 */

import jwt from "jsonwebtoken";
import { pool } from "../../../../config/db.js";
import { generateOpaqueToken, hashToken } from "../../../../domains/auth/utils/crypto.util.js";
import { getRaw, setRaw } from "../../../../services/redisCache.service.js";
import { isFeatureEnabled } from "../featureFlags/featureFlag.service.js";
import { adminPlatformConfig } from "../../config/adminPlatform.config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a duration string ("7d", "4h", "30m", "60s") to milliseconds.
 * Falls back to defaultMs if parsing fails or input is empty.
 */
function parseDurationMs(str, defaultMs = 7 * 24 * 60 * 60 * 1000) {
  if (!str || typeof str !== "string") return defaultMs;
  const match = str.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/i);
  if (!match) return defaultMs;
  const n = parseFloat(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  switch (unit) {
    case "ms": return n;
    case "s":  return n * 1_000;
    case "m":  return n * 60_000;
    case "h":  return n * 3_600_000;
    case "d":  return n * 86_400_000;
    case "w":  return n * 604_800_000;
    default:   return defaultMs;
  }
}

/**
 * Derive a short human-readable device hint from a user-agent string.
 * Informational only — never used for auth decisions.
 */
function deriveDeviceHint(ua) {
  if (!ua) return null;
  const browser =
    /Edg\/(\d+)/.test(ua)                    ? `Edge ${ua.match(/Edg\/(\d+)/)[1]}`
    : /Chrome\/(\d+)/.test(ua)               ? `Chrome ${ua.match(/Chrome\/(\d+)/)[1]}`
    : /Firefox\/(\d+)/.test(ua)              ? `Firefox ${ua.match(/Firefox\/(\d+)/)[1]}`
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari"
    : null;
  const os =
    /Windows/.test(ua)          ? "Windows"
    : /Mac OS/.test(ua)         ? "macOS"
    : /Android/.test(ua)        ? "Android"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Linux/.test(ua)          ? "Linux"
    : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" on ").slice(0, 255) : null;
}

/**
 * Sign a new admin access JWT that includes the session `sid`.
 * Uses the same secret and admin-specific TTL env vars as token.service.js.
 * Falls back to AUTH_ACCESS_EXPIRES for backward compatibility.
 */
export function signAdminSessionToken(admin, sessionId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const expiresIn =
    process.env.AUTH_ADMIN_ACCESS_EXPIRES ||
    process.env.AUTH_ACCESS_EXPIRES ||
    "7d";
  return jwt.sign(
    { id: admin.id, role: "admin", email: admin.email, sid: sessionId },
    secret,
    { expiresIn },
  );
}

/**
 * Compute the Redis blocklist TTL for a session revocation event.
 * Capped at the JWT access token lifetime — entries only need to persist
 * until all JWTs carrying this sid have expired.
 */
function revocationTtlMs(sessionExpiresAt) {
  const JWT_TTL_MS = parseDurationMs(
    process.env.AUTH_ADMIN_ACCESS_EXPIRES ||
    process.env.AUTH_ACCESS_EXPIRES ||
    "7d",
  );
  const sessionRemainingMs = Math.max(
    0,
    new Date(sessionExpiresAt).getTime() - Date.now(),
  );
  return Math.min(sessionRemainingMs, JWT_TTL_MS);
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

/**
 * Create a new admin session record on login.
 *
 * Checks ADMIN_SESSION_GOVERNANCE_ENABLED:
 * - Enabled:  creates session with refresh token, returns session data for sid-bearing JWT.
 * - Disabled: creates session record without refresh token (best-effort, silent),
 *             returns null so loginAdmin falls back to the original signAdminAccessToken path.
 *
 * @param {object} admin - { id, email }
 * @param {object} meta  - { ip, userAgent }
 * @returns {Promise<{sessionId, token, refreshToken, expiresAt, deviceHint}|null>}
 */
export async function createLoginSession(admin, { ip = null, userAgent = null } = {}) {
  let governanceEnabled = false;
  try {
    governanceEnabled = await isFeatureEnabled("ADMIN_SESSION_GOVERNANCE_ENABLED");
  } catch {
    governanceEnabled = adminPlatformConfig.sessionGovernanceEnabled ?? false;
  }

  const sessionToken     = generateOpaqueToken();
  const sessionTokenHash = hashToken(sessionToken);
  const deviceHint       = deriveDeviceHint(userAgent);
  const uaStored         = (userAgent || "").slice(0, 512) || null;

  const expiresInMs = parseDurationMs(
    process.env.AUTH_ADMIN_REFRESH_EXPIRES ||
    process.env.AUTH_REFRESH_EXPIRES ||
    "30d",
    30 * 24 * 3600 * 1000,
  );
  const expiresAt = new Date(Date.now() + expiresInMs);

  if (governanceEnabled) {
    const refreshToken     = generateOpaqueToken();
    const refreshTokenHash = hashToken(refreshToken);

    const [result] = await pool.query(
      `INSERT INTO admin_sessions
         (admin_id, session_token_hash, refresh_token_hash, ip_address, user_agent, device_hint, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [admin.id, sessionTokenHash, refreshTokenHash, ip, uaStored, deviceHint, expiresAt],
    );

    const sessionId = Number(result.insertId);
    const token     = signAdminSessionToken(admin, sessionId);

    return { sessionId, token, refreshToken, expiresAt, deviceHint };
  }

  // Governance disabled: best-effort silent record (no refresh token)
  try {
    await pool.query(
      `INSERT INTO admin_sessions
         (admin_id, session_token_hash, refresh_token_hash, ip_address, user_agent, device_hint, expires_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
      [admin.id, sessionTokenHash, ip, uaStored, deviceHint, expiresAt],
    );
  } catch (err) {
    console.error("[admin:session] session create failed (governance off):", err.message);
  }

  return null; // caller uses original signAdminAccessToken path
}

// ---------------------------------------------------------------------------
// Refresh token rotation
// ---------------------------------------------------------------------------

/**
 * Rotate a refresh token: revoke the old session, issue a new one.
 *
 * Concurrency safety: uses UPDATE … WHERE revoked_at IS NULL and checks
 * affectedRows. If affectedRows = 0, a concurrent request already rotated
 * (or the token is replayed) — treated as suspicious reuse.
 *
 * Fixed expiration: new session inherits original session's expires_at.
 *
 * @returns {Promise<{ok, status?, message?, suspicious?, sessionId?, adminId?,
 *                    token?, refreshToken?, newSessionId?, expiresAt?, oldSessionId?}>}
 */
export async function refreshSession(rawRefreshToken) {
  if (!rawRefreshToken) {
    return { ok: false, status: 401, message: "Refresh token required" };
  }

  const tokenHash = hashToken(rawRefreshToken);

  const [rows] = await pool.query(
    `SELECT id, admin_id, revoked_at, expires_at
     FROM admin_sessions
     WHERE refresh_token_hash = ?`,
    [tokenHash],
  );

  if (!rows.length) {
    return { ok: false, status: 401, message: "Invalid refresh token" };
  }

  const session = rows[0];

  // Reuse detection: token was already revoked (single-use enforcement)
  if (session.revoked_at !== null) {
    return {
      ok: false,
      status: 401,
      message: "Invalid refresh token",
      suspicious: true,
      sessionId: session.id,
      adminId:   session.admin_id,
    };
  }

  // Session expired
  if (new Date(session.expires_at) <= new Date()) {
    return { ok: false, status: 401, message: "Session expired" };
  }

  // Verify admin still exists (existence only — no status field confirmed)
  const [adminRows] = await pool.query(
    "SELECT id, email FROM admin WHERE id = ? LIMIT 1",
    [session.admin_id],
  );
  if (!adminRows.length) {
    return { ok: false, status: 401, message: "Admin not found" };
  }
  const admin = adminRows[0];

  // Atomic revocation of old session
  const [revResult] = await pool.query(
    `UPDATE admin_sessions
     SET revoked_at = NOW(), revoked_reason = 'refresh_rotation', last_used_at = NOW()
     WHERE id = ? AND revoked_at IS NULL`,
    [session.id],
  );

  if (revResult.affectedRows === 0) {
    // Concurrent race or replay — treat identically to reuse detection
    return {
      ok: false,
      status: 401,
      message: "Session already revoked",
      suspicious: true,
      sessionId: session.id,
      adminId:   session.admin_id,
    };
  }

  // Issue new session (FIXED expiration: inherit original expires_at)
  const newSessionToken     = generateOpaqueToken();
  const newSessionTokenHash = hashToken(newSessionToken);
  const newRefreshToken     = generateOpaqueToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);

  // Copy ip, ua, device_hint, expires_at from old session row
  const [insertResult] = await pool.query(
    `INSERT INTO admin_sessions
       (admin_id, session_token_hash, refresh_token_hash, ip_address, user_agent, device_hint, expires_at, last_used_at)
     SELECT admin_id, ?, ?, ip_address, user_agent, device_hint, expires_at, NOW()
     FROM admin_sessions
     WHERE id = ?`,
    [newSessionTokenHash, newRefreshTokenHash, session.id],
  );

  const newSessionId = Number(insertResult.insertId);
  const newToken     = signAdminSessionToken(admin, newSessionId);

  return {
    ok:           true,
    token:        newToken,
    refreshToken: newRefreshToken,
    newSessionId,
    oldSessionId: session.id,
    adminId:      session.admin_id,
    expiresAt:    session.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Session revocation
// ---------------------------------------------------------------------------

/**
 * Revoke a specific session by its DB id (sid).
 * Writes Redis blocklist entry capped at JWT access token lifetime.
 *
 * @param {number} sid
 * @param {{ revokedBy?: number|null, reason?: string }} opts
 * @returns {Promise<{ok, alreadyRevoked?, session?}>}
 */
export async function revokeSession(sid, { revokedBy = null, reason = "logout" } = {}) {
  // SELECT first to get metadata for audit snapshot and TTL calculation
  const [rows] = await pool.query(
    "SELECT id, admin_id, created_at, ip_address, expires_at FROM admin_sessions WHERE id = ?",
    [sid],
  );

  if (!rows.length) {
    return { ok: true, alreadyRevoked: true, session: null };
  }

  const session = rows[0];

  const [result] = await pool.query(
    `UPDATE admin_sessions
     SET revoked_at = NOW(), revoked_reason = ?, revoked_by = ?
     WHERE id = ? AND revoked_at IS NULL`,
    [reason, revokedBy, sid],
  );

  if (result.affectedRows === 0) {
    return { ok: true, alreadyRevoked: true, session };
  }

  // Write Redis blocklist (TTL capped at JWT access token lifetime)
  const ttlMs = revocationTtlMs(session.expires_at);
  if (ttlMs > 0) {
    setRaw(`admin:session:revoked:${sid}`, "1", ttlMs).catch(() => {});
  }

  return { ok: true, revokedSessionId: sid, session };
}

/**
 * Revoke all active sessions for an admin.
 * Used for security events (token theft, force-logout-all).
 *
 * @param {number} adminId
 * @param {{ revokedBy?: number|null, reason?: string }} opts
 * @returns {Promise<{ok, revokedCount}>}
 */
export async function revokeAllSessionsForAdmin(adminId, { revokedBy = null, reason = "all_sessions" } = {}) {
  const [rows] = await pool.query(
    `SELECT id, expires_at
     FROM admin_sessions
     WHERE admin_id = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [adminId],
  );

  if (!rows.length) return { ok: true, revokedCount: 0 };

  await pool.query(
    `UPDATE admin_sessions
     SET revoked_at = NOW(), revoked_reason = ?, revoked_by = ?
     WHERE admin_id = ? AND revoked_at IS NULL`,
    [reason, revokedBy, adminId],
  );

  for (const row of rows) {
    const ttlMs = revocationTtlMs(row.expires_at);
    if (ttlMs > 0) {
      setRaw(`admin:session:revoked:${row.id}`, "1", ttlMs).catch(() => {});
    }
  }

  return { ok: true, revokedCount: rows.length };
}
