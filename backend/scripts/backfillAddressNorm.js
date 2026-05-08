/**
 * One-time backfill: populate address.tinh_tp_norm and address.tinh_tp_slug
 * using the same foldVi() logic that the backend uses at query time.
 *
 * Usage:  node scripts/backfillAddressNorm.js
 */

import dotenv from "dotenv";
dotenv.config();

import { pool } from "../config/db.js";

function foldVi(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  const [rows] = await pool.query(
    `SELECT id, tinh_tp FROM address WHERE tinh_tp IS NOT NULL`,
  );

  console.log(`Found ${rows.length} address rows to backfill.`);

  let updated = 0;
  for (const row of rows) {
    const norm = foldVi(row.tinh_tp);
    const slug = norm.replace(/\s+/g, "-");

    await pool.query(
      `UPDATE address SET tinh_tp_norm = ?, tinh_tp_slug = ? WHERE id = ?`,
      [norm, slug, row.id],
    );
    updated++;
  }

  console.log(`Done. Updated ${updated} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
