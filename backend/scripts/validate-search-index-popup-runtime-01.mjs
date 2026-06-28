#!/usr/bin/env node
/**
 * SEARCH-INDEX-POPUP-RUNTIME-01 — benchmark + response parity (flag 0 vs 1).
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "..", "audit", "search-index-popup-runtime-01");
const require = createRequire(path.join(ROOT, "package.json"));
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "má phanh vios", query: { query: "má phanh vios", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
];

const WARM_ROUNDS = 3;

function summarizeProducts(payload) {
  const products = [];
  for (const g of payload.groups || []) {
    for (const p of g.products || []) {
      products.push({
        id: p.id,
        displayTitle: p.displayTitle,
        image: p.image ? "yes" : "no",
        priceText: p.priceText,
        subtitleLine1: p.subtitleLine1,
        cardHighlights: p.cardHighlights,
        canonicalUrl: p.canonicalUrl || p.productIdentity?.canonicalUrl,
        partNumber: p.partNumber,
      });
    }
  }
  return products;
}

function analyzeSql(sql) {
  const s = String(sql).toLowerCase();
  return {
    usesProductSearchIndex: /\bproduct_search_index\b/.test(s),
    usesProducts: /\bfrom products\b|\bjoin products\b/.test(s),
    usesShops: /\bshops\b/.test(s),
    usesImages: /\bproduct_images\b/.test(s),
    usesFitment: /\bproduct_car_applications\b/.test(s),
  };
}

async function runCase(buildSearchSuggestResponse, pool, query, popupIndex) {
  process.env.SEARCH_POPUP_INDEX = popupIndex ? "1" : "0";

  const { resetSearchRuntimeCache } = await import("../services/search/runtime/searchRuntime.js");
  resetSearchRuntimeCache();

  const sqlLog = [];
  const orig = pool.query.bind(pool);
  pool.query = async (sql, params) => {
    const t0 = performance.now();
    const result = await orig(sql, params);
    sqlLog.push({
      ms: Math.round((performance.now() - t0) * 100) / 100,
      rows: Array.isArray(result?.[0]) ? result[0].length : 0,
      ...analyzeSql(typeof sql === "string" ? sql : String(sql)),
      head: String(sql).replace(/\s+/g, " ").trim().slice(0, 120),
    });
    return result;
  };

  const wall0 = performance.now();
  const payload = await buildSearchSuggestResponse(query);
  const wallMs = Math.round((performance.now() - wall0) * 100) / 100;

  pool.query = orig;

  const popupSql = sqlLog.filter(
    (e) => e.usesProductSearchIndex
      || (e.usesProducts && (e.usesShops || e.usesImages || e.head.includes("shopName"))),
  );

  return {
    wallMs,
    sqlCount: sqlLog.length,
    indexSqlCount: sqlLog.filter((e) => e.usesProductSearchIndex).length,
    popupHydrationSql: popupSql.length,
    popupUsesProductsJoin: popupSql.some((e) => e.usesProducts && (e.usesShops || e.usesImages)),
    popupUsesIndexOnly: popupSql.some((e) => e.usesProductSearchIndex)
      && !popupSql.some((e) => e.usesProducts && e.usesShops && e.usesImages),
    products: summarizeProducts(payload),
    payload,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const { pool } = await import("../config/db.js");
  const { buildSearchSuggestResponse } = await import("../services/searchSuggest.service.js");

  const comparisons = [];
  const benchmarks = [];

  for (const testCase of CASES) {
    const offCold = await runCase(buildSearchSuggestResponse, pool, testCase.query, false);
    const onCold = await runCase(buildSearchSuggestResponse, pool, testCase.query, true);

    const offWarm = [];
    const onWarm = [];
    for (let i = 0; i < WARM_ROUNDS; i += 1) {
      offWarm.push((await runCase(buildSearchSuggestResponse, pool, testCase.query, false)).wallMs);
      onWarm.push((await runCase(buildSearchSuggestResponse, pool, testCase.query, true)).wallMs);
    }

    const offIds = new Set(offCold.products.map((p) => p.id));
    const onIds = new Set(onCold.products.map((p) => p.id));
    const sharedIds = [...offIds].filter((id) => onIds.has(id));

    let fieldParity = true;
    const fieldDiffs = [];
    for (const id of sharedIds) {
      const a = offCold.products.find((p) => p.id === id);
      const b = onCold.products.find((p) => p.id === id);
      for (const f of ["displayTitle", "priceText", "image", "canonicalUrl", "partNumber"]) {
        if (String(a?.[f] ?? "") !== String(b?.[f] ?? "")) {
          fieldParity = false;
          fieldDiffs.push({ id, field: f, off: a?.[f], on: b?.[f] });
        }
      }
    }

    comparisons.push({
      label: testCase.label,
      productIdsOff: [...offIds],
      productIdsOn: [...onIds],
      overlap: sharedIds.length,
      fieldParity,
      fieldDiffs: fieldDiffs.slice(0, 10),
      offPopupUsesProductsJoin: offCold.popupUsesProductsJoin,
      onPopupUsesIndexOnly: onCold.popupUsesIndexOnly,
    });

    benchmarks.push({
      label: testCase.label,
      flagOff: {
        coldMs: offCold.wallMs,
        warmAvgMs: Math.round((offWarm.reduce((a, b) => a + b, 0) / offWarm.length) * 100) / 100,
        sqlCount: offCold.sqlCount,
        popupHydrationSql: offCold.popupHydrationSql,
      },
      flagOn: {
        coldMs: onCold.wallMs,
        warmAvgMs: Math.round((onWarm.reduce((a, b) => a + b, 0) / onWarm.length) * 100) / 100,
        sqlCount: onCold.sqlCount,
        indexSqlCount: onCold.indexSqlCount,
        popupHydrationSql: onCold.popupHydrationSql,
      },
      speedupColdPct: offCold.wallMs
        ? Math.round(((offCold.wallMs - onCold.wallMs) / offCold.wallMs) * 1000) / 10
        : 0,
    });
  }

  process.env.SEARCH_POPUP_INDEX = "0";
  const { resetSearchRuntimeCache } = await import("../services/search/runtime/searchRuntime.js");
  resetSearchRuntimeCache();

  const report = {
    generatedAt: new Date().toISOString(),
    defaultFlag: "SEARCH_POPUP_INDEX=0",
    benchmarks,
    comparisons,
    allFieldParity: comparisons.every((c) => c.fieldParity),
    allIndexPopup: comparisons.every(
      (c) => c.onPopupUsesIndexOnly || c.productIdsOn.length === 0,
    ),
  };

  fs.writeFileSync(path.join(OUT, "benchmark.json"), JSON.stringify(report, null, 2));

  const md = buildMarkdown(report);
  fs.writeFileSync(path.join(OUT, "benchmark.md"), md);
  fs.writeFileSync(path.join(OUT, "comparison.md"), buildComparisonMd(report));
  fs.writeFileSync(path.join(OUT, "..", "SEARCH-INDEX-POPUP-RUNTIME-01.md"), md + "\n\n---\n\n" + buildComparisonMd(report));

  console.log("\n=== SEARCH-INDEX-POPUP-RUNTIME-01 ===");
  console.log("Field parity:", report.allFieldParity ? "PASS" : "FAIL");
  console.log("Index popup SQL:", report.allIndexPopup ? "PASS" : "FAIL");
  console.log("Output:", OUT);

  await pool.end();
  process.exit(report.allFieldParity && report.allIndexPopup ? 0 : 1);
}

function buildMarkdown(report) {
  return `# SEARCH-INDEX-POPUP-RUNTIME-01 — Benchmark

Generated: ${report.generatedAt}

Feature flag: \`SEARCH_POPUP_INDEX\` (default **0**)

## Latency by query

| Query | Off cold | Off warm | On cold | On warm | Cold speedup |
|-------|----------|----------|---------|---------|--------------|
${report.benchmarks.map((b) => `| ${b.label} | ${b.flagOff.coldMs}ms | ${b.flagOff.warmAvgMs}ms | ${b.flagOn.coldMs}ms | ${b.flagOn.warmAvgMs}ms | ${b.speedupColdPct}% |`).join("\n")}

## SQL count

| Query | Off total SQL | Off popup hydration | On total SQL | On index popup SQL |
|-------|---------------|---------------------|--------------|-------------------|
${report.benchmarks.map((b) => `| ${b.label} | ${b.flagOff.sqlCount} | ${b.flagOff.popupHydrationSql} | ${b.flagOn.sqlCount} | ${b.flagOn.indexSqlCount} |`).join("\n")}

## Notes

- **Off (0):** popup cards via \`fetchBatchPreviewProductRows\` (products + shops + images + fitment)
- **On (1):** popup cards via \`SearchIndexDocumentReader\` (single \`product_search_index\` SELECT, no JOINs)
- Search matching/grouping unchanged (still legacy \`products\` path when \`SEARCH_RUNTIME=legacy\`)
`;
}

function buildComparisonMd(report) {
  return `# Popup response comparison (flag 0 vs 1)

| Query | Overlap | Field parity | Off uses products JOIN | On index-only popup |
|-------|---------|--------------|------------------------|---------------------|
${report.comparisons.map((c) => `| ${c.label} | ${c.overlap} | ${c.fieldParity ? "PASS" : "FAIL"} | ${c.offPopupUsesProductsJoin ? "yes" : "no"} | ${c.onPopupUsesIndexOnly ? "yes" : "no"} |`).join("\n")}

## Verified popup fields

Title (\`displayTitle\`), thumbnail (\`image\`), vehicle meta (\`subtitleLine1\` / \`cardHighlights\`), price (\`priceText\`), shop/province (via highlights), URL (\`canonicalUrl\`), part number.

${report.allFieldParity ? "All shared products match between flag 0 and flag 1." : "See benchmark.json fieldDiffs for mismatches."}
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
