/**
 * Gán slug SEO cho toàn bộ products (batch, ít RAM).
 * Chạy sau migration 002_products_seo_slug.sql
 *
 *   cd backend && node scripts/backfill-product-slugs.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { buildSeoProductSlug } from "../utils/productSlug.js";

dotenv.config();

const BATCH = 800;

async function main() {
  let lastId = 0;
  let n = 0;

  for (;;) {
    const [rows] = await pool.query(
      `SELECT id, partName, partNumber FROM products WHERE id > ? ORDER BY id ASC LIMIT ?`,
      [lastId, BATCH],
    );

    if (!rows.length) break;

    for (const r of rows) {
      const slug = buildSeoProductSlug({
        id: r.id,
        partName: r.partName,
        partNumber: r.partNumber,
      });
      await pool.query(`UPDATE products SET slug = ? WHERE id = ?`, [
        slug,
        r.id,
      ]);
      lastId = r.id;
      n++;
      if (n % 5000 === 0) console.log(`Đã cập nhật ${n} slug…`);
    }
  }

  console.log(`Hoàn tất backfill slug: ${n} sản phẩm.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
