#!/usr/bin/env node
/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — legacy vs index runtime parity validation.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
];

function topKOverlap(a, b, k) {
  const sa = a.slice(0, k);
  const sb = new Set(b.slice(0, k));
  let hit = 0;
  for (const id of sa) if (sb.has(id)) hit += 1;
  return sa.length ? hit / sa.length : 1;
}

function pct(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
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
          viewAllUrl: suggest.viewAll?.url || "",
          firstGroupUrl: suggest.groups?.[0]?.url || "",
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
      p99: Math.round(pct(sorted, 99) * 100) / 100,
      max: Math.round(sorted[sorted.length - 1] * 100) / 100,
    },
    results,
  };
}

async function main() {
  const { ensureSearchIndexSchema } = await import("../services/search/ensureSearchIndexSchema.js");
  const { pool } = await import("../config/db.js");
  await ensureSearchIndexSchema(pool);

  const [[{ stale }]] = await pool.query(
    `SELECT COUNT(*) AS stale FROM product_search_index WHERE canonical_slug IS NULL LIMIT 1`,
  );
  if (Number(stale) > 500) {
    console.log(`[validate] backfilling ${stale} stale index rows...`);
    const { rebuildAll } = await import("../services/search/SearchIndexSyncService.js");
    await rebuildAll({ batchSize: 200, staleVersionOnly: true });
  }

  const { LegacySearchRuntime } = await import("../services/search/runtime/LegacySearchRuntime.js");
  const { SearchIndexRuntime } = await import("../services/search/runtime/SearchIndexRuntime.js");

  console.log("\n=== SEARCH-INDEX-RUNTIME-PHASE-02 validation ===\n");

  const legacy = await benchRuntime(LegacySearchRuntime, CASES, 2);
  const index = await benchRuntime(SearchIndexRuntime, CASES, 2);

  let failures = 0;
  for (let i = 0; i < CASES.length; i += 1) {
    const l = legacy.results[i];
    const n = index.results[i];
    const overlap10 = topKOverlap(l.top20, n.top20, 10);
    const overlap20 = topKOverlap(l.top20, n.top20, 20);
    const urlOk = l.viewAllUrl === n.viewAllUrl && l.firstGroupUrl === n.firstGroupUrl;
    console.log(
      `${CASES[i].label}: top10=${Math.round(overlap10 * 1000) / 10}% top20=${Math.round(overlap20 * 1000) / 10}% urls=${urlOk ? "OK" : "DIFF"} legacy=${l.provider} index=${n.provider}`,
    );
    if (l.viewAllUrl !== n.viewAllUrl) failures += 1;
  }

  console.log("\nLatency legacy (ms):", legacy.latency);
  console.log("Latency index (ms):", index.latency);

  if (failures > 0) {
    console.error(`\nFAIL — ${failures} URL mismatches (SEO must be identical)`);
    process.exit(1);
  }

  console.log("\nPASS — runtime parity check complete");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
