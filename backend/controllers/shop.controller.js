// controllers/shop.controller.js
import Shop from "../models/shop.model.js";
import path from "path";
import { uploadToR2 } from "../utils/r2-sdk.js"; // 🔥 THÊM
import { pool } from "../config/db.js";
import { syncProductListViewForShop } from "../services/productListViewSync.service.js";

export async function getMyShop(req, res) {
  try {
    const accountId = req.user.id;
    const shop = await Shop.getByAccountId(accountId);

    if (!shop) {
      return res.status(200).json(null);
    }

    res.json(shop);
  } catch (err) {
    console.error("getMyShop error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function createShop(req, res) {
  try {
    const accountId = req.user.id;
    const existing = await Shop.getByAccountId(accountId);
    if (existing) return res.status(400).json({ message: "Bạn đã có shop" });

    const data = {
      accountId,
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      zalo: req.body.zalo,
      website: req.body.website,
      provinceId: req.body.provinceId,
      districtId: req.body.districtId,
      wardId: req.body.wardId,
      addressDetail: req.body.addressDetail,
      descriptionHtml: req.body.descriptionHtml,
      salePolicy: req.body.salePolicy,
      warrantyPolicy: req.body.warrantyPolicy,
    };

    // ❗ KHÔNG set avatar/cover ở đây nữa
    const newShop = await Shop.create(data);

    /**
     * =========================
     * AVATAR → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.avatar?.length) {
      const file = req.files.avatar[0];
      const avatarUrl = await uploadToR2(
        file.buffer,
        `shops/${newShop.id}/avatar.png`,
      );
      await Shop.update(newShop.id, { avatar: avatarUrl });
    }

    /**
     * =========================
     * COVER → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.cover?.length) {
      const file = req.files.cover[0];
      const coverUrl = await uploadToR2(
        file.buffer,
        `shops/${newShop.id}/cover.png`,
      );
      await Shop.update(newShop.id, { cover: coverUrl });
    }

    res.json({ message: "Tạo shop thành công", id: newShop.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function updateMyShop(req, res) {
  try {
    const accountId = req.user.id;
    const shop = await Shop.getByAccountId(accountId);
    if (!shop) return res.status(404).json({ message: "Shop không tồn tại" });

    const data = {
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      zalo: req.body.zalo,
      website: req.body.website,
      provinceId: req.body.provinceId,
      districtId: req.body.districtId,
      wardId: req.body.wardId,
      addressDetail: req.body.addressDetail,
      descriptionHtml: req.body.descriptionHtml,
      salePolicy: req.body.salePolicy,
      warrantyPolicy: req.body.warrantyPolicy,
    };

    /**
     * =========================
     * AVATAR → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.avatar?.length) {
      const file = req.files.avatar[0];
      data.avatar = await uploadToR2(
        file.buffer,
        `shops/${shop.id}/avatar.png`,
      );
    }

    /**
     * =========================
     * COVER → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.cover?.length) {
      const file = req.files.cover[0];
      data.cover = await uploadToR2(file.buffer, `shops/${shop.id}/cover.png`);
    }

    await Shop.update(shop.id, data);
    await syncProductListViewForShop(shop.id).catch(() => { });
    res.json({ message: "Cập nhật shop thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

/**
 * Upload ảnh cho editor (CHƯA ĐỤNG – vẫn dùng local nếu bạn muốn)
 * Khi cần → tôi chuyển sang R2 cho bạn
 */
export async function uploadEditorImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: "Không có file" });
    const url = `/uploads/shops/${req.file.filename}`;
    res.json({ location: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi upload" });
  }
}

export async function getProvinces(req, res) {
  const [rows] = await pool.query(`
    SELECT MIN(id) as id, tinh_tp
    FROM address
    GROUP BY tinh_tp
    ORDER BY tinh_tp
  `);

  res.json(rows);
}

export async function getWards(req, res) {
  const { tinh_tp } = req.query;

  const [rows] = await pool.query(
    `
    SELECT id, phuong_xa
    FROM address
    WHERE tinh_tp = ?
    ORDER BY phuong_xa
  `,
    [tinh_tp],
  );

  res.json(rows);
}
