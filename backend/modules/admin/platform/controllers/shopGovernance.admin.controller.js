import { pool } from "../../../../config/db.js";
import { listNotes } from "../../core/enforcement/moderationNote.service.js";
import { executeShopGovernanceAction } from "../../../../modules/governance/services/governanceAction.service.js";

/**
 * GET /api/admin/platform/shops/:id/governance
 * Read-only aggregated shop governance view.
 */
export async function getShopGovernance(req, res) {
  try {
    const shopId = Number(req.params?.id);
    if (!Number.isFinite(shopId) || shopId <= 0) return res.status(400).json({ error: "invalid shop id" });

    // Overview: basic shop row
    const [[shopRow]] = await pool.query(
      `SELECT id, slug, name, public_status, verified_at, published_at, createdAt FROM shops WHERE id = ? LIMIT 1`,
      [shopId],
    );
    if (!shopRow) return res.status(404).json({ error: "shop not found" });

    // Moderation stats for this shop
    const [[modStats]] = await pool.query(
      `
      SELECT
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'pending_review' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM products p
      WHERE p.shopId = ?
    `,
      [shopId],
    );

    // Risk metrics for this shop (flag score buckets)
    const FLAG_WEIGHT_SQL = `
      CASE rf.flag_code
        WHEN 'HIGH_REJECT_RATE' THEN 50
        WHEN 'NEW_SHOP_HIGH_VOLUME' THEN 40
        WHEN 'DUPLICATE_PART_NUMBER' THEN 25
        WHEN 'TOO_MANY_PENDING' THEN 20
        WHEN 'LOW_IMAGE_COUNT' THEN 10
        WHEN 'NO_DESCRIPTION' THEN 10
        WHEN 'SUSPICIOUS_PRICE' THEN 20
        ELSE 0
      END
    `;
    const [riskRows] = await pool.query(
      `
      SELECT
        SUM(CASE WHEN COALESCE(flag_score,0) >= 80 THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN COALESCE(flag_score,0) >= 50 AND COALESCE(flag_score,0) < 80 THEN 1 ELSE 0 END) AS high,
        SUM(CASE WHEN COALESCE(flag_score,0) >= 25 AND COALESCE(flag_score,0) < 50 THEN 1 ELSE 0 END) AS medium,
        SUM(CASE WHEN COALESCE(flag_score,0) < 25 THEN 1 ELSE 0 END) AS low
      FROM products p
      LEFT JOIN (
        SELECT rf.product_id, SUM(${FLAG_WEIGHT_SQL}) AS flag_score
        FROM product_risk_flags rf
        GROUP BY rf.product_id
      ) pf ON pf.product_id = p.id
      WHERE p.shopId = ?
    `,
      [shopId],
    );
    const risk = riskRows && riskRows[0] ? riskRows[0] : { critical: 0, high: 0, medium: 0, low: 0 };

    // Recent moderation activity for this shop (product events)
    const [recent] = await pool.query(
      `
      SELECT e.id, e.product_id AS productId, a.email AS moderatorEmail, e.old_status AS oldStatus, e.new_status AS newStatus, e.reject_reason AS rejectReason, e.notes AS notes, e.created_at AS createdAt
      FROM product_moderation_events e
      LEFT JOIN admin a ON a.id = e.moderator_admin_id
      JOIN products p ON p.id = e.product_id
      WHERE p.shopId = ?
      ORDER BY e.created_at DESC
      LIMIT 50
    `,
      [shopId],
    );

    // Timeline: merge recent events and admin notes (admin notes target_type='shop')
    const notes = await listNotes({ target_type: "shop", target_id: shopId });
    // normalize timeline entries
    const timeline = [
      ...(recent || []).map((r) => ({ type: "event", ts: r.createdAt, data: r })),
      ...(notes || []).map((n) => ({ type: "note", ts: n.created_at || n.createdAt || null, data: n })),
    ].sort((a, b) => {
      const ta = new Date(a.ts).getTime() || 0;
      const tb = new Date(b.ts).getTime() || 0;
      return tb - ta;
    }).slice(0, 200);

    // Internal notes (admin_only)
    const internalNotes = notes || [];

    return res.json({
      overview: shopRow,
      moderation: modStats || { pending: 0, approved: 0, rejected: 0 },
      risk,
      recentActivity: recent || [],
      timeline,
      internalNotes,
    });
  } catch (err) {
    console.error("[admin:shops:governance] getShopGovernance error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}


/**
 * POST /api/admin/platform/shops/:id/governance/actions
 * Body: { action, note?, idempotencyKey? }
 */
export async function postShopGovernanceAction(req, res) {
  try {
    const shopId = Number(req.params?.id);
    if (!Number.isFinite(shopId) || shopId <= 0) return res.status(400).json({ error: "invalid shop id" });
    const action = typeof req.body?.action === "string" ? req.body.action.trim() : "";
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    const idempotencyKey =
      typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : null;
    const allowed = new Set(["force_private", "require_re_review", "suspend_uploads", "add_note"]);
    if (!allowed.has(action)) return res.status(400).json({ error: "invalid action" });

    const result = await executeShopGovernanceAction({
      shopId,
      action,
      note,
      adminId: req.user?.id ?? null,
      idempotencyKey,
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[admin:shops:governance] postShopGovernanceAction error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
