// models/shop.model.js
import { pool } from "../config/db.js";

export default {
  async getByAccountId(accountId) {
    const [rows] = await pool.query(
      "SELECT * FROM shops WHERE accountId = ?",
      [accountId],
    );

    return rows[0] || null;
  },

  async getById(id) {
    const [rows] = await pool.query("SELECT * FROM shops WHERE id = ?", [id]);
    return rows[0] || null;
  },

  async create(data) {
    const sql = `INSERT INTO shops
      (accountId, name, avatar, cover, phone, email, zalo, website,
       provinceId, districtId, wardId, addressDetail,
       descriptionHtml, salePolicy, warrantyPolicy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.accountId,
      data.name || null,
      data.avatar || null,
      data.cover || null,
      data.phone || null,
      data.email || null,
      data.zalo || null,
      data.website || null,
      data.provinceId || null,
      data.districtId || null,
      data.wardId || null,
      data.addressDetail || null,
      data.descriptionHtml || null,
      data.salePolicy || null,
      data.warrantyPolicy || null,
    ];
    const [result] = await pool.query(sql, params);
    return { id: result.insertId };
  },

  async update(id, data) {
    const sql = `UPDATE shops SET
      name=?, avatar=?, cover=?, phone=?, email=?, zalo=?, website=?,
      provinceId=?, districtId=?, wardId=?, addressDetail=?,
      descriptionHtml=?, salePolicy=?, warrantyPolicy=?,
      updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const params = [
      data.name || null,
      data.avatar || null,
      data.cover || null,
      data.phone || null,
      data.email || null,
      data.zalo || null,
      data.website || null,
      data.provinceId || null,
      data.districtId || null,
      data.wardId || null,
      data.addressDetail || null,
      data.descriptionHtml || null,
      data.salePolicy || null,
      data.warrantyPolicy || null,
      id,
    ];
    const [res] = await pool.query(sql, params);
    return res;
  },
};
