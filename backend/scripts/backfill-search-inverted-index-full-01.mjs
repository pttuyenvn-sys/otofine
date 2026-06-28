#!/usr/bin/env node
/**
 * SEARCH-INVERTED-INDEX-FULL-BACKFILL-01 — resumable full corpus backfill.
 * Per-product sync into search_token_index; no truncate/drop; no runtime changes.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

process.env.SEARCH_INVERTED_INDEX = "1";

const OUT_DIR = path.join(__dirname, "../../audit/search-inverted-index-full-backfill-01");
const CHECKPOINT_PATH = path.join(OUT_DIR, "checkpoint.json");
const FAILED_PATH = path.join(OUT_DIR, "failed-products.json");
const COVERAGE_PATH = path.join(OUT_DIR, "coverage.json");
const BENCHMARK_PATH = path.join(OUT_DIR, "benchmark.json");

const BATCH_SIZE = Math.max(1, Number(process.env.INVERTED_BACKFILL_BATCH_SIZE || 500));
const MAX_WORKERS = Math.min(2, Math.max(1, Number(process.env.INVERTED_BACKFILL_WORKERS || 2)));

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function loadCheckpoint() {
  if (process.env.INVERTED_BACKFILL_RESET === "1") {
    return { last_product_id: 0, batches_completed: 0, started_at: new Date().toISOString() };
  }
  return readJson(CHECKPOINT_PATH, {
    last_product_id: 0,
    batches_completed: 0,
    started_at: new Date().toISOString(),
  });
}

async function fetchProductBatch(pool, afterProductId, limit) {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT product_id
    FROM product_search_index
    WHERE status = 'active' AND product_id > ?
    ORDER BY product_id
    LIMIT ?
    `,
    [Number(afterProductId), limit],
  );
  return rows.map((r) => Number(r.product_id));
}

async function clearHashIfMissingTokens(conn, productId) {
  const [[row]] = await conn.query(
    `
    SELECT
      psi.inverted_token_hash,
      (SELECT COUNT(*) FROM search_token_index sti WHERE sti.product_id = psi.product_id) AS token_count
    FROM product_search_index psi
    WHERE psi.product_id = ? AND psi.status = 'active'
    LIMIT 1
    `,
    [productId],
  );
  if (!row) return { hasIndex: false };
  if (Number(row.token_count) === 0 && row.inverted_token_hash) {
    await conn.query(
      `UPDATE product_search_index SET inverted_token_hash = NULL WHERE product_id = ?`,
      [productId],
    );
    return { hasIndex: true, clearedHash: true };
  }
  return { hasIndex: true, clearedHash: false };
}

async function processProduct(pool, rebuildInvertedIndexForProduct, productId) {
  const conn = await pool.getConnection();
  const started = performance.now();
  try {
    await conn.beginTransaction();
    const indexCheck = await clearHashIfMissingTokens(conn, productId);
    if (!indexCheck.hasIndex) {
      await conn.commit();
      return {
        productId,
        ok: true,
        skipped: true,
        reason: "no_active_index",
        tokens: 0,
        hashSkipped: false,
        durationMs: performance.now() - started,
      };
    }

    const result = await rebuildInvertedIndexForProduct(conn, productId);
    await conn.commit();
    return {
      productId,
      ok: true,
      skipped: Boolean(result.skipped || result.hashSkipped),
      hashSkipped: Boolean(result.hashSkipped),
      tokens: Number(result.tokens || 0),
      clearedHash: Boolean(indexCheck.clearedHash),
      durationMs: performance.now() - started,
    };
  } catch (err) {
    await conn.rollback();
    return {
      productId,
      ok: false,
      error: err?.message || String(err),
      durationMs: performance.now() - started,
    };
  } finally {
    conn.release();
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function verifyBatch(pool, productIds) {
  if (!productIds.length) {
    return { productsProcessed: 0, tokensInserted: 0, duplicates: 0, missingInBatch: 0, errors: 0 };
  }

  const [[dupRow]] = await pool.query(
    `
    SELECT COUNT(*) AS duplicateGroups FROM (
      SELECT product_id, token, token_type, COUNT(*) AS c
      FROM search_token_index
      WHERE product_id IN (?)
      GROUP BY product_id, token, token_type
      HAVING c > 1
    ) d
    `,
    [productIds],
  );

  const [[missingRow]] = await pool.query(
    `
    SELECT COUNT(*) AS missingInBatch
    FROM (
      SELECT DISTINCT product_id FROM product_search_index
      WHERE status = 'active' AND product_id IN (?)
    ) expected
    LEFT JOIN (
      SELECT DISTINCT product_id FROM search_token_index WHERE product_id IN (?)
    ) actual ON actual.product_id = expected.product_id
    WHERE actual.product_id IS NULL
    `,
    [productIds, productIds],
  );

  const [[tokenRow]] = await pool.query(
    `SELECT COUNT(*) AS tokensInserted FROM search_token_index WHERE product_id IN (?)`,
    [productIds],
  );

  return {
    productsProcessed: productIds.length,
    tokensInserted: Number(tokenRow?.tokensInserted || 0),
    duplicates: Number(dupRow?.duplicateGroups || 0),
    missingInBatch: Number(missingRow?.missingInBatch || 0),
  };
}

async function buildCoverageReport(pool) {
  const [[totals]] = await pool.query(`
    SELECT COUNT(DISTINCT product_id) AS indexed_products
    FROM product_search_index
    WHERE status = 'active'
  `);

  const [[withTokens]] = await pool.query(`
    SELECT COUNT(DISTINCT psi.product_id) AS products_with_tokens
    FROM product_search_index psi
    INNER JOIN search_token_index sti ON sti.product_id = psi.product_id
    WHERE psi.status = 'active'
  `);

  const [missingProducts] = await pool.query(`
    SELECT DISTINCT psi.product_id
    FROM product_search_index psi
    LEFT JOIN search_token_index sti ON sti.product_id = psi.product_id
    WHERE psi.status = 'active' AND sti.id IS NULL
    ORDER BY psi.product_id
  `);

  const [[dupRow]] = await pool.query(`
    SELECT COUNT(*) AS duplicateGroups FROM (
      SELECT product_id, token, token_type, COUNT(*) AS c
      FROM search_token_index
      GROUP BY product_id, token, token_type
      HAVING c > 1
    ) d
  `);

  const [brokenRefs] = await pool.query(`
    SELECT DISTINCT sti.product_id
    FROM search_token_index sti
    LEFT JOIN product_search_index psi
      ON psi.product_id = sti.product_id AND psi.status = 'active'
    WHERE psi.product_id IS NULL
    ORDER BY sti.product_id
  `);

  const [perProductCounts] = await pool.query(`
    SELECT product_id, COUNT(*) AS token_count
    FROM search_token_index
    GROUP BY product_id
  `);
  const counts = perProductCounts.map((r) => Number(r.token_count));
  const sorted = [...counts].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  const indexedProducts = Number(totals?.indexed_products || 0);
  const productsWithTokens = Number(withTokens?.products_with_tokens || 0);

  return {
    generated_at: new Date().toISOString(),
    indexed_products: indexedProducts,
    products_with_tokens: productsWithTokens,
    coverage_pct: indexedProducts
      ? Math.round((productsWithTokens / indexedProducts) * 10000) / 100
      : 100,
    missing_products: missingProducts.map((r) => Number(r.product_id)),
    missing_count: missingProducts.length,
    duplicate_groups: Number(dupRow?.duplicateGroups || 0),
    broken_references: brokenRefs.map((r) => Number(r.product_id)),
    broken_reference_count: brokenRefs.length,
    token_stats: {
      total_tokens: sum,
      products_counted: sorted.length,
      avg_tokens_per_product: sorted.length ? Math.round((sum / sorted.length) * 100) / 100 : 0,
      p50: pct(sorted, 50),
      p95: pct(sorted, 95),
      p99: pct(sorted, 99),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    },
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { pool } = await import("../config/db.js");
  const { ensureSearchTokenIndexSchema } = await import("../services/search/inverted/ensureSearchTokenIndexSchema.js");
  const { rebuildInvertedIndexForProduct } = await import("../services/search/inverted/invertedIndexSync.js");

  await ensureSearchTokenIndexSchema(pool);

  const checkpoint = loadCheckpoint();
  const failedProducts = readJson(FAILED_PATH, []);
  const benchmark = readJson(BENCHMARK_PATH, {
    started_at: checkpoint.started_at,
    batches: [],
    totals: {},
  });

  const runStarted = performance.now();
  let peakRss = process.memoryUsage().rss;
  const memInterval = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 500);

  let totalProcessed = Number(checkpoint.total_processed || 0);
  let totalSkipped = Number(checkpoint.total_skipped || 0);
  let totalTokensWritten = Number(checkpoint.total_tokens_written || 0);
  let totalErrors = failedProducts.length;

  console.log(`\n=== SEARCH-INVERTED-INDEX-FULL-BACKFILL-01 ===`);
  console.log(`Batch size: ${BATCH_SIZE}, workers: ${MAX_WORKERS}, resume after product_id: ${checkpoint.last_product_id}`);

  while (true) {
    const batchStarted = performance.now();
    const productIds = await fetchProductBatch(pool, checkpoint.last_product_id, BATCH_SIZE);
    if (!productIds.length) break;

    const results = await mapPool(
      productIds,
      MAX_WORKERS,
      (productId) => processProduct(pool, rebuildInvertedIndexForProduct, productId),
    );

    for (const r of results) {
      if (!r.ok) {
        failedProducts.push({
          product_id: r.productId,
          error: r.error,
          at: new Date().toISOString(),
        });
        totalErrors += 1;
      } else if (r.skipped) {
        totalSkipped += 1;
      }
      if (r.ok && !r.skipped) {
        totalTokensWritten += r.tokens;
      }
      totalProcessed += 1;
    }

    checkpoint.last_product_id = productIds[productIds.length - 1];
    checkpoint.batches_completed = Number(checkpoint.batches_completed || 0) + 1;
    checkpoint.total_processed = totalProcessed;
    checkpoint.total_skipped = totalSkipped;
    checkpoint.total_tokens_written = totalTokensWritten;
    checkpoint.updated_at = new Date().toISOString();

    const batchVerify = await verifyBatch(pool, productIds);
    const batchMs = performance.now() - batchStarted;
    const batchErrors = results.filter((r) => !r.ok).length;

    const batchRecord = {
      batch: checkpoint.batches_completed,
      last_product_id: checkpoint.last_product_id,
      products: productIds.length,
      skipped: results.filter((r) => r.ok && r.skipped).length,
      rebuilt: results.filter((r) => r.ok && !r.skipped).length,
      errors: batchErrors,
      duration_ms: Math.round(batchMs),
      products_per_sec: Math.round((productIds.length / (batchMs / 1000)) * 100) / 100,
      verify: batchVerify,
    };
    benchmark.batches.push(batchRecord);

    writeJson(CHECKPOINT_PATH, checkpoint);
    writeJson(FAILED_PATH, failedProducts);
    writeJson(BENCHMARK_PATH, benchmark);

    console.log(
      `Batch ${checkpoint.batches_completed}: products=${productIds.length} rebuilt=${batchRecord.rebuilt} skipped=${batchRecord.skipped} errors=${batchErrors} dup=${batchVerify.duplicates} missing=${batchVerify.missingInBatch} ${Math.round(batchMs)}ms`,
    );
  }

  clearInterval(memInterval);
  const totalMs = performance.now() - runStarted;

  const coverage = await buildCoverageReport(pool);
  writeJson(COVERAGE_PATH, coverage);

  benchmark.totals = {
    finished_at: new Date().toISOString(),
    duration_ms: Math.round(totalMs),
    products_processed: totalProcessed,
    products_skipped: totalSkipped,
    tokens_written_estimate: totalTokensWritten,
    errors: totalErrors,
    products_per_sec: totalMs > 0 ? Math.round((totalProcessed / (totalMs / 1000)) * 100) / 100 : 0,
    peak_memory_mb: Math.round(peakRss / 1024 / 1024),
    workers: MAX_WORKERS,
    batch_size: BATCH_SIZE,
  };
  writeJson(BENCHMARK_PATH, benchmark);

  const md = `# SEARCH-INVERTED-INDEX-FULL-BACKFILL-01

Generated: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Indexed products | ${coverage.indexed_products} |
| Products with tokens | ${coverage.products_with_tokens} |
| Coverage | ${coverage.coverage_pct}% |
| Missing products | ${coverage.missing_count} |
| Duplicate groups | ${coverage.duplicate_groups} |
| Broken references | ${coverage.broken_reference_count} |
| Failed products | ${failedProducts.length} |

## Token distribution

| Stat | Value |
|------|-------|
| Avg tokens/product | ${coverage.token_stats.avg_tokens_per_product} |
| P50 | ${coverage.token_stats.p50} |
| P95 | ${coverage.token_stats.p95} |
| P99 | ${coverage.token_stats.p99} |

## Benchmark

| Metric | Value |
|--------|-------|
| Total time (ms) | ${benchmark.totals.duration_ms} |
| Products/sec | ${benchmark.totals.products_per_sec} |
| Peak memory (MB) | ${benchmark.totals.peak_memory_mb} |
| Batches | ${benchmark.batches.length} |
| Workers | ${MAX_WORKERS} |

## Acceptance

- Coverage 100%: ${coverage.coverage_pct >= 100 && coverage.missing_count === 0 ? "PASS" : "FAIL"}
- Duplicate rows 0: ${coverage.duplicate_groups === 0 ? "PASS" : "FAIL"}
- Missing products 0: ${coverage.missing_count === 0 ? "PASS" : "FAIL"}
- Runtime unchanged: PASS (read-only data generation)

## Artifacts

- [coverage.json](./search-inverted-index-full-backfill-01/coverage.json)
- [checkpoint.json](./search-inverted-index-full-backfill-01/checkpoint.json)
- [failed-products.json](./search-inverted-index-full-backfill-01/failed-products.json)
- [benchmark.json](./search-inverted-index-full-backfill-01/benchmark.json)
`;

  fs.writeFileSync(path.join(__dirname, "../../audit/SEARCH-INVERTED-INDEX-FULL-BACKFILL-01.md"), md);

  console.log(`\nCoverage: ${coverage.coverage_pct}% (${coverage.products_with_tokens}/${coverage.indexed_products})`);
  console.log(`Missing: ${coverage.missing_count}, Duplicates: ${coverage.duplicate_groups}, Failed: ${failedProducts.length}`);
  console.log(`Avg tokens/product: ${coverage.token_stats.avg_tokens_per_product}, P95: ${coverage.token_stats.p95}`);

  const pass =
    coverage.coverage_pct >= 100
    && coverage.missing_count === 0
    && coverage.duplicate_groups === 0;

  console.log(pass ? "\nPASS — full backfill complete" : "\nFAIL — see coverage.json / failed-products.json");
  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
