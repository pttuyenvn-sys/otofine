import { pool } from "../config/db.js";

/**
 * Lấy danh sách shop (admin)
 */
export async function getAllShops(req, res) {
  const [rows] = await pool.query(`
    SELECT 
      id, shopId, name, email, phone,
      status, createdAt, approvedAt, approvedByAdminId
    FROM Shop
    WHERE status != 'deleted'
    ORDER BY createdAt DESC
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
    UPDATE Shop
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
  const [[shop]] = await pool.query("SELECT status FROM Shop WHERE id = ?", [
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

  await pool.query("UPDATE Shop SET status = 'deleted' WHERE id = ?", [id]);

  res.json({ ok: true });
}
