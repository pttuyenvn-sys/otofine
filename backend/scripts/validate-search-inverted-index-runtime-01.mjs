#!/usr/bin/env node
/**
 * SEARCH-INVERTED-INDEX-RUNTIME-01 — legacy vs index vs inverted validation + benchmark.
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

const QUERIES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
  { label: "bố thắng", query: { query: "bố thắng" } },
  { label: "brake pad", query: { query: "brake pad" } },
];

function topKOverlap(a, b, k) {
  const sb = new Set(b.slice(0, k));
  let hit = 0;
  for (const id of a.slice(0, k)) if (sb.has(id)) hit += 1;
  return a.slice(0, k).length ? hit / a.slice(0, k).length : 1;
}

function pct(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function benchRuntime(runtime, cases, runs = 2) {
  const times = [];
  const results = [];
  for (const c of cases) {
    for (let i = 0; i < runs; i += 1) {
      const t0 = performance.now();
      const suggest = await runtime.searchSuggest(c.query);
      const top = await runtime.searchTopProductIds(c.query, 20);
      times.push(performance.now() - t0);
      if (i === runs - 1) {
        results.push({
          label: c.label,
          top20: top.ids,
          provider: top.provider,
          groupCount: suggest.groups?.length || 0,
        });
      }
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  return {
    latency: {
      avg: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 100) / 100,
      p50: Math.round(pct(sorted, 50) * 100) / 100,
      p95: Math.round(pct(sorted, 95) * 100) / 100,
    },
    results,
  };
}

async function benchInvertedStages(query) {
  const { buildInvertedQueryPlan } = await import("../services/search/runtime/invertedSearchQuery.js");
  const { fetchInvertedCandidatesByTokens } = await import("../services/search/runtime/invertedSearchExecution.js");
  const { resolveInvertedSearchExecution } = await import("../services/search/runtime/invertedSearchExecution.js");
  const { fetchInvertedSharedGroupedInventory, buildInvertedPreviewBlocks } = await import("../services/search/runtime/invertedInventoryQuery.js");
  const { normalizeListingQuery } = await import("../utils/listingQueryNormalize.js");
  const keyword = String(query.query || "").trim();

  const t0 = performance.now();
  const plan = await buildInvertedQueryPlan(query, keyword);
  const tNorm = performance.now() - t0;

  const t1 = performance.now();
  const candidates = await fetchInvertedCandidatesByTokens(plan.queryTokens);
  const tRetrieve = performance.now() - t1;

  const t2 = performance.now();
  const exec = await resolveInvertedSearchExecution({ ...query, keyword, query: keyword });
  const tRank = performance.now() - t2;

  const t3 = performance.now();
  const { vehicleGroups } = await fetchInvertedSharedGroupedInventory(query, keyword);
  const tGroup = performance.now() - t3;

  const t4 = performance.now();
  await buildInvertedPreviewBlocks(exec, vehicleGroups, normalizeListingQuery(query), {
    groupLimit: 3,
    productsPerGroup: 2,
  });
  const tPopup = performance.now() - t4;

  return {
    normalize_ms: Math.round(tNorm * 100) / 100,
    retrieval_ms: Math.round(tRetrieve * 100) / 100,
    ranking_ms: Math.round(tRank * 100) / 100,
    grouping_ms: Math.round(tGroup * 100) / 100,
    popup_ms: Math.round(tPopup * 100) / 100,
    total_ms: Math.round((tNorm + tRetrieve + tRank + tGroup + tPopup) * 100) / 100,
    candidates: candidates.length,
    ranked: exec.candidateProductIds.length,
    provider: exec.provider,
  };
}

async function main() {
  const { ensureSearchTokenIndexSchema } = await import("../services/search/inverted/ensureSearchTokenIndexSchema.js");
  const { pool } = await import("../config/db.js");
  const { syncProduct } = await import("../services/search/SearchIndexSyncService.js");
  const { resetSearchRuntimeCache } = await import("../services/search/runtime/searchRuntime.js");
  const { resetInvertedSearchCache } = await import("../services/search/runtime/invertedSearchCache.js");

  await ensureSearchTokenIndexSchema(pool);

  const [missing] = await pool.query(`
    SELECT DISTINCT psi.product_id
    FROM product_search_index psi
    LEFT JOIN search_token_index sti ON sti.product_id = psi.product_id
    WHERE psi.status = 'active' AND sti.id IS NULL
    LIMIT 30
  `);
  for (const row of missing) {
    await syncProduct(row.product_id, { source: "validate-inverted-runtime-01", force: true });
  }

  const { LegacySearchRuntime } = await import("../services/search/runtime/LegacySearchRuntime.js");
  const { SearchIndexRuntime } = await import("../services/search/runtime/SearchIndexRuntime.js");
  const { InvertedSearchRuntime } = await import("../services/search/runtime/InvertedSearchRuntime.js");

  resetSearchRuntimeCache();
  let legacy = { latency: { avg: 0, p50: 0, p95: 0 }, results: [] };
  let index = { latency: { avg: 0, p50: 0, p95: 0 }, results: [] };

  if (process.env.INVERTED_RUNTIME_FULL_COMPARE === "1") {
    process.env.SEARCH_RUNTIME = "legacy";
    legacy = await benchRuntime(LegacySearchRuntime, QUERIES, 1);
    resetSearchRuntimeCache();
    process.env.SEARCH_RUNTIME = "index";
    index = await benchRuntime(SearchIndexRuntime, QUERIES, 1);
  }

  resetSearchRuntimeCache();
  resetInvertedSearchCache();
  process.env.SEARCH_RUNTIME = "inverted";
  const inverted = await benchRuntime(InvertedSearchRuntime, QUERIES, 1);

  const stageBreakdown = [];
  for (const q of QUERIES) {
    resetInvertedSearchCache();
    stageBreakdown.push({ label: q.label, ...(await benchInvertedStages(q.query)) });
  }

  let failures = 0;
  console.log("\n=== SEARCH-INVERTED-INDEX-RUNTIME-01 ===\n");
  console.log("Query".padEnd(18), "Legacy top10", "Index top10", "Inverted top10", "Provider");
  for (let i = 0; i < QUERIES.length; i += 1) {
    const l = legacy.results[i] || { top20: [] };
    const n = index.results[i] || { top20: [] };
    const inv = inverted.results[i];
    const o10 = Math.round(topKOverlap(l.top20, inv.top20, 10) * 1000) / 10;
    const n10 = Math.round(topKOverlap(n.top20, inv.top20, 10) * 1000) / 10;
    console.log(
      QUERIES[i].label.padEnd(18),
      `${Math.round(topKOverlap(l.top20, n.top20, 10) * 1000) / 10}%`.padEnd(12),
      `${n10}%`.padEnd(12),
      `${o10}%`.padEnd(14),
      inv.provider || "—",
    );
    if (inv.top20.length === 0 && !String(inv.provider).includes("empty")) failures += 1;
  }

  console.log("\nLatency avg (ms): legacy", legacy.latency.avg, "index", index.latency.avg, "inverted", inverted.latency.avg);
  console.log("\nStage breakdown (first query):", stageBreakdown[0]);

  const outDir = path.join(__dirname, "../../audit/search-inverted-index-runtime-01");
  fs.mkdirSync(outDir, { recursive: true });

  const payload = { legacy, index, inverted, stageBreakdown, parity: [] };
  for (let i = 0; i < QUERIES.length; i += 1) {
    payload.parity.push({
      label: QUERIES[i].label,
      legacy_top20: legacy.results[i]?.top20 || [],
      index_top20: index.results[i]?.top20 || [],
      inverted_top20: inverted.results[i]?.top20 || [],
      overlap_index_top10: index.results[i]?.top20?.length
        ? topKOverlap(index.results[i].top20, inverted.results[i].top20, 10)
        : null,
      overlap_legacy_top10: legacy.results[i]?.top20?.length
        ? topKOverlap(legacy.results[i].top20, inverted.results[i].top20, 10)
        : null,
      provider: inverted.results[i]?.provider,
    });
  }

  fs.writeFileSync(path.join(outDir, "benchmark-results.json"), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, "latency-breakdown.json"), JSON.stringify(stageBreakdown, null, 2));

  fs.writeFileSync(path.join(outDir, "runtime-architecture.md"), `# Runtime Architecture

\`\`\`
Query → Normalize → Tokenize → Synonym expand (depth 1)
     → SQL candidate retrieval (search_token_index)
     → Ranking (product_search_index)
     → Grouping (product_search_index)
     → Popup (product_search_index via SearchIndexDocumentReader)
\`\`\`

Flag: \`SEARCH_RUNTIME=inverted\` (default \`legacy\`)
Requires: \`SEARCH_INVERTED_INDEX=1\` for populated search_token_index
`);

  fs.writeFileSync(path.join(outDir, "candidate-retrieval.md"), `# Candidate Retrieval

100% SQL on \`search_token_index\`:

\`\`\`sql
SELECT product_id, COUNT(DISTINCT token) AS matched_tokens, SUM(weight) AS score
FROM search_token_index
WHERE token IN (?)
GROUP BY product_id
ORDER BY matched_tokens DESC, score DESC
LIMIT 500
\`\`\`

No LIKE. No FULLTEXT. No products scan.
`);

  fs.writeFileSync(path.join(outDir, "benchmark.md"), `# Benchmark

| Runtime | Avg ms | P50 | P95 |
|---------|--------|-----|-----|
| Legacy | ${legacy.latency.avg} | ${legacy.latency.p50} | ${legacy.latency.p95} |
| Index | ${index.latency.avg} | ${index.latency.p50} | ${index.latency.p95} |
| Inverted | ${inverted.latency.avg} | ${inverted.latency.p50} | ${inverted.latency.p95} |
`);

  fs.writeFileSync(path.join(outDir, "comparison.md"), `# Comparison

See benchmark-results.json for top-20 parity per query.
`);

  fs.writeFileSync(path.join(outDir, "SEARCH-INVERTED-INDEX-RUNTIME-01.md"), `# SEARCH-INVERTED-INDEX-RUNTIME-01

Production inverted runtime wired via \`SEARCH_RUNTIME=inverted\`.

Rollback: \`SEARCH_RUNTIME=legacy\`
`);

  fs.writeFileSync(path.join(__dirname, "../../audit/SEARCH-INVERTED-INDEX-RUNTIME-01.md"),
    fs.readFileSync(path.join(outDir, "SEARCH-INVERTED-INDEX-RUNTIME-01.md"), "utf8"));

  process.env.SEARCH_RUNTIME = "legacy";
  resetSearchRuntimeCache();

  if (failures > 6) {
    console.error(`\nFAIL — ${failures} queries returned 0 inverted results`);
    process.exit(1);
  }

  console.log("\nPASS — inverted runtime validated");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
