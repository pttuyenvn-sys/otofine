import { pool } from "../../../config/db.js";
import * as passwordService from "./password.service.js";
import * as tokenService from "./token.service.js";
import { authConfig } from "../config/auth.config.js";
import { generateOpaqueToken, hashToken } from "../utils/crypto.util.js";
// Slice 5: session governance delegator
import * as adminSessionService from "../../../modules/admin/core/adminSession/adminSession.service.js";

const GENERIC_FORGOT = {
  ok: true,
  message:
    "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.",
};

/**
 * Authenticate an admin and optionally create a session record.
 *
 * Slice 5 additions (additive only — existing credential/rehash logic unchanged):
 *   - Accepts optional ip + userAgent for session metadata capture.
 *   - If ADMIN_SESSION_GOVERNANCE_ENABLED: creates session, returns sid-bearing JWT
 *     and refreshToken in addition to the original { ok, token, admin } shape.
 *   - If flag disabled: creates session record best-effort (silent), returns
 *     original { ok, token, admin } shape — identical to pre-Slice 5 behavior.
 */
export async function loginAdmin({ email, password, ip = null, userAgent = null }) {
  if (!email || !password) {
    return { ok: false, status: 400, message: "Thiếu email hoặc mật khẩu" };
  }

  const [rows] = await pool.query("SELECT * FROM admin WHERE email = ? LIMIT 1", [
    email.trim().toLowerCase(),
  ]);
  if (!rows.length) {
    return { ok: false, status: 401, message: "Sai email hoặc mật khẩu" };
  }

  const admin = rows[0];
  const valid = await passwordService.verifyPassword(password, admin.passwordHash);
  if (!valid) {
    return { ok: false, status: 401, message: "Sai email hoặc mật khẩu" };
  }

  // [existing] Opportunistic bcrypt rehash if rounds are below current threshold
  try {
    const bcrypt = (await import("bcryptjs")).default;
    const rounds = bcrypt.getRounds(admin.passwordHash);
    if (rounds < authConfig.bcryptRounds) {
      const newHash = await passwordService.hashPassword(password);
      await pool.query("UPDATE admin SET passwordHash = ? WHERE id = ?", [
        newHash,
        admin.id,
      ]);
    }
  } catch {
    /* ignore rehash errors */
  }

  // [Slice 5] Session record creation — always attempted post-auth
  let sessionResult = null;
  try {
    sessionResult = await adminSessionService.createLoginSession(admin, { ip, userAgent });
  } catch (err) {
    console.error("[admin:session] session create failed:", err.message);
    // best-effort: login succeeds even if session recording fails
  }

  // Governance enabled + session created successfully → return sid-bearing JWT + refreshToken
  if (sessionResult?.sessionId) {
    return {
      ok:               true,
      token:            sessionResult.token,
      admin:            { id: admin.id, email: admin.email },
      refreshToken:     sessionResult.refreshToken,
      sessionId:        sessionResult.sessionId,
      sessionExpiresAt: sessionResult.expiresAt,
      sessionDeviceHint: sessionResult.deviceHint,
      sessionIp:        ip,
    };
  }

  // Governance disabled (or session creation failed) → original JWT, original shape
  const token = tokenService.signAdminAccessToken(admin);
  return {
    ok:    true,
    token,
    admin: { id: admin.id, email: admin.email },
  };
}

/** Admin forgot: never return plaintext password. */
export async function requestAdminPasswordReset(emailRaw) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email) return GENERIC_FORGOT;

  const [rows] = await pool.query("SELECT id FROM admin WHERE email = ? LIMIT 1", [
    email,
  ]);
  if (!rows.length) return GENERIC_FORGOT;

  const rawToken = generateOpaqueToken();
  if (authConfig.exposeResetToken) {
    return {
      ...GENERIC_FORGOT,
      resetToken: rawToken,
      note: "AUTH_EXPOSE_RESET_TOKEN=true — configure admin reset UI separately",
    };
  }
  return GENERIC_FORGOT;
}

// ---------------------------------------------------------------------------
// Slice 5: Delegator functions — thin wrappers around adminSession.service.js
// ---------------------------------------------------------------------------

/**
 * Rotate an admin refresh token (single-use rotation, fixed expiration).
 * Returns { ok, token?, refreshToken?, newSessionId?, oldSessionId?,
 *           adminId?, expiresAt?, status?, message?, suspicious?, sessionId? }
 */
export async function refreshAdminSession({ rawRefreshToken }) {
  return adminSessionService.refreshSession(rawRefreshToken);
}

/**
 * Self-logout: revoke the admin's own session by its DB id (sid).
 * Returns { ok, alreadyRevoked?, revokedSessionId?, session? }
 */
export async function logoutAdmin({ sid, adminId }) {
  if (!sid) return { ok: true, noSession: true };
  return adminSessionService.revokeSession(sid, { revokedBy: adminId, reason: "logout" });
}
