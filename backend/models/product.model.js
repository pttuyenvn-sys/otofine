// models/product.model.js
import { pool } from "../config/db.js";

export default {
  async getByShopId(shopId, limit = 100, offset = 0) {
    const [rows] = await pool.query(
      `SELECT * FROM products WHERE shopId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [shopId, Number(limit), Number(offset)]
    );
    return rows;
  },

  async create(data) {
    const sql = `INSERT INTO products
      (shopId, name, description, price, categoryId, brandId, modelId)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      data.shopId || null,
      data.name,
      data.description || null,
      data.price || null,
      data.categoryId || null,
      data.brandId || null,
      data.modelId || null,
    ];
    const [res] = await pool.query(sql, params);
    return { id: res.insertId };
  },

  async getById(id) {
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [
      id,
    ]);
    return rows[0] || null;
  },
};

async getByCode(code, shopId) {
  const [rows] = await pool.query(
    "SELECT * FROM products WHERE code = ? AND shopId = ? LIMIT 1",
    [code, shopId]
  );
  return rows[0] || null;
},