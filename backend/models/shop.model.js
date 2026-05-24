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

  /**
   * PATCH-style update: only columns whose key is *present* in `data`
   * are touched.  Critical for the Phase A `/shop/settings` merge so
   * that calling `Shop.update(id, { descriptionHtml: '...' })` does
   * NOT silently NULL-out `avatar` / `cover` that were written via
   * the public-page upload endpoints in a separate request.
   *
   * Also fixes the latent bug in `createShop` where
   * `Shop.update(newShop.id, { avatar: url })` would wipe every other
   * field with NULL.
   */
  async update(id, data) {
    const ALLOWED = [
      "name", "avatar", "cover", "phone", "email", "zalo", "website",
      "provinceId", "districtId", "wardId", "addressDetail",
      "descriptionHtml", "salePolicy", "warrantyPolicy",
    ];
    const sets = [];
    const params = [];
    for (const col of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(data, col)) {
        sets.push(`${col} = ?`);
        params.push(data[col] ?? null);
      }
    }
    if (sets.length === 0) return { affectedRows: 0 };
    sets.push("updatedAt = CURRENT_TIMESTAMP");
    params.push(id);
    const sql = `UPDATE shops SET ${sets.join(", ")} WHERE id = ?`;
    const [res] = await pool.query(sql, params);
    return res;
  },
};
