#!/usr/bin/env node
/**
 * SEARCH-INVERTED-INDEX-01 — validation + benchmark (data layer only).
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

const SAMPLE_SYNC = 50;

async function main() {
  const { ensureSearchIndexSchema } = await import("../services/search/ensureSearchIndexSchema.js");
  const { ensureSearchTokenIndexSchema } = await import("../services/search/inverted/ensureSearchTokenIndexSchema.js");
  const { pool } = await import("../config/db.js");
  const { syncProduct } = await import("../services/search/SearchIndexSyncService.js");
  const { TOKEN_WEIGHTS } = await import("../services/search/inverted/searchTokenIndexWeights.js");
  const { SearchTokenRepository } = await import("../services/search/inverted/SearchTokenRepository.js");
  const { CURRENT_SEARCH_INDEX_VERSION } = await import("../config/searchIndexConfig.js");

  await ensureSearchIndexSchema(pool);
  await ensureSearchTokenIndexSchema(pool);

  const [[{ tableExists }]] = await pool.query(`
    SELECT COUNT(*) AS tableExists
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'search_token_index'
  `);

  if (!Number(tableExists)) {
    console.error("FAIL — search_token_index table missing");
    process.exit(1);
  }

  const [missingRows] = await pool.query(`
    SELECT DISTINCT psi.product_id
    FROM product_search_index psi
    LEFT JOIN search_token_index sti ON sti.product_id = psi.product_id
    WHERE psi.status = 'active' AND sti.id IS NULL
    LIMIT ?
  `, [SAMPLE_SYNC]);

  const syncTimes = [];
  let synced = 0;
  for (const row of missingRows) {
    const t0 = performance.now();
    const result = await syncProduct(row.product_id, { source: "validate-inverted-01", force: true });
    syncTimes.push(performance.now() - t0);
    synced += 1;
    if (result.invertedTokens > 0) {
      // ok
    }
  }

  const [[{ productsWithoutTokens }]] = await pool.query(`
    SELECT COUNT(DISTINCT psi.product_id) AS productsWithoutTokens
    FROM product_search_index psi
    LEFT JOIN search_token_index sti ON sti.product_id = psi.product_id
    WHERE psi.status = 'active' AND sti.id IS NULL
  `);

  const [[{ duplicateGroups }]] = await pool.query(`
    SELECT COUNT(*) AS duplicateGroups FROM (
      SELECT product_id, token, token_type, COUNT(*) AS c
      FROM search_token_index
      GROUP BY product_id, token, token_type
      HAVING c > 1
    ) d
  `);

  const [[stats]] = await pool.query(`
    SELECT
      COUNT(*) AS total_tokens,
      COUNT(DISTINCT product_id) AS products_with_tokens,
      ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT product_id), 0), 2) AS avg_tokens_per_product
    FROM search_token_index
  `);

  const [typeStats] = await pool.query(`
    SELECT token_type, COUNT(*) AS cnt, AVG(weight) AS avg_weight
    FROM search_token_index
    GROUP BY token_type
    ORDER BY cnt DESC
  `);

  const [[storage]] = await pool.query(`
    SELECT
      ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'search_token_index'
  `);

  const weightChecks = [];
  const [oemSample] = await pool.query(
    `SELECT weight FROM search_token_index WHERE token_type = 'OEM' LIMIT 5`,
  );
  weightChecks.push({
    type: "OEM",
    expected: TOKEN_WEIGHTS.OEM,
    ok: oemSample.every((r) => Number(r.weight) === TOKEN_WEIGHTS.OEM),
  });

  const [catSample] = await pool.query(
    `SELECT weight FROM search_token_index WHERE token_type = 'CATEGORY' LIMIT 5`,
  );
  weightChecks.push({
    type: "CATEGORY",
    expected: TOKEN_WEIGHTS.CATEGORY,
    ok: catSample.length === 0 || catSample.every((r) => Number(r.weight) === TOKEN_WEIGHTS.CATEGORY),
  });

  const [synSample] = await pool.query(
    `SELECT weight FROM search_token_index WHERE token_type = 'SYNONYM' AND source = 'synonym_tokens' LIMIT 5`,
  );
  weightChecks.push({
    type: "SYNONYM",
    expected: TOKEN_WEIGHTS.SYNONYM,
    ok: synSample.length === 0 || synSample.every((r) => Number(r.weight) === TOKEN_WEIGHTS.SYNONYM),
  });

  const repoSmoke = await SearchTokenRepository.findByToken("toyota", { limit: 5 });
  const tokenSets = [
    repoSmoke.map((h) => h.product_id),
    (await SearchTokenRepository.findByToken("bugi", { limit: 20 })).map((h) => h.product_id),
  ];
  const intersected = SearchTokenRepository.intersect(tokenSets);
  const unioned = SearchTokenRepository.union(tokenSets);
  const top = await SearchTokenRepository.topCandidates(unioned.slice(0, 100), { limit: 10 });

  const avgSyncMs = syncTimes.length
    ? Math.round((syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length) * 100) / 100
    : 0;

  const payload = {
    searchIndexVersion: CURRENT_SEARCH_INDEX_VERSION,
    tableExists: true,
    syncedSample: synced,
    productsWithoutTokens: Number(productsWithoutTokens),
    duplicateGroups: Number(duplicateGroups),
    stats: {
      total_tokens: Number(stats.total_tokens),
      products_with_tokens: Number(stats.products_with_tokens),
      avg_tokens_per_product: Number(stats.avg_tokens_per_product),
    },
    typeStats,
    storageMb: Number(storage.size_mb),
    benchmark: {
      perProductSyncAvgMs: avgSyncMs,
      perProductSyncMaxMs: syncTimes.length ? Math.round(Math.max(...syncTimes) * 100) / 100 : 0,
    },
    weightChecks,
    repositorySmoke: {
      findByToken: repoSmoke.length,
      intersect: intersected.length,
      union: unioned.length,
      topCandidates: top.length,
    },
  };

  console.log("\n=== SEARCH-INVERTED-INDEX-01 validation ===\n");
  console.log("Table exists:", payload.tableExists);
  console.log("Synced sample products:", synced);
  console.log("Products without tokens (remaining):", payload.productsWithoutTokens);
  console.log("Duplicate (product,token,type) groups:", payload.duplicateGroups);
  console.log("Total tokens:", payload.stats.total_tokens);
  console.log("Avg tokens/product:", payload.stats.avg_tokens_per_product);
  console.log("Storage (MB):", payload.storageMb);
  console.log("Per-product sync avg (ms):", payload.benchmark.perProductSyncAvgMs);
  console.log("Weight checks:", weightChecks.map((w) => `${w.type}=${w.ok ? "OK" : "FAIL"}`).join(", "));
  console.log("Repository smoke: findByToken=", repoSmoke.length, "intersect=", intersected.length);

  const outDir = path.join(__dirname, "../../audit/search-inverted-index-01");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "validation-results.json"), JSON.stringify(payload, null, 2));
  writeDeliverables(outDir, payload);

  let failures = 0;
  if (payload.duplicateGroups > 0) failures += 1;
  if (payload.stats.total_tokens === 0) failures += 1;
  if (!weightChecks.every((w) => w.ok)) failures += 1;

  if (failures > 0) {
    console.error(`\nFAIL — ${failures} validation check(s) failed`);
    process.exit(1);
  }

  console.log("\nPASS — inverted index data layer validated (no runtime wiring)");
  await pool.end();
}

function writeDeliverables(outDir, payload) {
  fs.writeFileSync(
    path.join(outDir, "schema.md"),
    `# Schema — search_token_index

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT UNSIGNED | PK |
| token | VARCHAR(255) | Folded token |
| token_type | ENUM | WORD, PHRASE, OEM, BRAND, MODEL, CATEGORY, SYNONYM, LOCATION, YEAR |
| product_id | BIGINT UNSIGNED | FK logical to products |
| weight | SMALLINT UNSIGNED | Ranking hint |
| source | VARCHAR(64) | Origin field |
| position | SMALLINT UNSIGNED | Token position in source |
| document_version | SMALLINT UNSIGNED | Matches search index version |
| updated_at | TIMESTAMP(3) | Auto |

**Unique:** \`(product_id, token, token_type)\`

Migration: \`backend/migrations/074_search_token_index.sql\`
`,
  );

  fs.writeFileSync(
    path.join(outDir, "builder.md"),
    `# SearchTokenIndexBuilder

Built from \`product_search_index\` rows per product.

## Sources

title, category, brand, model, vehicle, part_number, search_keywords,
search_tokens, normalized_tokens, synonym_tokens, seo_alias (category_dictionary)

## Sync

\`SearchIndexSyncService.syncProduct()\` calls \`rebuildInvertedIndexForProduct()\` after index upsert.
Deletes tokens on product removal. **Per-product only — never full rebuild.**

## Flag

\`SEARCH_INVERTED_INDEX=1\` enables sync. Default \`0\` skips writes (rollback = disable flag).
`,
  );

  const typeRows = payload.typeStats
    .map((r) => `| ${r.token_type} | ${r.cnt} | ${Math.round(Number(r.avg_weight) * 10) / 10} |`)
    .join("\n");

  fs.writeFileSync(
    path.join(outDir, "token-statistics.md"),
    `# Token Statistics

| Metric | Value |
|--------|-------|
| Total tokens | ${payload.stats.total_tokens} |
| Products with tokens | ${payload.stats.products_with_tokens} |
| Avg tokens/product | ${payload.stats.avg_tokens_per_product} |
| Storage (MB) | ${payload.storageMb} |

## By type

| token_type | count | avg weight |
|------------|-------|------------|
${typeRows}
`,
  );

  fs.writeFileSync(
    path.join(outDir, "benchmark.md"),
    `# Benchmark

| Metric | Value |
|--------|-------|
| Sample sync count | ${payload.syncedSample} |
| Per-product sync avg (ms) | ${payload.benchmark.perProductSyncAvgMs} |
| Per-product sync max (ms) | ${payload.benchmark.perProductSyncMaxMs} |
| Avg tokens/product | ${payload.stats.avg_tokens_per_product} |
| Table size (MB) | ${payload.storageMb} |
`,
  );

  fs.writeFileSync(
    path.join(outDir, "validation.md"),
    `# Validation

| Check | Result |
|-------|--------|
| Table exists | ${payload.tableExists ? "PASS" : "FAIL"} |
| Duplicate groups | ${payload.duplicateGroups} |
| Products without tokens (remaining corpus) | ${payload.productsWithoutTokens} |
| Weight OEM=${payload.weightChecks[0]?.expected} | ${payload.weightChecks[0]?.ok ? "PASS" : "FAIL"} |
| Repository findByToken | ${payload.repositorySmoke.findByToken} hits |

Run: \`node backend/scripts/validate-search-inverted-index-01.mjs\`
`,
  );

  fs.writeFileSync(
    path.join(outDir, "SEARCH-INVERTED-INDEX-01.md"),
    `# SEARCH-INVERTED-INDEX-01

Inverted index layer on \`product_search_index\`. **Data structure only — no runtime wiring.**

## Flag

\`SEARCH_INVERTED_INDEX=0\` (default) — skip inverted index writes.

## Architecture

\`\`\`
products → SearchIndexSync → product_search_index → SearchTokenIndexBuilder → search_token_index
\`\`\`

See [schema.md](./schema.md), [builder.md](./builder.md), [benchmark.md](./benchmark.md).
`,
  );

  fs.writeFileSync(
    path.join(__dirname, "../../audit/SEARCH-INVERTED-INDEX-01.md"),
    fs.readFileSync(path.join(outDir, "SEARCH-INVERTED-INDEX-01.md"), "utf8"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
