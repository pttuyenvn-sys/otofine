import { pool } from "../../../../config/db.js";

function computeSeverity(action) {
  if (!action) return "info";
  if (action === "shop.suspend" || action === "shop.delete") return "critical";
  if (
    action.startsWith("rbac.") ||
    action.startsWith("risk.") ||
    action.startsWith("moderation.")
  ) {
    return "warning";
  }
  return "info";
}

/**
 * GET /api/admin/platform/audit-log
 * Auth: requireAuth + requireAdmin + requireAdminSession + requirePermission('audit_log:read')
 *
 * Slice 3: Lightweight filtering + pagination.
 *
 * Response:
 *   { rows: AuditRow[], page, limit, total }
 *
 * AuditRow fields (subset; stable for UI):
 *   - id (number)
 *   - createdAt (string | Date, MySQL DATETIME(3))
 *   - adminId (number|null)
 *   - actorType (string)
 *   - actorEmail (string|null)
 *   - action (string)
 *   - targetType (string|null)
 *   - targetId (number|null)
 *   - permissionChecked (string|null)
 *   - ipAddress (string|null)
 *   - userAgent (string|null)
 *   - beforeJson (object|null)
 *   - afterJson (object|null)
 *   - metadataJson (object|null)
 *   - severity ('info'|'warning'|'critical') — computed from action (not stored in DB)
 */
export async function listAuditLog(req, res) {
  try {
    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;
    const offset = (page - 1) * limit;

    const severity = typeof req.query.severity === "string" ? req.query.severity.trim() : "";
    const actor = typeof req.query.actor === "string" ? req.query.actor.trim() : "";
    const action = typeof req.query.action === "string" ? req.query.action.trim() : "";

    const where = [];
    const params = [];

    // Actor filter: search by admin email (preferred) or adminId string match as fallback.
    if (actor) {
      where.push("(a.email LIKE ? OR CAST(aal.admin_id AS CHAR) LIKE ?)");
      params.push(`%${actor}%`, `%${actor}%`);
    }

    // Action filter: substring match.
    if (action) {
      where.push("(aal.action LIKE ?)");
      params.push(`%${action}%`);
    }

    // Severity filter: derived from action naming conventions.
    if (severity === "critical") {
      where.push("(aal.action IN ('shop.suspend','shop.delete'))");
    } else if (severity === "warning") {
      where.push(
        "(aal.action LIKE 'rbac.%' OR aal.action LIKE 'risk.%' OR aal.action LIKE 'moderation.%')",
      );
    } else if (severity === "info") {
      where.push(
        "(aal.action NOT IN ('shop.suspend','shop.delete') AND aal.action NOT LIKE 'rbac.%' AND aal.action NOT LIKE 'risk.%' AND aal.action NOT LIKE 'moderation.%')",
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [[countRow]] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM admin_audit_log aal
        LEFT JOIN admin a ON a.id = aal.admin_id
        ${whereSql}
      `,
      params,
    );

    const [rows] = await pool.query(
      `
        SELECT
          aal.id,
          aal.created_at           AS createdAt,
          aal.admin_id             AS adminId,
          aal.actor_type           AS actorType,
          a.email                  AS actorEmail,
          aal.action               AS action,
          aal.target_type          AS targetType,
          aal.target_id            AS targetId,
          aal.permission_checked   AS permissionChecked,
          aal.ip_address           AS ipAddress,
          aal.user_agent           AS userAgent,
          aal.before_json          AS beforeJson,
          aal.after_json           AS afterJson,
          aal.metadata_json        AS metadataJson
        FROM admin_audit_log aal
        LEFT JOIN admin a ON a.id = aal.admin_id
        ${whereSql}
        ORDER BY aal.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    const outRows = (rows || []).map((r) => ({
      ...r,
      severity: computeSeverity(r.action),
    }));

    return res.json({
      rows: outRows,
      page,
      limit,
      total: Number(countRow?.total ?? 0),
    });
  } catch (err) {
    console.error("[admin:audit] listAuditLog error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

