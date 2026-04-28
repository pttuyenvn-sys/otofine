import { pool } from "../config/db.js";

export async function getProvinces(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT MIN(id) AS id, tinh_tp
      FROM address
      GROUP BY tinh_tp
      ORDER BY tinh_tp
    `);

    res.json(rows);
  } catch (err) {
    console.error("getProvinces error:", err);
    res.status(500).json([]);
  }
}

export async function getWards(req, res) {
  try {
    const { tinh_tp } = req.query;
    if (!tinh_tp) return res.json([]);

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
  } catch (err) {
    console.error("getWards error:", err);
    res.status(500).json([]);
  }
}
