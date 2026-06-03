import { pool } from "../config/db.js";
import { deleteAdminShop } from "../services/adminShopDelete.service.js";
import { getAdminShopDetail } from "../services/adminShopDetail.service.js";
import {
  hasOperationalQuery,
  listAdminShops,
  listAdminShopsLegacyArray,
  parseAdminShopListQuery,
} from "../services/adminShopList.service.js";

/**
 * Lấy danh sách shop (admin)
 *
 * Row `id` is shop_accounts.id (legacy approve/block/delete).
 * `governanceShopId` is shops.id — use that for enforcement / platform governance APIs.
 */
export async function getAllShops(req, res) {
  try {
    if (hasOperationalQuery(req.query)) {
      const result = await listAdminShops(parseAdminShopListQuery(req.query));
      return res.json(result);
    }
    const rows = await listAdminShopsLegacyArray();
    return res.json(rows);
  } catch (err) {
    console.error("[admin:getAllShops]", err);
    return res.status(500).json({ message: "Không thể tải danh sách shop" });
  }
}

/**
 * Aggregated admin shop drawer payload.
 * :id is shop_accounts.id (legacy admin list id).
 */
export async function getShopDetail(req, res) {
  try {
    const detail = await getAdminShopDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ message: "Shop không tồn tại" });
    }
    return res.json(detail);
  } catch (err) {
    console.error("[admin:getShopDetail]", err);
    return res.status(500).json({ message: "Không thể tải chi tiết shop" });
  }
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
 * Xóa shop (xóa mềm) — storefront-aware: suspends public visibility + cache bust.
 */
export async function deleteShop(req, res) {
  const { id } = req.params;
  const result = await deleteAdminShop(id);
  return res.status(result.status).json(result.body);
}
