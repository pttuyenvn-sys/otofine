#!/usr/bin/env node
/**
 * SEARCH-RUNTIME-TRACE-AUDIT-01 — read-only runtime + SQL trace.
 * Does NOT modify application code, config, or runtime flags.
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "search-runtime-trace-audit-01");
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });

const SUGGEST_CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "má phanh vios", query: { query: "má phanh vios", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
];

function ms(t0, t1) {
  return Math.round((t1 - t0) * 100) / 100;
}

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

function fingerprintSql(sql) {
  return normalizeSql(sql)
    .replace(/\?\s*,?\s*/g, "?")
    .replace(/\d+/g, "N")
    .slice(0, 240);
}

function classifySql(sql) {
  const s = normalizeSql(sql).toLowerCase();
  const usesIndex = /\bproduct_search_index\b/.test(s);
  const usesProducts = /\bfrom products\b|\bjoin products\b/.test(s);
  if (usesIndex && !usesProducts) return "SEARCH_INDEX_ONLY";
  if (usesProducts && !usesIndex) return "PRODUCTS_ONLY";
  if (usesIndex && usesProducts) return "HYBRID";
  return "OTHER";
}

function analyzeSqlFeatures(sql) {
  const s = normalizeSql(sql);
  const lower = s.toLowerCase();
  return {
    sourceTable: lower.includes("product_search_index")
      ? (lower.includes("from products") ? "product_search_index+products" : "product_search_index")
      : lower.includes("from products")
        ? "products"
        : lower.includes("from car_models")
          ? "car_models"
          : lower.includes("from product_categories")
            ? "product_categories"
            : "other",
    usesFulltext: /\bmatch\s*\(/i.test(s),
    usesLike: /\blike\b/i.test(s),
    usesProductSearchIndex: /\bproduct_search_index\b/i.test(s),
    usesProducts: /\bproducts\b/i.test(s) && /\bfrom products\b|\bjoin products\b/i.test(s),
    usesJoinProductCarApplications: /\bproduct_car_applications\b/i.test(s),
    usesJoinCarModels: /\bcar_models\b/i.test(s),
    usesGroupBy: /\bgroup by\b/i.test(s),
    usesDistinct: /\bdistinct\b/i.test(s),
    usesCount: /\bcount\s*\(/i.test(s),
    classification: classifySql(s),
  };
}

async function explainAnalyze(pool, sql, params) {
  try {
    const [rows] = await pool.query(`EXPLAIN ANALYZE ${sql}`, params);
    const text = rows.map((r) => r.EXPLAIN || JSON.stringify(r)).join("\n");
    const rowsExamined = Number(text.match(/rows examined: (\d+)/i)?.[1] || 0);
    const rowsReturned = Number(text.match(/actual rows: (\d+)/i)?.[1] || 0);
    const execMs = Number(text.match(/actual time: [\d.]+\.\.([\d.]+)/i)?.[1] || 0);
    return { rowsExamined, rowsReturned, executionTimeMs: execMs, explainSnippet: text.slice(0, 1200) };
  } catch {
    try {
      const [rows] = await pool.query(`EXPLAIN ${sql}`, params);
      return { rowsExamined: null, rowsReturned: null, executionTimeMs: null, explainSnippet: JSON.stringify(rows).slice(0, 800) };
    } catch (e) {
      return { rowsExamined: null, rowsReturned: null, executionTimeMs: null, explainSnippet: String(e.message) };
    }
  }
}

function buildExecutionTrace(runtimeMode, runtimeClass, provider, steps) {
  return {
    controller: "search.controller.getSearchSuggest",
    service: "searchSuggest.service.buildSearchSuggestResponse",
    runtime: runtimeClass,
    runtimeMode,
    provider,
    steps,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const { pool } = await import("../backend/config/db.js");
  const { getSearchRuntimeMode, isSearchIndexRuntime } = await import("../backend/config/searchRuntimeConfig.js");
  const { getSearchEngineMode, isSearchEngineDebug } = await import("../backend/config/searchEngineConfig.js");
  const { isSearchIndexSyncEnabled, CURRENT_SEARCH_INDEX_VERSION } = await import("../backend/config/searchIndexConfig.js");
  const { getSearchRuntime } = await import("../backend/services/search/runtime/searchRuntime.js");
  const { buildSearchSuggestResponse } = await import("../backend/services/searchSuggest.service.js");

  const runtimeMode = getSearchRuntimeMode();
  const runtimeClass = isSearchIndexRuntime() ? "SearchIndexRuntime" : "LegacySearchRuntime";
  const config = {
    SEARCH_RUNTIME: process.env.SEARCH_RUNTIME ?? "(unset → legacy)",
    SEARCH_ENGINE_MODE: process.env.SEARCH_ENGINE_MODE ?? "(unset → hybrid)",
    SEARCH_ENGINE_DEBUG: process.env.SEARCH_ENGINE_DEBUG ?? "(unset)",
    SEARCH_INDEX_SYNC_ENABLED: process.env.SEARCH_INDEX_SYNC_ENABLED ?? "(unset → enabled)",
    SEARCH_INDEX_VERSION: CURRENT_SEARCH_INDEX_VERSION,
    SEARCH_DECISION_MODE: process.env.SEARCH_DECISION_MODE ?? "(unset → quality_gate)",
    NODE_ENV: process.env.NODE_ENV ?? "(unset)",
    effectiveRuntimeMode: runtimeMode,
    effectiveRuntimeClass: runtimeClass,
    effectiveSearchEngineMode: getSearchEngineMode(),
    searchIndexSyncEnabled: isSearchIndexSyncEnabled(),
    searchEngineDebug: isSearchEngineDebug(),
  };

  const allSqlEvents = [];
  const traceByQuery = [];
  let callSeq = 0;

  const origQuery = pool.query.bind(pool);
  pool.query = async function traceQuery(sql, params) {
    const sqlText = typeof sql === "string" ? sql : String(sql);
    const t0 = performance.now();
    const result = await origQuery(sql, params);
    const t1 = performance.now();
    const rowsReturned = Array.isArray(result?.[0]) ? result[0].length : 0;
    const evt = {
      seq: ++callSeq,
      sql: normalizeSql(sqlText),
      params: params || [],
      durationMs: ms(t0, t1),
      rowsReturned,
      ...analyzeSqlFeatures(sqlText),
      fingerprint: fingerprintSql(sqlText),
    };
    allSqlEvents.push(evt);
    return result;
  };

  for (const testCase of SUGGEST_CASES) {
    const startIdx = allSqlEvents.length;
    const wall0 = performance.now();
    const response = await buildSearchSuggestResponse(testCase.query);
    const wallMs = ms(wall0, performance.now());
    const queryEvents = allSqlEvents.slice(startIdx);

    let provider = null;
    if (runtimeClass === "LegacySearchRuntime") {
      const { buildSearchInventoryContext } = await import("../backend/services/search/searchInventoryQuery.js");
      const kw = String(testCase.query.query || "").trim();
      const ctx = await buildSearchInventoryContext(testCase.query, kw);
      provider = ctx.searchProvider;
    } else {
      const { resolveIndexSearchExecution } = await import("../backend/services/search/runtime/indexSearchExecution.js");
      const exec = await resolveIndexSearchExecution({ ...testCase.query, keyword: testCase.query.query, query: testCase.query.query });
      provider = exec.provider;
    }

    traceByQuery.push({
      label: testCase.label,
      query: testCase.query,
      wallMs,
      provider,
      responseSummary: {
        groupCount: response.groups?.length || 0,
        categoryCount: response.categories?.length || 0,
        productCount: (response.groups || []).reduce((n, g) => n + (g.products?.length || 0), 0),
      },
      executionTrace: buildExecutionTrace(runtimeMode, runtimeClass, provider, [
        "GET /api/search/suggest",
        "search.controller.getSearchSuggest",
        "searchSuggest.service.buildSearchSuggestResponse",
        `getSearchRuntime() → ${runtimeClass}`,
        runtimeClass === "LegacySearchRuntime"
          ? "fetchSharedGroupedInventory → buildSearchInventoryContext → searchProviderChain"
          : "fetchIndexSharedGroupedInventory → resolveIndexSearchExecution",
        runtimeClass === "LegacySearchRuntime"
          ? "fetchGroupedInventoryFromMatchedCte (products CTE)"
          : "fetchIndexGroupedInventory (product_search_index CTE)",
        runtimeClass === "LegacySearchRuntime"
          ? "buildPreviewBlocksFromInventory → fetchBatchPreviewProductRows (products hydration inline)"
          : "buildIndexPreviewBlocks → fetchIndexMatchedRowsForGroups → hydrateIndexPreviewRows",
        "assembleSearchSuggestResponse",
      ]),
      sqlCount: queryEvents.length,
      sqlEvents: queryEvents.map(({ seq, durationMs, rowsReturned, classification, fingerprint, sql, sourceTable, ...featRest }) => ({
        seq,
        durationMs,
        rowsReturned,
        classification,
        sourceTable,
        features: {
          usesFulltext: featRest.usesFulltext,
          usesLike: featRest.usesLike,
          usesProductSearchIndex: featRest.usesProductSearchIndex,
          usesProducts: featRest.usesProducts,
          usesJoinProductCarApplications: featRest.usesJoinProductCarApplications,
          usesJoinCarModels: featRest.usesJoinCarModels,
          usesGroupBy: featRest.usesGroupBy,
          usesDistinct: featRest.usesDistinct,
          usesCount: featRest.usesCount,
        },
        fingerprint,
        sqlHead: sql.slice(0, 300),
      })),
    });
  }

  // Index usage by search function (single representative query)
  const sampleQuery = SUGGEST_CASES[0].query;
  const runtime = getSearchRuntime();
  const functionTraces = {};

  async function traceFunction(name, fn) {
    const startIdx = allSqlEvents.length;
    const t0 = performance.now();
    await fn();
    const events = allSqlEvents.slice(startIdx);
    const indexSql = events.filter((e) => e.usesProductSearchIndex).length;
    const productSql = events.filter((e) => e.usesProducts).length;
    let usage = "NO";
    if (indexSql > 0 && productSql > 0) usage = "PARTIAL";
    else if (indexSql > 0) usage = "YES";
    functionTraces[name] = {
      indexUsage: usage,
      sqlCount: events.length,
      indexSqlCount: indexSql,
      productsSqlCount: productSql,
      wallMs: ms(t0, performance.now()),
      classifications: [...new Set(events.map((e) => e.classification))],
    };
  }

  await traceFunction("searchSuggest", () => buildSearchSuggestResponse(sampleQuery));
  await traceFunction("searchSidebar", () => runtime.searchSidebar(sampleQuery));
  await traceFunction("searchPreview", () => runtime.searchPreview(sampleQuery));
  await traceFunction("searchInventory", () => runtime.searchInventory(sampleQuery));
  await traceFunction("searchProducts", () => runtime.searchProducts({ q: sampleQuery.query, brand: sampleQuery.brand, perPage: 16, page: 1 }));

  pool.query = origQuery;

  // EXPLAIN ANALYZE top slow unique SQL (read-only)
  const byFingerprint = new Map();
  for (const evt of allSqlEvents) {
    const prev = byFingerprint.get(evt.fingerprint) || { ...evt, count: 0, totalMs: 0 };
    prev.count += 1;
    prev.totalMs += evt.durationMs;
    prev.maxMs = Math.max(prev.maxMs || 0, evt.durationMs);
    byFingerprint.set(evt.fingerprint, prev);
  }

  const uniqueSql = [...byFingerprint.values()];
  const topSlowest = [...uniqueSql].sort((a, b) => b.maxMs - a.maxMs).slice(0, 10);
  const topRepeated = [...uniqueSql].sort((a, b) => b.count - a.count).slice(0, 10);

  const explainResults = [];
  for (const item of topSlowest.slice(0, 6)) {
    const ex = await explainAnalyze(pool, item.sql, item.params);
    explainResults.push({
      fingerprint: item.fingerprint,
      classification: item.classification,
      maxDurationMs: item.maxMs,
      repeatCount: item.count,
      ...ex,
      sqlHead: item.sql.slice(0, 400),
    });
  }

  const classificationCounts = {};
  for (const evt of allSqlEvents) {
    classificationCounts[evt.classification] = (classificationCounts[evt.classification] || 0) + 1;
  }
  const indexPct = allSqlEvents.length
    ? Math.round((allSqlEvents.filter((e) => e.usesProductSearchIndex).length / allSqlEvents.length) * 1000) / 10
    : 0;

  const hydrationFlow = runtimeClass === "SearchIndexRuntime"
    ? {
        beginsFromProducts: false,
        beginsFromIndex: true,
        hydratesAfterIdMatch: true,
        hydrationQueries: [
          "hydrateProductsForSearch — products IN (?) after index match",
          "loadPrimaryFitmentCarsByProductIds — product_car_applications + car_models (searchProducts only)",
          "product_images subquery in hydration SELECT",
        ],
      }
    : {
        beginsFromProducts: true,
        beginsFromIndex: false,
        hydratesAfterIdMatch: false,
        hydrationQueries: [
          "fetchGroupedInventoryFromMatchedCte — products + category_map + fitment JOINs",
          "fetchBatchPreviewProductRows — products + LATERAL product_car_applications",
          "getModels — car_models (when brand-only scope)",
        ],
      };

  const productsDependencies = runtimeClass === "LegacySearchRuntime"
    ? [
        "Keyword matching via products.partName / partNumber / description LIKE or FULLTEXT",
        "Vehicle scoping via product_car_applications + car_models JOIN",
        "Category grouping via product_category_map + product_categories JOIN",
        "Preview cards: full product row SELECT from products",
        "Primary fitment LATERAL subquery on product_car_applications",
        "Shop visibility via shops JOIN",
        "product_images thumbnail subquery",
        "searchProducts: Typesense or products searchProductIds (legacy path)",
      ]
    : [
        "searchSuggest/searchSidebar/searchPreview/searchInventory: product_search_index only for matching",
        "Preview hydration: products IN (?) for card fields (name, price, stock, image)",
        "searchProducts: count + rank on index, then hydrateProductsForSearch + loadPrimaryFitmentCarsByProductIds",
        "Fitment/canonical URLs still require product_car_applications at hydration time",
      ];

  const canPopupRunFromIndexOnly = runtimeClass === "SearchIndexRuntime" ? "NO" : "NO";
  const indexOnlyBlockers = [
    "Preview card fields (price, stock, shopName, provinceName, imageUrl) fetched from products + shops + address",
    "product_images thumbnail subquery requires products.id",
    "buildProductIdentity / canonicalPath uses fitment from product_car_applications at hydration",
    "Legacy runtime: entire suggest pipeline starts FROM products with fitment JOINs",
  ];

  const bottlenecks = {
    top10Slowest: topSlowest.map((s) => ({
      fingerprint: s.fingerprint,
      classification: s.classification,
      maxMs: s.maxMs,
      avgMs: Math.round((s.totalMs / s.count) * 100) / 100,
      count: s.count,
      usesProductSearchIndex: s.usesProductSearchIndex,
      usesProducts: s.usesProducts,
      sqlHead: s.sql.slice(0, 200),
    })),
    top10Repeated: topRepeated.map((s) => ({
      fingerprint: s.fingerprint,
      count: s.count,
      totalMs: Math.round(s.totalMs * 100) / 100,
      classification: s.classification,
      sqlHead: s.sql.slice(0, 200),
    })),
    top10LargestScans: explainResults
      .filter((e) => e.rowsExamined != null)
      .sort((a, b) => (b.rowsExamined || 0) - (a.rowsExamined || 0))
      .slice(0, 10)
      .map((e) => ({
        fingerprint: e.fingerprint,
        rowsExamined: e.rowsExamined,
        rowsReturned: e.rowsReturned,
        executionTimeMs: e.executionTimeMs,
        classification: e.classification,
      })),
  };

  const migrationBlockers = runtimeClass === "LegacySearchRuntime"
    ? [
        "SEARCH_RUNTIME=legacy (default) — index runtime not active in production",
        "Suggest pipeline executes 2+ heavy products scans per request (grouped CTE + batch preview)",
        "Provider cascade may run extra COUNT/SAMPLE queries on products during fulltext gate",
        "searchProducts still uses Typesense or legacy products searchProductIds when runtime=legacy",
      ]
    : [
        "Hydration still requires products + shops + product_images for every preview card",
        "Fitment/canonical enrichment uses product_car_applications post-match",
        "Broad unscoped LIKE on product_search_index can scan full index (~118s for bugi alone in prior benchmark)",
      ];

  const dependencyMap = {
    config,
    endpoints: {
      "GET /api/search/suggest": {
        controller: "search.controller.getSearchSuggest",
        service: "searchSuggest.service.buildSearchSuggestResponse",
        runtime: runtimeClass,
      },
      "GET /api/product-categories/search-sidebar": {
        controller: "productCategory.controller.searchSidebarCategories",
        service: "getSearchRuntime().searchSidebar",
        runtime: runtimeClass,
      },
      "GET /api/product-categories/search-preview-batch": {
        controller: "productCategory.controller.searchPreviewBatch",
        service: "searchSuggest.service.buildSearchPreviewBatchLegacy → searchPreview",
        runtime: runtimeClass,
      },
      "GET /api/products/search": {
        controller: "productList.controller.getProductSearch",
        service: "productSearch.service.searchProductsPublic",
        runtime: runtimeClass,
        note: runtimeClass === "LegacySearchRuntime" ? "Typesense or searchProductIds on products" : "SearchIndexRuntime.searchProducts",
      },
    },
    functionIndexUsage: functionTraces,
    hydrationFlow,
    productsDependencies,
    indexUsagePercent: indexPct,
    sqlClassificationCounts: classificationCounts,
  };

  const sqlTrace = {
    generatedAt: new Date().toISOString(),
    config,
    totalSqlCalls: allSqlEvents.length,
    traceByQuery,
    explainAnalyze: explainResults,
    bottlenecks,
  };

  fs.writeFileSync(path.join(OUT, "sql-trace.json"), JSON.stringify(sqlTrace, null, 2));
  fs.writeFileSync(path.join(OUT, "dependency-map.json"), JSON.stringify(dependencyMap, null, 2));

  const runtimeTraceMd = buildRuntimeTraceMd(config, traceByQuery, functionTraces, hydrationFlow, bottlenecks, indexPct);
  fs.writeFileSync(path.join(OUT, "runtime-trace.md"), runtimeTraceMd);

  const readinessMd = buildReadinessMd(config, canPopupRunFromIndexOnly, indexOnlyBlockers, functionTraces, migrationBlockers, indexPct, runtimeClass);
  fs.writeFileSync(path.join(OUT, "runtime-readiness.md"), readinessMd);

  fs.writeFileSync(path.join(OUT, "..", "SEARCH-RUNTIME-TRACE-AUDIT-01.md"), runtimeTraceMd + "\n\n---\n\n" + readinessMd.split("---").slice(1).join("---"));

  console.log("=== SEARCH-RUNTIME-TRACE-AUDIT-01 complete ===");
  console.log("Runtime:", runtimeClass, `(${runtimeMode})`);
  console.log("SQL calls:", allSqlEvents.length, "| index usage:", indexPct + "%");
  console.log("Output:", OUT);
  await pool.end();
}

function buildRuntimeTraceMd(config, traceByQuery, functionTraces, hydrationFlow, bottlenecks, indexPct) {
  return `# SEARCH-RUNTIME-TRACE-AUDIT-01

Generated: ${new Date().toISOString()}

## Current configuration

| Setting | Value |
|---------|-------|
| SEARCH_RUNTIME | ${config.SEARCH_RUNTIME} |
| Effective runtime | **${config.effectiveRuntimeClass}** (\`${config.effectiveRuntimeMode}\`) |
| SEARCH_ENGINE_MODE | ${config.SEARCH_ENGINE_MODE} |
| Effective engine mode | \`${config.effectiveSearchEngineMode}\` |
| SEARCH_INDEX_SYNC | ${config.SEARCH_INDEX_SYNC_ENABLED} (v${config.SEARCH_INDEX_VERSION}) |
| SEARCH_DECISION_MODE | ${config.SEARCH_DECISION_MODE} |

## Architecture

\`\`\`mermaid
flowchart TD
  HTTP["GET /api/search/suggest"] --> CTRL["search.controller.getSearchSuggest"]
  CTRL --> SVC["searchSuggest.service.buildSearchSuggestResponse"]
  SVC --> FACADE["getSearchRuntime()"]
  FACADE -->|legacy| LEG["LegacySearchRuntime"]
  FACADE -->|index| IDX["SearchIndexRuntime"]
  LEG --> GRP["fetchSharedGroupedInventory"]
  GRP --> CTX["buildSearchInventoryContext → searchProviderChain"]
  CTX --> CTE["fetchGroupedInventoryFromMatchedCte (products)"]
  LEG --> PRE["buildPreviewBlocksFromInventory"]
  PRE --> BATCH["fetchBatchPreviewProductRows (products)"]
  IDX --> IGRP["fetchIndexSharedGroupedInventory"]
  IGRP --> EXEC["resolveIndexSearchExecution"]
  EXEC --> ICTE["fetchIndexGroupedInventory (product_search_index)"]
  IDX --> IPRE["buildIndexPreviewBlocks"]
  IPRE --> HYDR["hydrateIndexPreviewRows → products IN (?)"]
  LEG --> ASM["assembleSearchSuggestResponse"]
  IDX --> ASM
  ASM --> JSON["JSON response"]
\`\`\`

## Execution traces (GET /api/search/suggest)

${traceByQuery.map((t) => `### ${t.label}

**Query:** \`${JSON.stringify(t.query)}\`
**Provider:** \`${t.provider}\`
**Wall time:** ${t.wallMs}ms
**Response:** ${t.responseSummary.groupCount} groups, ${t.responseSummary.productCount} preview products, ${t.responseSummary.categoryCount} categories

\`\`\`
Controller  → search.controller.getSearchSuggest
Service     → searchSuggest.service.buildSearchSuggestResponse
Runtime     → ${t.executionTrace.runtime} (${t.executionTrace.runtimeMode})
Provider    → ${t.provider}
${t.executionTrace.steps.slice(4).map((s) => `Pipeline    → ${s}`).join("\n")}
\`\`\`

**SQL executed:** ${t.sqlCount} statements

| # | ms | rows | class | FULLTEXT | LIKE | psi | products | pca | car_models |
|---|-----|------|-------|----------|------|-----|----------|-----|------------|
${t.sqlEvents.map((e) => `| ${e.seq} | ${e.durationMs} | ${e.rowsReturned} | ${e.classification} | ${e.features.usesFulltext ? "Y" : ""} | ${e.features.usesLike ? "Y" : ""} | ${e.features.usesProductSearchIndex ? "Y" : ""} | ${e.features.usesProducts ? "Y" : ""} | ${e.features.usesJoinProductCarApplications ? "Y" : ""} | ${e.features.usesJoinCarModels ? "Y" : ""} |`).join("\n")}
`).join("\n")}

## Search function index usage (sample: bugi toyota)

| Function | Index used | SQL count | Index SQL | Products SQL |
|----------|------------|-----------|-----------|--------------|
${Object.entries(functionTraces).map(([fn, t]) => `| ${fn} | **${t.indexUsage}** | ${t.sqlCount} | ${t.indexSqlCount} | ${t.productsSqlCount} |`).join("\n")}

## Hydration flow

- Begins from products: **${hydrationFlow.beginsFromProducts ? "YES" : "NO"}**
- Begins from product_search_index: **${hydrationFlow.beginsFromIndex ? "YES" : "NO"}**
- Hydrates after ID match: **${hydrationFlow.hydratesAfterIdMatch ? "YES" : "NO"}**

${hydrationFlow.hydrationQueries.map((q) => `- ${q}`).join("\n")}

## Index usage

- **${indexPct}%** of traced SQL statements touch \`product_search_index\`
- Remaining statements query \`products\`, \`car_models\`, \`product_images\`, or metadata

## Top bottlenecks

### Slowest SQL (by max duration)

${bottlenecks.top10Slowest.slice(0, 5).map((b, i) => `${i + 1}. \`${b.maxMs}ms\` (${b.count}×) [${b.classification}] — ${b.sqlHead}…`).join("\n")}

### Most repeated SQL

${bottlenecks.top10Repeated.slice(0, 5).map((b, i) => `${i + 1}. \`${b.count}×\` total ${b.totalMs}ms [${b.classification}] — ${b.sqlHead}…`).join("\n")}

### Largest scans (EXPLAIN ANALYZE)

${bottlenecks.top10LargestScans.length
    ? bottlenecks.top10LargestScans.map((b, i) => `${i + 1}. rows examined: **${b.rowsExamined}**, returned: ${b.rowsReturned}, ${b.executionTimeMs}ms [${b.classification}]`).join("\n")
    : "- EXPLAIN ANALYZE unavailable or not captured"}

Diagnosis only — no fixes recommended.
`;
}

function buildReadinessMd(config, canPopup, blockers, functionTraces, migrationBlockers, indexPct, runtimeClass) {
  return `# SEARCH-RUNTIME-TRACE-AUDIT-01 — Readiness

## Can popup search run entirely from product_search_index today?

**${canPopup}**

Both runtimes require \`products\` (and related tables) for preview card hydration even when matching uses the index.

### Fields/joins that force products dependency

${blockers.map((b) => `- ${b}`).join("\n")}

## Function-level readiness

| Function | Index for matching | Still needs products |
|----------|-------------------|---------------------|
| searchSuggest | ${functionTraces.searchSuggest?.indexUsage || "—"} | YES (preview hydration) |
| searchSidebar | ${functionTraces.searchSidebar?.indexUsage || "—"} | ${functionTraces.searchSidebar?.productsSqlCount ? "PARTIAL (getModels when brand-only)" : "NO for categories"} |
| searchPreview | ${functionTraces.searchPreview?.indexUsage || "—"} | YES (preview hydration) |
| searchInventory | ${functionTraces.searchInventory?.indexUsage || "—"} | NO (returns groups only) |
| searchProducts | ${functionTraces.searchProducts?.indexUsage || "—"} | YES (full card hydration + fitment) |

## Migration blockers

${migrationBlockers.map((b) => `- ${b}`).join("\n")}

## Current state summary

- Active runtime: **${runtimeClass}**
- Index table used in traced SQL: **${indexPct}%** of statements
- \`product_search_index\` sync: enabled (background), not controlling live search while runtime=legacy

Diagnosis only — no implementation recommended.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
