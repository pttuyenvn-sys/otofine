#!/usr/bin/env node
/**
 * HYBRID-SEARCH-ENGINE-IMPLEMENT-01 — legacy vs hybrid benchmark.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "hybrid-search-engine-implement-01");
const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });

const CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "bugi camry", query: { query: "bugi camry", brand: "Toyota", model: "Camry" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
];

function pct(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarize(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    n: sorted.length,
    min: Math.round(sorted[0]),
    p50: Math.round(pct(sorted, 50)),
    p95: Math.round(pct(sorted, 95)),
    max: Math.round(sorted[sorted.length - 1]),
    avg: Math.round(avg),
  };
}

async function benchMode(mode, pool, n = 15) {
  process.env.SEARCH_ENGINE_MODE = mode;
  const { resetFulltextDetection } = await import(
    "../backend/services/search/providers/fullTextSearchProvider.js"
  );
  resetFulltextDetection();
  const { buildSearchSuggestResponse } = await import(
    "../backend/services/searchSuggest.service.js"
  );

  /** @type {Record<string, unknown>} */
  const byCase = {};

  for (const c of CASES) {
    const times = [];
    let sqlCount = 0;
    const orig = pool.query.bind(pool);
    pool.query = async (...args) => {
      sqlCount += 1;
      return orig(...args);
    };

    for (let i = 0; i < n; i += 1) {
      const t0 = performance.now();
      await buildSearchSuggestResponse(c.query);
      times.push(performance.now() - t0);
    }
    pool.query = orig;

    byCase[c.label] = {
      latencyMs: summarize(times),
      sqlPerRequest: Math.round(sqlCount / n),
      coldFirstMs: Math.round(times[0]),
      warmRestMs: summarize(times.slice(1)),
    };
  }

  return byCase;
}

async function benchHttp(n = 10) {
  const times = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    const res = await fetch(`${API}/search/suggest?query=bugi&brand=Toyota`);
    await res.json();
    times.push(performance.now() - t0);
  }
  return summarize(times);
}

async function indexAudit(pool) {
  const db = process.env.DB_NAME;
  const names = [
    "ft_products_search_text",
    "ft_product_meta_keywords",
    "idx_product_meta_slug",
    "idx_products_part_number",
  ];
  const [rows] = await pool.query(
    `SELECT TABLE_NAME, INDEX_NAME, INDEX_TYPE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND INDEX_NAME IN (${names.map(() => "?").join(",")})
     GROUP BY TABLE_NAME, INDEX_NAME, INDEX_TYPE`,
    [db, ...names],
  );
  return rows;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { pool } = await import("../backend/config/db.js");

  const indexes = await indexAudit(pool);
  const legacy = await benchMode("legacy", pool, 12);
  const hybrid = await benchMode("hybrid", pool, 12);
  let http = null;
  try {
    http = await benchHttp(10);
  } catch (e) {
    http = { error: String(e.message || e) };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    searchEngineMode: process.env.SEARCH_ENGINE_MODE || "hybrid",
    indexes,
    serviceBenchmark: { legacy, hybrid },
    httpSuggestBugiToyota: http,
  };

  fs.writeFileSync(path.join(OUT_DIR, "benchmark.json"), JSON.stringify(payload, null, 2));

  const md = `# HYBRID-SEARCH-ENGINE-IMPLEMENT-01 — Benchmark

Generated: ${payload.generatedAt}

## Indexes

${indexes.map((r) => `- \`${r.TABLE_NAME}.${r.INDEX_NAME}\` (${r.INDEX_TYPE}) — ${r.cols}`).join("\n")}

## Service latency (ms)

| Query | Legacy P50 | Hybrid P50 | Legacy SQL | Hybrid SQL |
|-------|------------|------------|------------|------------|
${CASES.map((c) => {
  const l = legacy[c.label].latencyMs;
  const h = hybrid[c.label].latencyMs;
  return `| ${c.label} | ${l.p50} | ${h.p50} | ${legacy[c.label].sqlPerRequest} | ${hybrid[c.label].sqlPerRequest} |`;
}).join("\n")}

## HTTP /search/suggest?query=bugi&brand=Toyota

${http.error ? `Error: ${http.error}` : `P50 ${http.p50}ms, P95 ${http.p95}ms, avg ${http.avg}ms`}

See \`benchmark.json\` for full data.
`;
  fs.writeFileSync(path.join(OUT_DIR, "benchmark.md"), md);
  console.log(md);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
