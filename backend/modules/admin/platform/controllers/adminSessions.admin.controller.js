import { pool } from "../../../../config/db.js";
import { revokeSession } from "../../core/adminSession/adminSession.service.js";

/**
 * GET /api/admin/platform/sessions
 * Auth: requireAuth + requireAdmin + requireAdminSession + requirePermission('platform:read')
 *
 * Slice 1: No filtering, no pagination. Return all active sessions ordered by created_at desc.
 *
 * Response:
 *   { rows: SessionRow[] }
 *
 * SessionRow:
 *   - id (number)
 *   - adminId (number)
 *   - adminEmail (string|null)
 *   - ipAddress (string|null)
 *   - userAgent (string|null)
 *   - deviceHint (string|null)
 *   - createdAt (string|Date)
 *   - lastUsedAt (string|Date|null)
 *   - expiresAt (string|Date)
 *   - revokedAt (string|Date|null)
 */
export async function listActiveAdminSessions(req, res) {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          s.id                      AS id,
          s.admin_id                AS adminId,
          a.email                   AS adminEmail,
          s.ip_address              AS ipAddress,
          s.user_agent              AS userAgent,
          s.device_hint             AS deviceHint,
          s.created_at              AS createdAt,
          s.last_used_at            AS lastUsedAt,
          s.expires_at              AS expiresAt,
          s.revoked_at              AS revokedAt
        FROM admin_sessions s
        LEFT JOIN admin a ON a.id = s.admin_id
        WHERE s.revoked_at IS NULL AND s.expires_at > NOW()
        ORDER BY s.created_at DESC
      `,
    );

    return res.json({ rows: rows || [] });
  } catch (err) {
    console.error("[admin:sessions] listActiveAdminSessions error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/platform/sessions/:id/revoke
 * Body: { reason?: string }
 * Auth: requireAuth + requireAdmin + requireAdminSession + requirePermission('platform:read')
 *
 * Response:
 *   { ok: true, alreadyRevoked?: true }
 */
export async function revokeAdminSession(req, res) {
  try {
    const sid = Number(req.params.id);
    if (!Number.isFinite(sid) || sid <= 0) {
      return res.status(400).json({ error: "Invalid session id" });
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "force_logout";

    const result = await revokeSession(sid, {
      revokedBy: req.user?.id ?? null,
      reason: reason || "force_logout",
    });

    if (result.alreadyRevoked) {
      return res.json({ ok: true, alreadyRevoked: true });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin:sessions] revokeAdminSession error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

