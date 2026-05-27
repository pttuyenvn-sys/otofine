import { pool } from "../config/db.js";

/**
 * Lấy danh sách shop (admin)
 */
export async function getAllShops(req, res) {
  const [rows] = await pool.query(`
    SELECT
      sa.id, sa.shopId, sa.name, sa.email, sa.phone,
      sa.status, sa.createdAt, sa.approvedAt, sa.approvedByAdminId,
      s.id AS governanceShopId,
      s.public_status AS shopPublicStatus
    FROM shop_accounts sa
    LEFT JOIN shops s ON s.accountId = sa.id
    WHERE sa.status != 'deleted'
    ORDER BY sa.createdAt DESC
  `);

  res.json(rows);
}

/**
 * Duyệt / Khóa shop
 * status: active | blocked
 */
export async function updateShopStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "blocked"].includes(status)) {
    return res.status(400).json({ message: "Status không hợp lệ" });
  }

  // Không cho admin tự khóa shop của mình (nếu có bảng Admin ↔ Shop)
  // (có thể bỏ nếu bạn không cần)
  await pool.query(
    `
    UPDATE shop_accounts
    SET 
      status = ?,
      approvedAt = CASE WHEN ? = 'active' THEN NOW() ELSE approvedAt END,
      approvedByAdminId = CASE WHEN ? = 'active' THEN ? ELSE approvedByAdminId END
    WHERE id = ?
    `,
    [status, status, status, req.user.id, id]
  );

  res.json({ ok: true });
}

/**
 * Xóa shop (xóa mềm)
 */
export async function deleteShop(req, res) {
  const { id } = req.params;

  // Không cho xóa shop đang active (bắt buộc phải khóa trước)
  const [[shop]] = await pool.query("SELECT status FROM shop_accounts WHERE id = ?", [
    id,
  ]);

  if (!shop) {
    return res.status(404).json({ message: "Shop không tồn tại" });
  }

  if (shop.status === "active") {
    return res.status(400).json({
      message: "Phải khóa shop trước khi xóa",
    });
  }

  await pool.query("UPDATE shop_accounts SET status = 'deleted' WHERE id = ?", [id]);

  res.json({ ok: true });
}
