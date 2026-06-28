#!/usr/bin/env node
/**
 * SEARCH-INDEX-ARCHITECTURE-PHASE-01 — validate index vs legacy inventory shape.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

async function tableExists(pool) {
  const [rows] = await pool.query(
    `
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_search_index'
  `,
  );
  return rows.length > 0;
}

/**
 * Legacy inventory document count = public products × fitment rows
 * (one row per product when no fitment).
 */
async function countLegacyInventoryDocuments(pool) {
  const { getProductsColumnsResolved } = await import("../utils/productsTableColumns.server.js");
  const { buildPublicProductWhereClause } = await import(
    "../modules/products/services/productPublicVisibility.server.js"
  );
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  const [[products]] = await pool.query(
    `
    SELECT COUNT(DISTINCT ${pid}) AS product_count
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    WHERE 1=1 ${vis.sql}
    `,
  );

  const [[row]] = await pool.query(
    `
    SELECT COUNT(*) AS document_count
    FROM (
      SELECT
        ${pid} AS product_id,
        pa.carModelId AS model_id,
        pa.year_from,
        pa.year_to
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      LEFT JOIN product_car_applications pa ON pa.productId = ${pid}
      WHERE 1=1 ${vis.sql}
      GROUP BY ${pid}, pa.carModelId, pa.year_from, pa.year_to
    ) t
    `,
  );

  const [[vehicles]] = await pool.query(
    `
    SELECT COUNT(*) AS vehicle_count
    FROM (
      SELECT ${pid} AS product_id, pa.carModelId AS model_id, pa.year_from, pa.year_to
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      INNER JOIN product_car_applications pa ON pa.productId = ${pid}
      WHERE 1=1 ${vis.sql}
      GROUP BY ${pid}, pa.carModelId, pa.year_from, pa.year_to
    ) v
    `,
  );

  return {
    productCount: Number(products.product_count) || 0,
    vehicleFitmentRows: Number(vehicles.vehicle_count) || 0,
    expectedDocuments: Number(row.document_count) || 0,
  };
}

async function countIndexDocuments(pool) {
  const [[docs]] = await pool.query(
    `SELECT COUNT(*) AS c FROM product_search_index WHERE status = 'active'`,
  );
  const [[products]] = await pool.query(
    `SELECT COUNT(DISTINCT product_id) AS c FROM product_search_index WHERE status = 'active'`,
  );
  const [[vehicles]] = await pool.query(
    `
    SELECT COUNT(*) AS c
    FROM product_search_index
    WHERE status = 'active' AND model_id > 0
    `,
  );
  return {
    documentCount: Number(docs.c) || 0,
    productCount: Number(products.c) || 0,
    vehicleDocuments: Number(vehicles.c) || 0,
  };
}

async function main() {
  const { pool } = await import("../config/db.js");

  if (!(await tableExists(pool))) {
    console.error("FAIL product_search_index table missing — run migration 069 or rebuild-search-index.js");
    process.exit(1);
  }

  const indexEmpty = await pool.query(`SELECT COUNT(*) AS c FROM product_search_index`);
  const isEmpty = Number(indexEmpty[0][0].c) === 0;

  if (isEmpty) {
    console.log("Index empty — running backfill...");
    const { rebuildAll } = await import("../services/search/SearchIndexSyncService.js");
    await rebuildAll({ batchSize: 200 });
  }

  const legacy = await countLegacyInventoryDocuments(pool);
  const index = await countIndexDocuments(pool);

  console.log("Legacy inventory (public products):");
  console.log("  products:", legacy.productCount);
  console.log("  vehicle fitment rows:", legacy.vehicleFitmentRows);
  console.log("  expected documents:", legacy.expectedDocuments);
  console.log("Search index:");
  console.log("  documents:", index.documentCount);
  console.log("  distinct products:", index.productCount);
  console.log("  vehicle documents:", index.vehicleDocuments);

  let failed = 0;
  if (index.documentCount !== legacy.expectedDocuments) {
    console.error(
      `FAIL document count: index=${index.documentCount} legacy=${legacy.expectedDocuments}`,
    );
    failed += 1;
  }
  if (index.productCount !== legacy.productCount) {
    console.error(
      `FAIL product count: index=${index.productCount} legacy=${legacy.productCount}`,
    );
    failed += 1;
  }
  if (index.vehicleDocuments !== legacy.vehicleFitmentRows) {
    console.error(
      `FAIL vehicle documents: index=${index.vehicleDocuments} legacy=${legacy.vehicleFitmentRows}`,
    );
    failed += 1;
  }

  if (failed) {
    process.exit(1);
  }

  console.log("\nPASS — search index matches legacy inventory counts");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
