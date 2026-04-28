// services/carModel.service.js
import { pool } from "../config/db.js";

export async function getBrands() {
  const [rows] = await pool.query(`
    SELECT DISTINCT hang_xe
    FROM car_models
    ORDER BY hang_xe
  `);
  return rows.map((r) => r.hang_xe);
}

export async function getModelsByBrand(brand) {
  const [rows] = await pool.query(
    `
    SELECT id, ten_xe
    FROM car_models
    WHERE hang_xe = ?
    ORDER BY ten_xe
    `,
    [brand],
  );
  return rows;
}

export async function getAllModels() {
  const [rows] = await pool.query(
    `
    SELECT id, hang_xe, ten_xe
    FROM car_models
    ORDER BY hang_xe, ten_xe
    `,
  );
  return rows;
}
