#!/usr/bin/env node
/**
 * HYBRID-SEARCH-QUALITY-GATE-01 — strict parity vs quality gate benchmark.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "hybrid-search-quality-gate-01");
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });

const CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "bugi", query: { query: "bugi" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
];

function pct(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarize(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    p50: Math.round(pct(sorted, 50)),
    p95: Math.round(pct(sorted, 95)),
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
}

async function benchDecisionMode(mode, pool, n = 10) {
  process.env.SEARCH_ENGINE_MODE = "hybrid";
  process.env.SEARCH_DECISION_MODE = mode;
  process.env.SEARCH_ENGINE_DEBUG = "0";

  const { resetSearchDecisionCache } = await import(
    "../backend/services/search/providers/searchProviderChain.js"
  );
  const { resetFulltextDetection } = await import(
    "../backend/services/search/providers/fullTextSearchProvider.js"
  );
  const { buildSearchInventoryContext } = await import(
    "../backend/services/search/searchInventoryQuery.js"
  );
  const { buildSearchSuggestResponse } = await import(
    "../backend/services/searchSuggest.service.js"
  );

  /** @type {Record<string, unknown>} */
  const byCase = {};
  let fulltextCount = 0;
  let likeCount = 0;
  let exactCount = 0;

  for (const c of CASES) {
    const times = [];
    let provider = "";

    for (let i = 0; i < n; i += 1) {
      resetSearchDecisionCache();
      resetFulltextDetection();
      const kw = String(c.query.query || "");
      const t0 = performance.now();
      await buildSearchSuggestResponse(c.query);
      times.push(performance.now() - t0);
      const ctx = await buildSearchInventoryContext(c.query, kw);
      provider = ctx.searchProvider || "";
    }

    if (provider.includes("fulltext")) fulltextCount += 1;
    else if (provider === "like-fallback") likeCount += 1;
    else if (provider === "exact") exactCount += 1;

    byCase[c.label] = {
      latencyMs: summarize(times),
      lastProvider: provider,
    };
  }

  const total = CASES.length;
  return {
    byCase,
    usage: {
      fulltextPct: Math.round((fulltextCount / total) * 100),
      likePct: Math.round((likeCount / total) * 100),
      exactPct: Math.round((exactCount / total) * 100),
    },
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { pool } = await import("../backend/config/db.js");

  const strictParity = await benchDecisionMode("strict_parity", pool, 8);
  const qualityGate = await benchDecisionMode("quality_gate", pool, 8);

  const payload = {
    generatedAt: new Date().toISOString(),
    qualityGateThreshold: Number(process.env.QUALITY_GATE_THRESHOLD) || 85,
    strictParity,
    qualityGate,
  };

  fs.writeFileSync(path.join(OUT, "benchmark.json"), JSON.stringify(payload, null, 2));

  const md = `# HYBRID-SEARCH-QUALITY-GATE-01 — Benchmark

Generated: ${payload.generatedAt}

## Provider usage (last run per query)

| Query | Strict parity | Quality gate | Strict P50 | QG P50 |
|-------|---------------|--------------|------------|--------|
${CASES.map((c) => {
  const s = strictParity.byCase[c.label];
  const q = qualityGate.byCase[c.label];
  return `| ${c.label} | ${s.lastProvider} | ${q.lastProvider} | ${s.latencyMs.p50}ms | ${q.latencyMs.p50}ms |`;
}).join("\n")}

## Aggregate usage

| Mode | FULLTEXT % | LIKE % | Exact % |
|------|------------|--------|---------|
| Strict parity | ${strictParity.usage.fulltextPct}% | ${strictParity.usage.likePct}% | ${strictParity.usage.exactPct}% |
| Quality gate | ${qualityGate.usage.fulltextPct}% | ${qualityGate.usage.likePct}% | ${qualityGate.usage.exactPct}% |
`;
  fs.writeFileSync(path.join(OUT, "benchmark.md"), md);
  console.log(md);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
