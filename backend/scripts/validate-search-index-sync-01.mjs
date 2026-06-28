#!/usr/bin/env node
/**
 * SEARCH-INDEX-SYNC-IMPLEMENT-01 — random mutation validation + sync benchmark.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const SAMPLE_SIZE = Number(process.env.SEARCH_INDEX_SYNC_VALIDATE_N || 100);

function percentiles(nums) {
  if (!nums.length) return { avg: 0, p50: 0, p95: 0, max: 0, samples: 0 };
  const s = [...nums].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    samples: s.length,
    avg: Math.round(avg * 100) / 100,
    p50: at(0.5),
    p95: at(0.95),
    max: s[s.length - 1],
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ensureMigrations(pool) {
  const { ensureSearchIndexSchema } = await import("../services/search/ensureSearchIndexSchema.js");
  await ensureSearchIndexSchema(pool);
}

async function pickRandomPublicProductIds(pool, limit) {
  const { getProductsColumnsResolved } = await import("../utils/productsTableColumns.server.js");
  const { buildPublicProductWhereClause } = await import(
    "../modules/products/services/productPublicVisibility.server.js"
  );
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const [rows] = await pool.query(
    `
    SELECT ${pid} AS id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    WHERE 1=1 ${vis.sql}
    ORDER BY RAND()
    LIMIT ?
    `,
    [limit],
  );
  return rows.map((r) => Number(r.id));
}

async function pickProductsWithFitment(pool, limit) {
  const { getProductsColumnsResolved } = await import("../utils/productsTableColumns.server.js");
  const { buildPublicProductWhereClause } = await import(
    "../modules/products/services/productPublicVisibility.server.js"
  );
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const [rows] = await pool.query(
    `
    SELECT DISTINCT ${pid} AS id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN product_car_applications pa ON pa.productId = ${pid}
    WHERE 1=1 ${vis.sql}
    ORDER BY RAND()
    LIMIT ?
    `,
    [limit],
  );
  return rows.map((r) => Number(r.id));
}

/**
 * @param {string} name
 * @param {import('mysql2/promise').Pool} pool
 * @param {number[]} ids
 * @param {(db: import('mysql2/promise').Pool, id: number) => Promise<void>} mutateFn
 * @param {(db: import('mysql2/promise').Pool, id: number) => Promise<void>} [restoreFn]
 */
async function runPhase(name, pool, ids, mutateFn, restoreFn) {
  const durations = [];
  let failures = 0;
  const { compareProductIndex } = await import("../services/search/searchIndexCompare.server.js");
  const { syncProduct } = await import("../services/search/SearchIndexSyncService.js");

  for (const id of ids) {
    const started = Date.now();
    await mutateFn(pool, id);
    await syncProduct(id, { source: "validate", reason: name, force: false });
    durations.push(Date.now() - started);
    const cmp = await compareProductIndex(pool, id);
    if (!cmp.ok) {
      failures += 1;
      console.error(`FAIL ${name} productId=${id}`, cmp.mismatches.slice(0, 3));
    }
    if (restoreFn) {
      await restoreFn(pool, id);
      await syncProduct(id, { source: "validate-restore", reason: name });
    }
  }

  return { name, failures, durations: percentiles(durations) };
}

async function main() {
  const { pool } = await import("../config/db.js");
  await ensureMigrations(pool);

  const [[{ c: indexCount }]] = await pool.query(`SELECT COUNT(*) AS c FROM product_search_index`);
  if (Number(indexCount) === 0) {
    console.log("Index empty — running rebuildAll...");
    const { rebuildAll } = await import("../services/search/SearchIndexSyncService.js");
    await rebuildAll({ batchSize: 200, staleVersionOnly: false });
  } else {
    const { rebuildAll } = await import("../services/search/SearchIndexSyncService.js");
    await rebuildAll({ batchSize: 200, staleVersionOnly: true });
  }

  const need = SAMPLE_SIZE * 3 + SAMPLE_SIZE;
  const allIds = await pickRandomPublicProductIds(pool, need);
  const vehicleIds = await pickProductsWithFitment(pool, SAMPLE_SIZE);
  const [updateIds, deleteIds, categoryIds] = chunk(allIds, SAMPLE_SIZE);

  console.log(`\n=== SEARCH-INDEX-SYNC-IMPLEMENT-01 validation (n=${SAMPLE_SIZE}/phase) ===\n`);

  const [[altCat]] = await pool.query(
    `SELECT id FROM product_categories WHERE is_active = 1 ORDER BY id DESC LIMIT 1`,
  );
  const altCategoryId = altCat?.id;

  const categoryBackup = new Map();
  const phases = [
    await runPhase(
      "update",
      pool,
      updateIds,
      async (db, id) => {
        const [[row]] = await db.query(`SELECT partName FROM products WHERE id = ?`, [id]);
        await db.query(`UPDATE products SET partName = ? WHERE id = ?`, [
          `${row.partName} [si-test]`,
          id,
        ]);
      },
      async (db, id) => {
        const [[row]] = await db.query(`SELECT partName FROM products WHERE id = ?`, [id]);
        await db.query(`UPDATE products SET partName = ? WHERE id = ?`, [
          String(row.partName).replace(/ \[si-test\]$/, ""),
          id,
        ]);
      },
    ),
    await runPhase(
      "delete",
      pool,
      deleteIds,
      async (db, id) => {
        await db.query(`UPDATE products SET moderation_status = 'hidden' WHERE id = ?`, [id]);
      },
      async (db, id) => {
        await db.query(`UPDATE products SET moderation_status = 'approved' WHERE id = ?`, [id]);
      },
    ),
    await runPhase(
      "vehicle",
      pool,
      vehicleIds,
      async (db, id) => {
        const [apps] = await db.query(
          `SELECT id, year_from FROM product_car_applications WHERE productId = ? ORDER BY is_primary DESC, id ASC LIMIT 1`,
          [id],
        );
        if (!apps.length) return;
        const yf = apps[0].year_from != null ? Number(apps[0].year_from) : 2000;
        await db.query(`UPDATE product_car_applications SET year_from = ? WHERE id = ?`, [
          yf + 1,
          apps[0].id,
        ]);
      },
      async (db, id) => {
        const [apps] = await db.query(
          `SELECT id, year_from FROM product_car_applications WHERE productId = ? ORDER BY is_primary DESC, id ASC LIMIT 1`,
          [id],
        );
        if (!apps.length) return;
        const yf = Number(apps[0].year_from);
        await db.query(`UPDATE product_car_applications SET year_from = ? WHERE id = ?`, [
          Number.isFinite(yf) ? yf - 1 : null,
          apps[0].id,
        ]);
      },
    ),
    altCategoryId
      ? await runPhase(
          "category",
          pool,
          categoryIds,
          async (db, id) => {
            const [[row]] = await db.query(
              `
              SELECT id, category_id
              FROM product_category_map
              WHERE product_id = ?
              ORDER BY is_primary DESC, id ASC
              LIMIT 1
              `,
              [id],
            );
            if (!row?.id || Number(row.category_id) === Number(altCategoryId)) return;
            categoryBackup.set(id, { mapId: row.id, categoryId: row.category_id });
            await db.query(`UPDATE product_category_map SET category_id = ? WHERE id = ?`, [
              altCategoryId,
              row.id,
            ]);
          },
          async (db, id) => {
            const backup = categoryBackup.get(id);
            if (!backup) return;
            await db.query(`UPDATE product_category_map SET category_id = ? WHERE id = ?`, [
              backup.categoryId,
              backup.mapId,
            ]);
          },
        )
      : { name: "category", failures: 0, durations: percentiles([]) },
  ];

  let totalFailures = 0;
  const timingSamples = [];

  for (const p of phases) {
    totalFailures += p.failures;
    timingSamples.push(...[p.durations.p50, p.durations.p95, p.durations.max].filter(Boolean));
    console.log(
      `${p.name}: failures=${p.failures} syncMs avg=${p.durations.avg} p50=${p.durations.p50} p95=${p.durations.p95} max=${p.durations.max}`,
    );
  }

  console.log("\nBenchmark (aggregate):", percentiles(timingSamples));

  if (totalFailures > 0) {
    console.error(`\nFAIL — ${totalFailures} product parity mismatches`);
    process.exit(1);
  }

  console.log("\nPASS — products ↔ search index identical after random mutations");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
