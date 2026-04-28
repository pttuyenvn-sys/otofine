/**
 * Backfill bảng product_list_view theo batch (chạy sau migration).
 * Usage (từ thư mục backend): node scripts/backfill-product-list-view.js
 */
import dotenv from "dotenv";
import { pool } from "../config/db.js";
import { syncProductListViewByProductId } from "../services/productListViewSync.service.js";

dotenv.config();

const BATCH = 500;

async function main() {
  let lastId = 0;
  let done = 0;

  for (;;) {
    const [rows] = await pool.query(
      `SELECT id FROM products WHERE id > ? ORDER BY id ASC LIMIT ?`,
      [lastId, BATCH],
    );

    if (!rows.length) break;

    for (const row of rows) {
      await syncProductListViewByProductId(row.id);
      lastId = row.id;
      done++;
      if (done % 2000 === 0) {
        console.log(`Đã sync ${done} sản phẩm…`);
      }
    }
  }

  console.log(`Hoàn tất. Tổng ${done} dòng đã upsert vào product_list_view.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
