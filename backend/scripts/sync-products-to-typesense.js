/**
 * Đồng bộ MySQL -> Typesense (batch, log tiến độ, RAM thấp).
 *
 *   cd backend && node scripts/sync-products-to-typesense.js --full
 *   cd backend && node scripts/sync-products-to-typesense.js --since=2026-01-01T00:00:00.000Z
 *
 * ENV: TYPESENSE_HOST, TYPESENSE_API_KEY, TYPESENSE_PORT?, TYPESENSE_PROTOCOL?,
 *      TYPESENSE_PRODUCT_COLLECTION? (mặc định otofine_products)
 */
import dotenv from "dotenv";
import Typesense from "typesense";
import { pool } from "../config/db.js";
import {
  getProductCollectionSchema,
  getTypesenseCollectionName,
} from "../services/productSearch.service.js";
import { rowToTypesenseDocument } from "../services/typesenseProductDocument.service.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

dotenv.config();

const BATCH = Number(process.env.TYPESENSE_SYNC_BATCH) || 300;
const COLLECTION = getTypesenseCollectionName();

function buildClient() {
  return new Typesense.Client({
    nodes: [
      {
        host: process.env.TYPESENSE_HOST,
        port: process.env.TYPESENSE_PORT || "8108",
        protocol: process.env.TYPESENSE_PROTOCOL || "http",
      },
    ],
    apiKey: process.env.TYPESENSE_API_KEY,
    connectionTimeoutSeconds: 30,
  });
}

async function ensureCollection(client) {
  const schema = getProductCollectionSchema();
  try {
    await client.collections().create(schema);
    console.log("Đã tạo collection", COLLECTION);
  } catch (e) {
    if (String(e.message || "").includes("already exists") || e.httpStatus === 409) {
      console.log("Collection đã tồn tại:", COLLECTION);
    } else {
      throw e;
    }
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let mode = "full";
  let since = null;
  for (const a of argv) {
    if (a === "--full") mode = "full";
    if (a.startsWith("--since=")) {
      mode = "since";
      since = a.slice("--since=".length);
    }
  }
  return { mode, since };
}

async function fetchBatch(lastId, sinceIso) {
  const pc = await getProductsColumnsResolved();
  const ord = pc.orderExprQualified("p");
  const slugEx = pc.slugSqlExpr("p");
  const visObj = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const visSql = visObj.sql;

  const params = [lastId];
  let whereSince = "";
  if (sinceIso) {
    whereSince = ` AND ${ord} > ? `;
    params.push(sinceIso);
  }
  params.push(BATCH);

  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      p.partNumber,
      p.partName,
      ${pc.slugSqlSelect("p")},
      ${ord} AS updatedAt,
      GROUP_CONCAT(DISTINCT cm.hang_xe ORDER BY cm.hang_xe SEPARATOR '|') AS brand_blob,
      GROUP_CONCAT(DISTINCT cm.ten_xe ORDER BY cm.ten_xe SEPARATOR '|') AS model_blob,
      MIN(pa.year_from) AS year_min,
      MAX(pa.year_to) AS year_max
    FROM products p
    INNER JOIN shops s ON s.id = p.shopId
    LEFT JOIN product_car_applications pa ON pa.productId = p.id
    LEFT JOIN car_models cm ON cm.id = pa.carModelId
    WHERE p.id > ?
    ${whereSince}
    ${visSql}
    GROUP BY p.id, p.partNumber, p.partName, ${slugEx}, ${ord}
    ORDER BY p.id ASC
    LIMIT ?
    `,
    params,
  );

  return rows;
}

async function main() {
  if (!process.env.TYPESENSE_HOST || !process.env.TYPESENSE_API_KEY) {
    console.error("Thiếu TYPESENSE_HOST hoặc TYPESENSE_API_KEY");
    process.exit(1);
  }

  const { mode, since } = parseArgs();
  const client = buildClient();
  await ensureCollection(client);

  let lastId = 0;
  let total = 0;
  const sinceIso = mode === "since" && since ? since : null;
  if (sinceIso) console.log("Incremental từ updatedAt >", sinceIso);

  for (;;) {
    const rows = await fetchBatch(lastId, sinceIso);
    if (!rows.length) break;

    const docs = rows.map(rowToTypesenseDocument);
    const jsonl = docs.map((d) => JSON.stringify(d)).join("\n");

    const importRes = await client
      .collections(COLLECTION)
      .documents()
      .import(jsonl, { action: "upsert" });

    if (typeof importRes === "string") {
      let fail = 0;
      for (const line of importRes.trim().split("\n")) {
        if (!line) continue;
        try {
          const o = JSON.parse(line);
          if (!o.success) fail++;
        } catch {
          fail++;
        }
      }
      if (fail) console.warn("Số dòng import lỗi (ước lượng):", fail);
    } else if (Array.isArray(importRes)) {
      const failed = importRes.filter((r) => !r.success);
      if (failed.length) console.warn("Một số dòng import lỗi:", failed.slice(0, 3));
    }

    lastId = rows[rows.length - 1].id;
    total += rows.length;
    console.log(`Đã upsert ${total} sản phẩm (lastId=${lastId})…`);

    if (rows.length < BATCH) break;
  }

  console.log("Hoàn tất sync Typesense, tổng batch:", total);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
