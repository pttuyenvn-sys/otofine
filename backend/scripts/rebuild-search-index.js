#!/usr/bin/env node
/**
 * SEARCH-INDEX-ARCHITECTURE-PHASE-01 — backfill product_search_index from products.
 *
 *   cd backend && node scripts/rebuild-search-index.js
 *   cd backend && node scripts/rebuild-search-index.js --product=12345
 *
 * Idempotent: upserts per product × vehicle document.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { ensureSearchIndexSchema } from "../services/search/ensureSearchIndexSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "../.env") });

function parseArgs() {
  const argv = process.argv.slice(2);
  /** @type {{ productId: number | null, dryRun: boolean }} */
  const out = { productId: null, dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    if (a.startsWith("--product=")) {
      out.productId = Number(a.slice("--product=".length));
    }
  }
  return out;
}

async function ensureTable(conn) {
  await ensureSearchIndexSchema(conn);
}

async function main() {
  const args = parseArgs();
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    await ensureTable(conn);
    console.log("[rebuild-search-index] table product_search_index ready");
  } finally {
    await conn.end();
  }

  const { rebuildAll, syncProduct, rebuildProduct } = await import(
    "../services/search/SearchIndexSyncService.js"
  );

  if (args.dryRun) {
    console.log("[rebuild-search-index] dry-run — schema only, no documents written");
    return;
  }

  if (!args.productId) {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await conn.query(`TRUNCATE TABLE product_search_index`);
    await conn.end();
    console.log("[rebuild-search-index] truncated product_search_index");
  }

  const started = Date.now();
  if (args.productId && Number.isFinite(args.productId)) {
    const result = await rebuildProduct(args.productId);
    console.log("[rebuild-search-index] product", result);
  } else {
    const result = await rebuildAll({
      batchSize: Number(process.env.SEARCH_INDEX_SYNC_BATCH) || 200,
      onProgress: ({ processed, total, documents }) => {
        if (processed % 500 === 0 || processed === total) {
          console.log(
            `[rebuild-search-index] ${processed}/${total} products, ${documents} documents`,
          );
        }
      },
    });
    console.log("[rebuild-search-index] complete", {
      ...result,
      elapsedMs: Date.now() - started,
    });
  }
}

main().catch((err) => {
  console.error("[rebuild-search-index] failed:", err);
  process.exit(1);
});
