import { pool } from "../config/db.js";

/**
 * GET /api/shop/notifications
 * Auth: requireAuth + requireShop
 * Query: limit (optional)
 *
 * Response: { rows: [...], unreadCount: n }
 */
export async function listShopNotifications(req, res) {
  try {
    const shopId = req.shop?.id;
    if (!shopId) return res.status(401).json({ error: "unauthenticated" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const [rows] = await pool.query(
      `SELECT id, type, title, body, is_read AS isRead, created_at AS createdAt FROM shop_notifications WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
      [shopId, limit],
    );
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS c FROM shop_notifications WHERE shop_id = ? AND is_read = 0`,
      [shopId],
    );
    const unreadCount = Number(countRow?.c || 0);
    return res.json({ rows: rows || [], unreadCount });
  } catch (err) {
    console.error("listShopNotifications error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/shop/notifications/:id/read
 * Marks single notification as read for the authenticated shop.
 */
export async function markNotificationRead(req, res) {
  try {
    const shopId = req.shop?.id;
    if (!shopId) return res.status(401).json({ error: "unauthenticated" });
    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "invalid id" });

    const [result] = await pool.query(
      `UPDATE shop_notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND shop_id = ?`,
      [id, shopId],
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("markNotificationRead error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

