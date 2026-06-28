#!/usr/bin/env node
/**
 * SEARCH-INDEX-GROUP-RUNTIME-01 — group parity + benchmark (flag 0 vs 1).
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "..", "audit", "search-index-group-runtime-01");
const require = createRequire(path.join(ROOT, "package.json"));
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "má phanh vios", query: { query: "má phanh vios", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
];

function groupKey(g) {
  return [
    String(g.canonical_slug || g.canonical_name || "").toLowerCase(),
    String(g.brand || "").toLowerCase(),
    String(g.model || "").toLowerCase(),
  ].join("|");
}

function summarizeGroups(payload) {
  const vehicle = (payload.groups || []).map((g) => ({
    key: groupKey(g),
    title: g.title,
    count: g.count,
    url: g.url,
    brand: g.brand,
    model: g.model,
    canonical_slug: g.canonical_slug,
  }));
  const categories = (payload.categories || []).map((c) => ({
    key: String(c.canonical_slug || c.canonical_name || "").toLowerCase(),
    count: c.total_count,
    canonical_slug: c.canonical_slug,
  }));
  const products = [];
  for (const g of payload.groups || []) {
    for (const p of g.products || []) products.push(Number(p.id));
  }
  return { vehicle, categories, products, viewAll: payload.viewAll };
}

function analyzeSql(sql) {
  const s = String(sql).toLowerCase();
  return {
    isGroupQuery: /\bgroup by\b/.test(s) && /\bproduct_search_index\b/.test(s),
    usesProducts: /\bfrom products\b|\bjoin products\b/.test(s),
    usesFitment: /\bproduct_car_applications\b/.test(s),
    usesCategories: /\bproduct_categories\b/.test(s),
    usesShops: /\bjoin shops\b|\bfrom shops\b/.test(s),
    usesIndex: /\bproduct_search_index\b/.test(s),
  };
}

async function explainGroupQuery(pool, exec) {
  const { fetchIndexGroupedInventory } = await import(
    "../services/search/runtime/indexSearchExecution.js"
  );
  const body = String(exec.where || "").replace(/^\s*AND\s*/i, "").trim();
  const sql = `
    SELECT 'vehicle' AS grain, category_id,
      MAX(category_name) AS canonical_name, MAX(category_slug) AS canonical_slug,
      MAX(brand_name) AS brand, MAX(model_name) AS model,
      brand_slug, model_slug,
      COUNT(DISTINCT product_id) AS total_count
    FROM product_search_index psi
    WHERE ${body}
      AND brand_slug IS NOT NULL AND TRIM(brand_slug) <> ''
      AND model_slug IS NOT NULL AND TRIM(model_slug) <> ''
    GROUP BY category_id, category_slug, brand_slug, model_slug
    HAVING total_count > 0
  `;
  try {
    const [rows] = await pool.query(`EXPLAIN ANALYZE ${sql}`, exec.params);
    const text = rows.map((r) => r.EXPLAIN || JSON.stringify(r)).join("\n");
    return {
      sql: sql.replace(/\s+/g, " ").trim(),
      rowsExamined: Number(text.match(/rows examined: (\d+)/i)?.[1] || 0),
      executionTimeMs: Number(text.match(/actual time: [\d.]+\.\.([\d.]+)/i)?.[1] || 0),
      usesFilesort: /filesort/i.test(text),
      usesTempTable: /temporary table/i.test(text),
      snippet: text.slice(0, 1500),
    };
  } catch (e) {
    return { error: String(e.message), sql: sql.slice(0, 400) };
  }
}

async function runSuggest(pool, query, groupIndex) {
  process.env.SEARCH_GROUP_INDEX = groupIndex ? "1" : "0";
  process.env.SEARCH_POPUP_INDEX = "0";

  const { resetSearchRuntimeCache } = await import("../services/search/runtime/searchRuntime.js");
  resetSearchRuntimeCache();

  const { buildSearchSuggestResponse } = await import("../services/searchSuggest.service.js");

  const sqlLog = [];
  const orig = pool.query.bind(pool);
  pool.query = async (sql, params) => {
    const t0 = performance.now();
    const r = await orig(sql, params);
    const info = analyzeSql(typeof sql === "string" ? sql : String(sql));
    if (info.isGroupQuery || (info.usesIndex && /\bgroup by\b/i.test(String(sql)))) {
      sqlLog.push({
        ms: Math.round((performance.now() - t0) * 100) / 100,
        ...info,
        head: String(sql).replace(/\s+/g, " ").trim().slice(0, 160),
      });
    }
    return r;
  };

  const t0 = performance.now();
  const payload = await buildSearchSuggestResponse(query);
  const wallMs = Math.round((performance.now() - t0) * 100) / 100;
  pool.query = orig;

  return { wallMs, payload, groupSql: sqlLog, summary: summarizeGroups(payload) };
}

function compareGroups(legacy, index) {
  const lv = new Map(legacy.vehicle.map((g) => [g.key, g]));
  const iv = new Map(index.vehicle.map((g) => [g.key, g]));
  const keys = new Set([...lv.keys(), ...iv.keys()]);
  let match = 0;
  let countMatch = 0;
  const diffs = [];
  for (const k of keys) {
    const a = lv.get(k);
    const b = iv.get(k);
    if (a && b) {
      match += 1;
      if (a.count === b.count) countMatch += 1;
      else diffs.push({ key: k, legacyCount: a.count, indexCount: b.count });
    } else {
      diffs.push({ key: k, legacy: !!a, index: !!b });
    }
  }
  const parity = keys.size ? match / keys.size : 1;
  const countParity = match ? countMatch / match : 1;

  const lc = new Map(legacy.categories.map((c) => [c.key, c]));
  const ic = new Map(index.categories.map((c) => [c.key, c]));
  const ckeys = new Set([...lc.keys(), ...ic.keys()]);
  let catMatch = 0;
  for (const k of ckeys) {
    if (lc.has(k) && ic.has(k) && lc.get(k).count === ic.get(k).count) catMatch += 1;
  }
  const catParity = ckeys.size ? catMatch / ckeys.size : 1;

  const legacyTop = legacy.products.slice(0, 20);
  const indexTop = index.products.slice(0, 20);
  const topOverlap = legacyTop.filter((id, i) => indexTop[i] === id).length / Math.max(legacyTop.length, 1);

  return {
    vehicleGroupParity: Math.round(parity * 100000) / 1000,
    vehicleCountParity: Math.round(countParity * 100000) / 1000,
    categoryParity: Math.round(catParity * 100000) / 1000,
    top20OrderOverlap: Math.round(topOverlap * 100000) / 1000,
    viewAllMatch: JSON.stringify(legacy.viewAll) === JSON.stringify(index.viewAll),
    diffs: diffs.slice(0, 15),
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { pool } = await import("../config/db.js");
  const { resolveIndexSearchExecution } = await import(
    "../services/search/runtime/indexSearchExecution.js"
  );

  const benchmarks = [];
  const comparisons = [];
  const plans = [];

  for (const testCase of CASES) {
    const off = await runSuggest(pool, testCase.query, false);
    const on = await runSuggest(pool, testCase.query, true);
    const cmp = compareGroups(off.summary, on.summary);

    comparisons.push({ label: testCase.label, ...cmp });

    benchmarks.push({
      label: testCase.label,
      legacyMs: off.wallMs,
      indexGroupMs: on.wallMs,
      legacyGroupSqlUsesProducts: off.groupSql.some((s) => s.usesProducts),
      indexGroupSqlUsesIndexOnly: on.groupSql.length > 0
        && on.groupSql.every((s) => s.usesIndex && !s.usesProducts && !s.usesFitment),
      indexGroupSqlCount: on.groupSql.length,
    });

    if (plans.length < 2) {
      const exec = await resolveIndexSearchExecution({
        ...testCase.query,
        keyword: testCase.query.query,
        query: testCase.query.query,
      });
      plans.push({ label: testCase.label, ...(await explainGroupQuery(pool, exec)) });
    }
  }

  process.env.SEARCH_GROUP_INDEX = "0";
  const { resetSearchRuntimeCache } = await import("../services/search/runtime/searchRuntime.js");
  resetSearchRuntimeCache();

  const avgVehicleParity = comparisons.reduce((s, c) => s + c.vehicleGroupParity, 0) / comparisons.length;
  const report = {
    generatedAt: new Date().toISOString(),
    benchmarks,
    comparisons,
    executionPlans: plans,
    avgVehicleGroupParity: Math.round(avgVehicleParity * 1000) / 1000,
    pass: avgVehicleParity >= 99.9 && comparisons.every((c) => c.indexGroupSqlUsesIndexOnly !== false),
  };

  fs.writeFileSync(path.join(OUT, "benchmark.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "benchmark.md"), buildBenchmarkMd(report));
  fs.writeFileSync(path.join(OUT, "group-parity.md"), buildParityMd(report));
  fs.writeFileSync(path.join(OUT, "execution-plan.md"), buildPlanMd(report));
  fs.writeFileSync(path.join(OUT, "comparison.md"), buildComparisonMd(report));
  fs.writeFileSync(
    path.join(OUT, "..", "SEARCH-INDEX-GROUP-RUNTIME-01.md"),
    buildBenchmarkMd(report) + "\n\n---\n\n" + buildParityMd(report),
  );

  console.log("\n=== SEARCH-INDEX-GROUP-RUNTIME-01 ===");
  console.log("Avg vehicle group parity:", report.avgVehicleGroupParity + "%");
  console.log("PASS:", report.pass ? "YES" : "NO");
  console.log("Output:", OUT);

  await pool.end();
  process.exit(report.pass ? 0 : 1);
}

function buildBenchmarkMd(r) {
  return `# SEARCH-INDEX-GROUP-RUNTIME-01 — Benchmark

Generated: ${r.generatedAt}

Flag: \`SEARCH_GROUP_INDEX\` (default **0**)

| Query | Legacy ms | Index group ms | Index-only group SQL |
|-------|-----------|----------------|----------------------|
${r.benchmarks.map((b) => `| ${b.label} | ${b.legacyMs} | ${b.indexGroupMs} | ${b.indexGroupSqlUsesIndexOnly ? "yes" : "no"} |`).join("\n")}

Avg vehicle group key parity: **${r.avgVehicleGroupParity}%**
`;
}

function buildParityMd(r) {
  return `# Group parity

| Query | Vehicle groups | Counts | Categories | Top-20 order | ViewAll |
|-------|----------------|--------|------------|--------------|---------|
${r.comparisons.map((c) => `| ${c.label} | ${c.vehicleGroupParity}% | ${c.vehicleCountParity}% | ${c.categoryParity}% | ${c.top20OrderOverlap}% | ${c.viewAllMatch ? "match" : "diff"} |`).join("\n")}

Target: >= 99.9% vehicle group parity.
`;
}

function buildPlanMd(r) {
  return `# Execution plans (index group SQL)

${r.executionPlans.map((p) => `## ${p.label}

\`\`\`sql
${p.sql || p.error || ""}
\`\`\`

- Rows examined: ${p.rowsExamined ?? "n/a"}
- Time: ${p.executionTimeMs ?? "n/a"}ms
- Filesort: ${p.usesFilesort ? "yes" : "no"}
- Temp table: ${p.usesTempTable ? "yes" : "no"}

${p.snippet ? `\`\`\`\n${p.snippet}\n\`\`\`` : ""}
`).join("\n")}
`;
}

function buildComparisonMd(r) {
  return `# Legacy vs index grouping

When \`SEARCH_GROUP_INDEX=1\`:

- Grouping reads **only** \`product_search_index\`
- GROUP BY stable keys: \`category_id\`, \`category_slug\`, \`brand_slug\`, \`model_slug\`
- Count: \`COUNT(DISTINCT product_id)\` on index (no products JOIN)
- Ranking, parser, popup assembly unchanged

Rollback: \`SEARCH_GROUP_INDEX=0\`
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
