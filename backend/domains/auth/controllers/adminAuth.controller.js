import * as adminAuthService from "../services/adminAuth.service.js";
// Slice 5: logAdminAction for session audit events (controller owns req)
import { logAdminAction } from "../../../modules/admin/index.js";

// ---------------------------------------------------------------------------
// Existing handlers (PRESERVED — no logic changes)
// ---------------------------------------------------------------------------

export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    // Slice 5: pass ip + userAgent for session metadata capture
    const ip        = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.ip ?? null;
    const userAgent = req.headers["user-agent"] ?? null;

    const result = await adminAuthService.loginAdmin({ email, password, ip, userAgent });
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    // Slice 5: audit log session.created (controller — has req context)
    if (result.sessionId) {
      logAdminAction({
        adminId:    result.admin.id,
        action:     "session.created",
        targetType: "admin_sessions",
        targetId:   result.sessionId,
        before:     null,
        after: {
          session_id:  result.sessionId,
          admin_id:    result.admin.id,
          ip:          result.sessionIp,
          device_hint: result.sessionDeviceHint ?? null,
          expires_at:  result.sessionExpiresAt ?? null,
        },
        req,
      }).catch(() => {});
    }

    res.json({
      token: result.token,
      admin: result.admin,
      ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
    });
  } catch (err) {
    console.error("adminLogin error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function adminForgotPassword(req, res) {
  try {
    const { email } = req.body;
    const result = await adminAuthService.requestAdminPasswordReset(email);
    res.json(result);
  } catch (err) {
    console.error("adminForgotPassword:", err);
    res.status(500).json({ error: "Không thể xử lý yêu cầu" });
  }
}

// ---------------------------------------------------------------------------
// Slice 5: New handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/admin-refresh
 * Rotate an admin refresh token (single-use, fixed expiration).
 * No requireAuth — client presents the opaque refresh token in the body.
 */
export async function adminRefresh(req, res) {
  try {
    const rawRefreshToken = req.body?.refreshToken;
    const result = await adminAuthService.refreshAdminSession({ rawRefreshToken });

    if (!result.ok) {
      // Log suspicious reuse events (best-effort)
      if (result.suspicious) {
        logAdminAction({
          adminId:    result.adminId ?? 0,
          action:     "session.suspicious_refresh_reuse",
          targetType: "admin_sessions",
          targetId:   result.sessionId ?? null,
          before:     { session_id: result.sessionId ?? null, admin_id: result.adminId ?? null },
          after:      null,
          req,
        }).catch(() => {});
      }
      return res.status(result.status ?? 401).json({ error: result.message });
    }

    // Audit: session.refresh (best-effort)
    logAdminAction({
      adminId:    result.adminId,
      action:     "session.refresh",
      targetType: "admin_sessions",
      targetId:   result.newSessionId,
      before:     { old_session_id: result.oldSessionId },
      after:      { new_session_id: result.newSessionId, expires_at: result.expiresAt },
      req,
    }).catch(() => {});

    res.json({ token: result.token, refreshToken: result.refreshToken });
  } catch (err) {
    console.error("adminRefresh error:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
}

/**
 * POST /api/auth/admin-logout
 * Revoke the admin's own session.
 * requireAuth is applied in the route (must have a valid JWT).
 * Always returns 200 — even if no session exists or sid is absent.
 */
export async function adminLogout(req, res) {
  try {
    const sid     = req.user?.sid ?? null;
    const adminId = req.user?.id  ?? null;

    const result = await adminAuthService.logoutAdmin({ sid, adminId });

    // Audit: session.logout (best-effort) — only when a session was actually revoked
    if (result.ok && result.revokedSessionId && result.session) {
      logAdminAction({
        adminId:    adminId,
        action:     "session.logout",
        targetType: "admin_sessions",
        targetId:   result.revokedSessionId,
        before: {
          session_id: result.revokedSessionId,
          created_at: result.session.created_at ?? null,
          ip:         result.session.ip_address ?? null,
        },
        after: null,
        req,
      }).catch(() => {});
    }

    // Always 200 — logout is unconditional from the UX perspective
    res.json({ message: "Logged out" });
  } catch (err) {
    console.error("adminLogout error:", err);
    // Still return 200 on unexpected errors — logout intent must be honored
    res.json({ message: "Logged out" });
  }
}
