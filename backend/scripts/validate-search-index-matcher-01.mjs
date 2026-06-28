#!/usr/bin/env node
/**
 * SEARCH-INDEX-MATCHER-01 — legacy vs hybrid vs matcher benchmark.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const QUERIES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
  { label: "bố thắng", query: { query: "bố thắng" } },
  { label: "brake pad", query: { query: "brake pad" } },
];

function whereBody(where) {
  return String(where || "").replace(/^\s*AND\s*/i, "").trim();
}

async function benchExec(label, resolveFn, query) {
  const t0 = performance.now();
  const exec = await resolveFn(query);
  const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

  const { pool } = await import("../config/db.js");
  const body = whereBody(exec.where);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(DISTINCT psi.product_id) AS c FROM product_search_index psi WHERE ${body}`,
    exec.params,
  );

  let documentsScanned = Number(countRow.c) || 0;
  if (exec.matcherMeta?.documentsScanned != null) {
    documentsScanned = exec.matcherMeta.documentsScanned;
  }

  const usedLike = String(exec.provider || "").includes("like");

  return {
    label,
    provider: exec.provider,
    latencyMs,
    productCount: Number(countRow.c) || 0,
    documentsScanned,
    usedLike,
    matcherMeta: exec.matcherMeta || null,
  };
}

async function main() {
  const { ensureSearchIndexSchema } = await import("../services/search/ensureSearchIndexSchema.js");
  const { pool } = await import("../config/db.js");
  const { CURRENT_SEARCH_INDEX_VERSION } = await import("../config/searchIndexConfig.js");
  const { rebuildAll } = await import("../services/search/SearchIndexSyncService.js");
  const { resolveIndexSearchExecution } = await import("../services/search/runtime/indexSearchExecution.js");
  const { isSearchMatcherIndexEnabled } = await import("../config/searchMatcherIndexConfig.js");

  await ensureSearchIndexSchema(pool);

  const [[{ stale }]] = await pool.query(
    `SELECT COUNT(*) AS stale FROM product_search_index WHERE search_version < ? OR normalized_tokens IS NULL LIMIT 1`,
    [CURRENT_SEARCH_INDEX_VERSION],
  );
  if (Number(stale) > 0) {
    console.log(`[matcher-01] rebuilding ${stale} stale index rows (v${CURRENT_SEARCH_INDEX_VERSION})...`);
    await rebuildAll({ batchSize: 200, staleVersionOnly: true });
  }

  const [[{ tokenOk }]] = await pool.query(
    `SELECT COUNT(*) AS tokenOk FROM product_search_index WHERE normalized_tokens IS NOT NULL LIMIT 1`,
  );

  const prevMatcher = process.env.SEARCH_MATCHER_INDEX;
  const prevRuntime = process.env.SEARCH_RUNTIME;

  process.env.SEARCH_RUNTIME = "hybrid";
  delete process.env.SEARCH_MATCHER_INDEX;

  const hybridResults = [];
  for (const q of QUERIES) {
    hybridResults.push(await benchExec(q.label, resolveIndexSearchExecution, q.query));
  }

  process.env.SEARCH_MATCHER_INDEX = "1";
  const matcherResults = [];
  for (const q of QUERIES) {
    matcherResults.push(await benchExec(q.label, resolveIndexSearchExecution, q.query));
  }

  if (prevMatcher !== undefined) process.env.SEARCH_MATCHER_INDEX = prevMatcher;
  else delete process.env.SEARCH_MATCHER_INDEX;
  if (prevRuntime !== undefined) process.env.SEARCH_RUNTIME = prevRuntime;
  else delete process.env.SEARCH_RUNTIME;

  const { LegacySearchRuntime } = await import("../services/search/runtime/LegacySearchRuntime.js");
  const legacyResults = [];
  for (const q of QUERIES) {
    const t0 = performance.now();
    const top = await LegacySearchRuntime.searchTopProductIds(q.query, 20);
    legacyResults.push({
      label: q.label,
      provider: top.provider || "legacy",
      latencyMs: Math.round((performance.now() - t0) * 100) / 100,
      productCount: top.ids?.length || 0,
      documentsScanned: 0,
      usedLike: String(top.provider || "").includes("like"),
    });
  }

  const likeFallbackCount = matcherResults.filter((r) => r.usedLike).length;
  const likeFallbackRate = Math.round((likeFallbackCount / QUERIES.length) * 1000) / 10;

  console.log("\n=== SEARCH-INDEX-MATCHER-01 benchmark ===\n");
  console.log(
    "Query".padEnd(18),
    "Legacy(ms)".padEnd(12),
    "Hybrid(ms)".padEnd(12),
    "Matcher(ms)".padEnd(12),
    "Matcher provider".padEnd(22),
    "Docs",
    "LIKE?",
  );
  for (const q of QUERIES) {
    const leg = legacyResults.find((r) => r.label === q.label);
    const hyb = hybridResults.find((r) => r.label === q.label);
    const mat = matcherResults.find((r) => r.label === q.label);
    console.log(
      q.label.padEnd(18),
      String(leg?.latencyMs ?? "—").padEnd(12),
      String(hyb?.latencyMs ?? "—").padEnd(12),
      String(mat?.latencyMs ?? "—").padEnd(12),
      String(mat?.provider ?? "—").padEnd(22),
      String(mat?.documentsScanned ?? "—"),
      mat?.usedLike ? "yes" : "no",
    );
  }

  console.log(`\nLIKE fallback rate (matcher): ${likeFallbackRate}%`);
  console.log(`Matcher enabled at runtime: ${isSearchMatcherIndexEnabled() ? "yes (during bench)" : "no (restored)"}`);
  console.log(`Token columns populated: ${Number(tokenOk) > 0 ? "yes" : "no"}`);

  const outDir = path.join(__dirname, "../../audit/search-index-matcher-01");
  fs.mkdirSync(outDir, { recursive: true });

  const payload = {
    searchIndexVersion: CURRENT_SEARCH_INDEX_VERSION,
    tokenColumnsPresent: Number(tokenOk) > 0,
    likeFallbackRate,
    queries: QUERIES.map((q) => ({
      label: q.label,
      legacy: legacyResults.find((r) => r.label === q.label),
      hybrid: hybridResults.find((r) => r.label === q.label),
      matcher: matcherResults.find((r) => r.label === q.label),
    })),
  };
  fs.writeFileSync(path.join(outDir, "benchmark-results.json"), JSON.stringify(payload, null, 2));

  writeDeliverables(outDir, payload);

  const matcherHitsProducts = matcherResults.filter(
    (r) => r.productCount > 0 && !String(r.provider).includes("like"),
  ).length;

  if (Number(tokenOk) === 0) {
    console.error("\nFAIL — normalized_tokens not populated; run index rebuild");
    process.exit(1);
  }

  console.log(`\nPASS — matcher resolved ${matcherHitsProducts}/${QUERIES.length} queries without LIKE`);
  await pool.end();
}

function writeDeliverables(outDir, payload) {
  fs.writeFileSync(
    path.join(outDir, "matcher-architecture.md"),
    `# Matcher Architecture

## Flow

\`\`\`
Query
  ↓
SearchMatcher.resolveMatcherExecution()
  ↓ Normalize (Unicode, VN accents, OEM, case)
  ↓ Tokenize (single, phrase, compound)
  ↓ Expand (DB synonym graph)
  ↓ Candidate retrieval (product_search_index only)
  ↓ Scoring (JS rank on index rows)
  ↓ Return IndexSearchExecution (document ids + ORDER BY CASE)
  ↓
Grouping / Popup (unchanged)
\`\`\`

## Feature flag

\`SEARCH_MATCHER_INDEX=0\` (default) — existing exact → FULLTEXT → LIKE cascade.

\`SEARCH_MATCHER_INDEX=1\` — matcher tried first; LIKE only when matcher returns null.

## Integration

\`resolveIndexSearchExecution()\` in \`indexSearchExecution.js\` calls matcher when flag is on.
`,
  );

  fs.writeFileSync(
    path.join(outDir, "tokenization.md"),
    `# Tokenization

## Query tokens

From folded query string:

- **single**: \`bugi\`, \`toyota\`
- **phrases**: \`bugi toyota\` (n-grams n=2..4)
- **compound**: union of single + phrases

## Index tokens (sync time)

Built in \`searchIndexDocumentTokens.js\` from:

- search_text, product_name, search_keywords, part_number
- category_name, brand_name, model_name, vehicle_label

Stored space-padded in:

- \`search_tokens\`
- \`normalized_tokens\` (foldVi)
- \`synonym_tokens\` (graph expansion at sync)
`,
  );

  fs.writeFileSync(
    path.join(outDir, "synonym-source.md"),
    `# Synonym Sources

Loaded at runtime and sync from DB (no hardcoded map):

| Source | Fields |
|--------|--------|
| \`category_dictionary\` | match_keyword ↔ canonical_name |
| \`car_models\` | hang_xe, ten_xe |
| \`product_categories\` | category_name ↔ canonical_name |
| \`search_synonyms\` | term ↔ synonym (optional table) |

Cache TTL: 5 minutes (\`searchMatcherSynonymSource.js\`).
`,
  );

  const rows = payload.queries
    .map((r) => {
      const leg = r.legacy || {};
      const hyb = r.hybrid || {};
      const mat = r.matcher || {};
      return `| ${r.label} | ${leg.latencyMs ?? "—"} | ${hyb.latencyMs ?? "—"} | ${mat.latencyMs ?? "—"} | ${mat.provider ?? "—"} | ${mat.documentsScanned ?? "—"} | ${mat.usedLike ? "yes" : "no"} |`;
    })
    .join("\n");

  fs.writeFileSync(
    path.join(outDir, "benchmark.md"),
    `# Benchmark

| Query | Legacy (ms) | Hybrid (ms) | Matcher (ms) | Provider | Docs scanned | LIKE |
|-------|-------------|-------------|--------------|----------|--------------|------|
${rows}

LIKE fallback rate: **${payload.likeFallbackRate}%**
`,
  );

  fs.writeFileSync(
    path.join(outDir, "comparison.md"),
    `# Comparison

| Path | Candidate source | LIKE role |
|------|------------------|-----------|
| Legacy | products + fitment JOINs | primary |
| Hybrid index | FULLTEXT on search_text | fallback |
| Matcher | normalized_tokens / synonym_tokens | last resort |

Rollback: \`SEARCH_MATCHER_INDEX=0\`
`,
  );

  fs.writeFileSync(
    path.join(outDir, "SEARCH-INDEX-MATCHER-01.md"),
    `# SEARCH-INDEX-MATCHER-01

Dedicated SearchMatcher on \`product_search_index\`. Flag: \`SEARCH_MATCHER_INDEX\` (default \`0\`).

See [matcher-architecture.md](./matcher-architecture.md), [benchmark.md](./benchmark.md).
`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
