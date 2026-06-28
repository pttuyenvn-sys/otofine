#!/usr/bin/env node
/**
 * SEARCH-BACKEND-PROFILING-01 — read-only audit profiler.
 * Does NOT modify production code. Standalone measurement only.
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });
const OUT_DIR = path.join(__dirname, "search-backend-profiling-01");
const API = (process.env.API_BASE || "http://127.0.0.1:5000/api").replace(/\/$/, "");

const CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "bugi camry", query: { query: "bugi camry", brand: "Toyota", model: "Camry" } },
  { label: "má phanh vios", query: { query: "má phanh vios", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "giảm xóc toyota", query: { query: "giảm xóc", brand: "Toyota" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
];

function ms(start, end) {
  return Math.round((end - start) * 100) / 100;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarizeExplainAnalyze(text) {
  const s = String(text || "");
  return {
    rowsExamined: Number(s.match(/rows examined: (\d+)/)?.[1] || 0),
    actualRows: Number(s.match(/actual rows: (\d+)/)?.[1] || 0),
    executionTimeMs: Number(s.match(/actual time: ([\d.]+)\.\.([\d.]+)/)?.[2] || 0),
    usesFilesort: /filesort/i.test(s),
    usesTempTable: /temporary table/i.test(s),
    joinCount: (s.match(/\bjoin\b/gi) || []).length,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { pool } = await import("../backend/config/db.js");
  const { normalizeListingQuery } = await import("../backend/utils/listingQueryNormalize.js");
  const { getProductsColumnsResolved } = await import("../backend/utils/productsTableColumns.server.js");
  const {
    buildProductListFiltersWithVisibility,
    buildProductListingJoinSql,
  } = await import("../backend/repositories/productList.repository.js");
  const { rankSearchPreviewGroups, rankCategorySidebarSuggestions } = await import(
    "../backend/utils/categorySuggestRanking.js",
  );
  const { formatSearchPreviewGroupTitle } = await import("../backend/utils/searchPreviewGroupLabel.js");
  const { sortSuggestPreviewProducts } = await import("../backend/utils/suggestPreviewProductSort.js");
  const { getProductList, getModels } = await import("../backend/services/productList.service.js");
  const { listingQueryNeedsVehicleFitmentJoin } = await import("../backend/utils/listingQueryNormalize.js");
  const { buildSuggestViewAllLabel } = await import("../backend/utils/buildSuggestViewAllLabel.js");
  const {
    buildGroupSuggestUrl,
    buildViewAllSuggestUrl,
  } = await import("../backend/utils/listingSuggestUrls.js");

  const sqlLog = [];
  const origQuery = pool.query.bind(pool);
  pool.query = async function patchedQuery(sql, params) {
    const label = typeof sql === "string" ? sql.trim().slice(0, 80) : "unknown";
    const t0 = performance.now();
    const result = await origQuery(sql, params);
    const t1 = performance.now();
    const rows = Array.isArray(result?.[0]) ? result[0].length : 0;
    sqlLog.push({
      sql: typeof sql === "string" ? sql.trim() : String(sql),
      params: params || [],
      durationMs: ms(t0, t1),
      rowsReturned: rows,
    });
    return result;
  };

  async function runStagedProfile(rawQuery, label) {
    sqlLog.length = 0;
    const stages = {};
    const memBefore = process.memoryUsage();
    const wall0 = performance.now();

    // 1. Parse query
    let t0 = performance.now();
    const keyword = String(rawQuery.query || rawQuery.keyword || rawQuery.q || "").trim();
    stages.parseQuery = ms(t0, performance.now());

    // 2. Resolve scope
    t0 = performance.now();
    const listing = normalizeListingQuery(rawQuery);
    const scope = {
      brand: listing.brand || "",
      model: listing.model || "",
      year: listing.year != null ? String(listing.year) : "",
      location: listing.location || "",
    };
    stages.resolveScope = ms(t0, performance.now());

    // --- Preview branch (runs parallel with category in prod) ---
    const previewT0 = performance.now();
    const productColumns = await getProductsColumnsResolved();
    stages.getProductsColumnsResolved = ms(previewT0, performance.now());

    // 3+5. Group SQL (category+vehicle GROUP BY)
    t0 = performance.now();
    const groupFromSql = buildProductListingJoinSql(productColumns, {
      joinCategoryMap: true,
      joinVehicleFitment: true,
    });
    const { where: groupWhere, params: groupParams } = await buildProductListFiltersWithVisibility(
      productColumns,
      { ...rawQuery, keyword, q: keyword },
    );
    const groupSql = `
      SELECT
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
        MAX(cm.hang_xe) AS brand,
        MAX(cm.ten_xe) AS model,
        COUNT(DISTINCT ${productColumns.idExpr("p")}) AS total_count,
        MAX(COALESCE(pc.search_priority, 0)) AS search_priority
      ${groupFromSql}
      ${groupWhere}
      GROUP BY
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug),
        cm.hang_xe,
        cm.ten_xe
      HAVING total_count > 0
    `;
    const sqlBeforeGroup = sqlLog.length;
    const [groupRows] = await pool.query(groupSql, groupParams);
    stages.previewGroupSql = ms(t0, performance.now());
    const previewGroupSqlQueries = sqlLog.slice(sqlBeforeGroup);

    // 4. Category ranking (preview groups)
    t0 = performance.now();
    const rankedGroups = rankSearchPreviewGroups(
      groupRows.map((row) => ({
        canonical_name: String(row.canonical_name || "").trim(),
        canonical_slug: String(row.canonical_slug || "").trim(),
        brand: String(row.brand || "").trim(),
        model: String(row.model || "").trim(),
        total_count: Number(row.total_count) || 0,
        search_priority: Number(row.search_priority) || 0,
      })),
      { keyword, brand: listing.brand, model: listing.model },
    );
    const topGroups = rankedGroups.slice(0, 3);
    stages.previewRanking = ms(t0, performance.now());

    // 6. Preview product SQL (3x getProductList in parallel)
    t0 = performance.now();
    const sqlBeforePreview = sqlLog.length;
    const previewResults = await Promise.all(
      topGroups.map(async (row) => {
        const brand = String(row.brand || listing.brand || "").trim();
        const model = String(row.model || listing.model || "").trim();
        const group = {
          title: formatSearchPreviewGroupTitle(row.canonical_name, {
            brand,
            model,
            year: listing.year != null ? String(listing.year) : "",
          }),
          canonical_name: row.canonical_name,
          canonical_slug: row.canonical_slug,
          brand,
          model,
          year: listing.year != null ? String(listing.year) : "",
          total_count: Number(row.total_count) || 0,
        };
        const listResult = await getProductList({
          category: group.canonical_name,
          brand: group.brand || undefined,
          model: group.model || undefined,
          year: group.year || undefined,
          page: 1,
          sort: "popular",
        });
        return {
          group,
          products: sortSuggestPreviewProducts(listResult?.data || []),
          fetched: (listResult?.data || []).length,
        };
      }),
    );
    stages.previewProductSql = ms(t0, performance.now());
    const previewProductSqlQueries = sqlLog.slice(sqlBeforePreview);

    // 7. Global dedupe
    t0 = performance.now();
    const seenProductIds = new Set();
    let productsFetched = 0;
    let productsDiscarded = 0;
    const blocks = [];
    for (const { group, products, fetched } of previewResults) {
      productsFetched += fetched;
      const deduped = [];
      for (const product of products) {
        const id = Number(product?.id);
        if (!Number.isFinite(id) || seenProductIds.has(id)) {
          productsDiscarded += 1;
          continue;
        }
        seenProductIds.add(id);
        deduped.push(product);
        if (deduped.length >= 2) break;
      }
      blocks.push({ group, products: deduped });
    }
    stages.globalDedupe = ms(t0, performance.now());

    // 8. Product sorting (included in preview branch above — measure sort only)
    t0 = performance.now();
    for (const b of previewResults) sortSuggestPreviewProducts(b.products);
    stages.productSorting = ms(t0, performance.now());

    const previewBranchTotal = ms(previewT0, performance.now());

    // --- Category sidebar branch ---
    const categoryT0 = performance.now();
    t0 = performance.now();
    const joinV = listingQueryNeedsVehicleFitmentJoin(rawQuery);
    const catFromSql = buildProductListingJoinSql(productColumns, joinV);
    const { where: catWhere, params: catParams } = await buildProductListFiltersWithVisibility(
      productColumns,
      { ...rawQuery, keyword },
    );
    const categorySql = `
      SELECT
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
        COUNT(DISTINCT ${productColumns.idExpr("p")}) AS total_count,
        MAX(COALESCE(pc.search_priority, 0)) AS search_priority
      ${catFromSql}
      ${catWhere}
      GROUP BY
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug)
      HAVING total_count > 0
    `;
    const sqlBeforeCat = sqlLog.length;
    const [catRows] = await pool.query(categorySql, catParams);
    stages.categorySql = ms(t0, performance.now());
    const categorySqlQueries = sqlLog.slice(sqlBeforeCat);

    t0 = performance.now();
    const modelAll = Boolean(listing.brand && !listing.model);
    let modelRows = [];
    if (modelAll) {
      const models = await getModels(listing.brand);
      modelRows = models.map((row) => ({
        brand: listing.brand,
        model: row.ten_xe || row.model || row.name,
      }));
    }
    const categories = rankCategorySidebarSuggestions(catRows, {
      keyword,
      brand: listing.brand,
      model: listing.model,
      modelAll,
      modelRows,
    }).map(({ canonical_name, canonical_slug, total_count }) => ({
      canonical_name: String(canonical_name || "").trim(),
      canonical_slug: String(canonical_slug || "").trim(),
      total_count: Number(total_count) || 0,
    }));
    stages.categoryRanking = ms(t0, performance.now());
    const categoryBranchTotal = ms(categoryT0, performance.now());

    // 5 grouping + response assembly
    t0 = performance.now();
    const groups = blocks.map((block) => {
      const g = block.group;
      return {
        title: g.title,
        count: Number(g.total_count) || 0,
        url: buildGroupSuggestUrl(g),
        canonical_name: g.canonical_name,
        canonical_slug: g.canonical_slug,
        brand: g.brand,
        model: g.model,
        year: g.year,
        products: block.products,
      };
    });
    const viewAll = {
      label: buildSuggestViewAllLabel(scope, keyword),
      url: buildViewAllSuggestUrl(scope, keyword),
    };
    stages.groupingAndUrls = ms(t0, performance.now());

    // 9-10 JSON serialization
    t0 = performance.now();
    const payload = { groups, viewAll, categories };
    const json = JSON.stringify(payload);
    stages.jsonSerialization = ms(t0, performance.now());
    const jsonBytes = Buffer.byteLength(json, "utf8");

    const wall1 = performance.now();
    const memAfter = process.memoryUsage();
    const totalWall = ms(wall0, wall1);

    // EXPLAIN ANALYZE for main SQL shapes (once per case)
    const explain = {};
    for (const [name, sql, params] of [
      ["previewGroupSql", groupSql, groupParams],
      ["categorySql", categorySql, catParams],
    ]) {
      try {
        const [rows] = await origQuery(`EXPLAIN ANALYZE ${sql}`, params);
        const text = rows.map((r) => r.EXPLAIN || Object.values(r).join(" ")).join("\n");
        explain[name] = { text, ...summarizeExplainAnalyze(text) };
      } catch (e) {
        explain[name] = { error: String(e.message || e) };
      }
    }

    return {
      label,
      rawQuery,
      stages,
      totalWall,
      previewBranchTotal,
      categoryBranchTotal,
      parallelEffectiveMs: Math.max(previewBranchTotal, categoryBranchTotal),
      allocation: {
        groupRowsExamined: groupRows.length,
        topGroups: topGroups.length,
        groupsReturned: groups.length,
        categoriesReturned: categories.length,
        productsFetched,
        productsReturned: groups.reduce((n, g) => n + g.products.length, 0),
        productsDiscarded,
        productsDeduped: productsDiscarded,
        jsonBytes,
        heapDeltaMb: Math.round(((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024) * 100) / 100,
      },
      sql: {
        all: [...sqlLog],
        previewGroupSqlQueries,
        previewProductSqlQueries,
        categorySqlQueries,
        previewGroupSqlDuration: previewGroupSqlQueries.reduce((s, q) => s + q.durationMs, 0),
        previewProductSqlDuration: previewProductSqlQueries.reduce((s, q) => s + q.durationMs, 0),
        categorySqlDuration: categorySqlQueries.reduce((s, q) => s + q.durationMs, 0),
        totalSqlDuration: sqlLog.reduce((s, q) => s + q.durationMs, 0),
        queryCount: sqlLog.length,
      },
      explain,
      payload,
    };
  }

  console.log("\n=== SEARCH-BACKEND-PROFILING-01 ===\n");
  console.log("Staged cold-path profiling (sequential branches for attribution)...\n");

  const profiles = [];
  for (const c of CASES) {
    const p = await runStagedProfile(c.query, c.label);
    profiles.push(p);
    console.log(`${c.label}: wall=${p.totalWall}ms sql=${p.sql.totalSqlDuration}ms queries=${p.sql.queryCount} json=${(p.allocation.jsonBytes / 1024).toFixed(1)}KB`);
  }

  // HTTP load test — bugi toyota, cold then repeated
  const loadQuery = "query=bugi&brand=Toyota";
  const loadSizes = [10, 20, 50, 100];
  const loadResults = {};

  for (const n of loadSizes) {
    const times = [];
    for (let i = 0; i < n; i += 1) {
      const t0 = performance.now();
      const res = await fetch(`${API}/search/suggest?${loadQuery}`);
      await res.json();
      times.push(ms(t0, performance.now()));
    }
    times.sort((a, b) => a - b);
    loadResults[n] = {
      avg: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      max: times[times.length - 1],
      min: times[0],
    };
    console.log(`Load n=${n}: avg=${loadResults[n].avg}ms p50=${loadResults[n].p50}ms p95=${loadResults[n].p95}ms max=${loadResults[n].max}ms`);
  }

  // Aggregate stage averages across cases
  const stageKeys = [
    "parseQuery",
    "resolveScope",
    "getProductsColumnsResolved",
    "previewGroupSql",
    "previewRanking",
    "previewProductSql",
    "globalDedupe",
    "productSorting",
    "categorySql",
    "categoryRanking",
    "groupingAndUrls",
    "jsonSerialization",
  ];
  const stageAgg = {};
  for (const k of stageKeys) {
    stageAgg[k] = profiles.reduce((s, p) => s + (p.stages[k] || 0), 0) / profiles.length;
  }
  const avgWall = profiles.reduce((s, p) => s + p.totalWall, 0) / profiles.length;
  const avgSqlGroup = profiles.reduce((s, p) => s + p.sql.previewGroupSqlDuration, 0) / profiles.length;
  const avgSqlPreview = profiles.reduce((s, p) => s + p.sql.previewProductSqlDuration, 0) / profiles.length;
  const avgSqlCategory = profiles.reduce((s, p) => s + p.sql.categorySqlDuration, 0) / profiles.length;
  const avgParallel = profiles.reduce((s, p) => s + p.parallelEffectiveMs, 0) / profiles.length;
  const avgNodeOverhead = avgWall - avgParallel - (stageAgg.groupingAndUrls + stageAgg.jsonSerialization);

  const bottlenecks = [
    { name: "Preview product SQL (3× getProductList)", ms: avgSqlPreview, pct: pct(avgSqlPreview, avgWall) },
    { name: "Preview group SQL (category+vehicle GROUP BY)", ms: avgSqlGroup, pct: pct(avgSqlGroup, avgWall) },
    { name: "Category sidebar SQL", ms: avgSqlCategory, pct: pct(avgSqlCategory, avgWall) },
    { name: "Parallel branch wall (max preview, category)", ms: avgParallel, pct: pct(avgParallel, avgWall) },
    { name: "Category ranking (+ getModels when brand-only)", ms: stageAgg.categoryRanking, pct: pct(stageAgg.categoryRanking, avgWall) },
    { name: "Preview group ranking", ms: stageAgg.previewRanking, pct: pct(stageAgg.previewRanking, avgWall) },
    { name: "JSON serialization", ms: stageAgg.jsonSerialization, pct: pct(stageAgg.jsonSerialization, avgWall) },
    { name: "Grouping + URL building", ms: stageAgg.groupingAndUrls, pct: pct(stageAgg.groupingAndUrls, avgWall) },
    { name: "Schema resolution (getProductsColumnsResolved)", ms: stageAgg.getProductsColumnsResolved, pct: pct(stageAgg.getProductsColumnsResolved, avgWall) },
    { name: "Global dedupe", ms: stageAgg.globalDedupe, pct: pct(stageAgg.globalDedupe, avgWall) },
  ].sort((a, b) => b.ms - a.ms);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ-ONLY AUDIT",
    mysqlVersion: (await origQuery("SELECT VERSION() AS v"))[0][0].v,
    profiles: profiles.map((p) => ({
      ...p,
      payload: undefined,
      sql: {
        ...p.sql,
        all: p.sql.all.map((q) => ({
          durationMs: q.durationMs,
          rowsReturned: q.rowsReturned,
          sqlHead: q.sql.replace(/\s+/g, " ").slice(0, 200),
        })),
      },
    })),
    aggregates: {
      avgWallMs: Math.round(avgWall * 100) / 100,
      avgParallelBranchMs: Math.round(avgParallel * 100) / 100,
      stageAvgMs: Object.fromEntries(
        Object.entries(stageAgg).map(([k, v]) => [k, Math.round(v * 100) / 100]),
      ),
      sqlAvgMs: {
        previewGroupSql: Math.round(avgSqlGroup * 100) / 100,
        previewProductSql: Math.round(avgSqlPreview * 100) / 100,
        categorySql: Math.round(avgSqlCategory * 100) / 100,
      },
      bottlenecks,
    },
    loadTest: {
      query: "bugi toyota",
      note: "Includes 60s listing in-process cache after first request within each batch",
      results: loadResults,
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, "profile-data.json"), JSON.stringify(report, null, 2));

  // Markdown deliverable
  const md = buildMarkdown(report, profiles, bottlenecks, loadResults, stageAgg, avgWall);
  fs.writeFileSync(path.join(__dirname, "search-backend-profiling-01.md"), md);

  await pool.end();
  console.log(`\nWrote ${path.join(__dirname, "search-backend-profiling-01.md")}`);
  console.log(`Wrote ${path.join(OUT_DIR, "profile-data.json")}\n`);
}

function buildMarkdown(report, profiles, bottlenecks, loadResults, stageAgg, avgWall) {
  const sample = profiles.find((p) => p.label === "bugi toyota") || profiles[0];
  const exGroup = sample?.explain?.previewGroupSql || {};
  const exCat = sample?.explain?.categorySql || {};

  return `# SEARCH-BACKEND-PROFILING-01

**Date:** ${report.generatedAt.split("T")[0]}  
**Mode:** READ-ONLY AUDIT — no SQL/index/cache/logic changes  
**MySQL:** ${report.mysqlVersion}

---

## Objective

Profile \`GET /api/search/suggest\` to locate where the **900–1900ms** server time is spent.

---

## Architecture (unified pipeline)

\`\`\`
GET /api/search/suggest
        │
        ├─ 1. Parse query (keyword)
        ├─ 2. Resolve scope (normalizeListingQuery)
        │
        ├─ PARALLEL ─────────────────────────────────────┐
        │                                               │
        │  PREVIEW BRANCH                    CATEGORY BRANCH
        │  ├─ 3. Preview group SQL           ├─ 3b. Category SQL
        │  │     (JOIN pcm, pc, pa, cm)      │     (JOIN pcm, pc [, pa, cm])
        │  │     GROUP BY category+vehicle    │     GROUP BY category
        │  ├─ 4. rankSearchPreviewGroups     ├─ 4b. rankCategorySidebarSuggestions
        │  ├─ 5. Top 3 groups                │     (+ getModels if brand-only)
        │  ├─ 6. Preview SQL ×3              │
        │  │     getProductList per group      │
        │  │     (SELECT + COUNT + images     │
        │  │      + fitment per group)       │
        │  ├─ 7. Global dedupe (max 2/group) │
        │  └─ 8. sortSuggestPreviewProducts  │
        │                                               │
        └───────────────────────────────────────────────┘
        │
        ├─ 9. Group mapping + URL building
        └─ 10. JSON serialization → response
\`\`\`

---

## Stage timing (average across ${profiles.length} test queries)

| Stage | Avg ms | % of wall |
|-------|--------|-----------|
| Preview product SQL (3× \`getProductList\`) | ${report.aggregates.sqlAvgMs.previewProductSql} | ${pct(report.aggregates.sqlAvgMs.previewProductSql, avgWall)}% |
| Preview group SQL (category+vehicle GROUP BY) | ${report.aggregates.sqlAvgMs.previewGroupSql} | ${pct(report.aggregates.sqlAvgMs.previewGroupSql, avgWall)}% |
| Category sidebar SQL | ${report.aggregates.sqlAvgMs.categorySql} | ${pct(report.aggregates.sqlAvgMs.categorySql, avgWall)}% |
| Category ranking (+ models facet) | ${stageAgg.categoryRanking.toFixed(2)} | ${pct(stageAgg.categoryRanking, avgWall)}% |
| Preview group ranking | ${stageAgg.previewRanking.toFixed(2)} | ${pct(stageAgg.previewRanking, avgWall)}% |
| Schema resolution | ${stageAgg.getProductsColumnsResolved.toFixed(2)} | ${pct(stageAgg.getProductsColumnsResolved, avgWall)}% |
| Grouping + URL build | ${stageAgg.groupingAndUrls.toFixed(2)} | ${pct(stageAgg.groupingAndUrls, avgWall)}% |
| Global dedupe | ${stageAgg.globalDedupe.toFixed(2)} | ${pct(stageAgg.globalDedupe, avgWall)}% |
| Product sort (re-run) | ${stageAgg.productSorting.toFixed(2)} | ${pct(stageAgg.productSorting, avgWall)}% |
| JSON serialization | ${stageAgg.jsonSerialization.toFixed(2)} | ${pct(stageAgg.jsonSerialization, avgWall)}% |
| Parse + resolve scope | ${(stageAgg.parseQuery + stageAgg.resolveScope).toFixed(2)} | ${pct(stageAgg.parseQuery + stageAgg.resolveScope, avgWall)}% |
| **Total wall (staged sequential)** | **${avgWall.toFixed(2)}** | **100%** |
| Parallel effective (max branch) | ${report.aggregates.avgParallelBranchMs} | ${pct(report.aggregates.avgParallelBranchMs, avgWall)}% |

> Production runs preview + category branches in \`Promise.all\`. Wall time ≈ **max(preview branch, category branch)** + assembly, not sum of both SQL paths.

---

## Per-query wall time

| Query | Wall ms | SQL ms | Queries | JSON KB | Groups | Products |
|-------|---------|--------|---------|---------|--------|----------|
${profiles.map((p) => `| ${p.label} | ${p.totalWall} | ${p.sql.totalSqlDuration} | ${p.sql.queryCount} | ${(p.allocation.jsonBytes / 1024).toFixed(1)} | ${p.allocation.groupsReturned} | ${p.allocation.productsReturned} |`).join("\n")}

---

## Top 10 bottlenecks (ranked)

${bottlenecks.map((b, i) => `${i + 1}. **${b.name}** — ${b.ms.toFixed(2)}ms (${b.pct}%)`).join("\n")}

---

## SQL profile — Preview group query (\`bugi toyota\` sample)

| Metric | Value |
|--------|-------|
| Execution time (EXPLAIN ANALYZE) | ~${exGroup.executionTimeMs || "n/a"}ms |
| Rows examined | ${exGroup.rowsExamined || "n/a"} |
| Rows returned (groups) | ${sample?.allocation?.groupRowsExamined ?? "n/a"} |
| Filesort | ${exGroup.usesFilesort ? "yes" : "no"} |
| Temp table | ${exGroup.usesTempTable ? "yes" : "no"} |
| JOIN count (plan) | ${exGroup.joinCount ?? "n/a"} |

**Shape:** \`FROM products p\` → LEFT JOIN \`product_category_map\`, \`product_categories\`, \`product_car_applications\`, \`car_models\` → JOIN \`shops\` → keyword LIKE filters → **GROUP BY** canonical category + \`cm.hang_xe\` + \`cm.ten_xe\` → HAVING count > 0. **No LIMIT** on aggregation query.

<details>
<summary>EXPLAIN ANALYZE excerpt (preview group SQL)</summary>

\`\`\`
${(exGroup.text || exGroup.error || "n/a").split("\n").slice(0, 40).join("\n")}
\`\`\`
</details>

---

## SQL profile — Category sidebar query (\`bugi toyota\` sample)

| Metric | Value |
|--------|-------|
| Execution time (EXPLAIN ANALYZE) | ~${exCat.executionTimeMs || "n/a"}ms |
| Rows examined | ${exCat.rowsExamined || "n/a"} |
| Rows returned (categories) | ${sample?.allocation?.categoriesReturned ?? "n/a"} |
| Filesort | ${exCat.usesFilesort ? "yes" : "no"} |
| Temp table | ${exCat.usesTempTable ? "yes" : "no"} |

**Shape:** Same product listing joins (vehicle join when scope has brand/model/year) → **GROUP BY category only** (no vehicle dimension).

---

## SQL profile — Preview product queries (largest cost)

Each top-3 group triggers **one \`getProductList\`** call, which runs **in parallel**:

| Sub-query | Per group | Typical rows returned |
|-----------|-----------|----------------------|
| \`selectProductListRows\` | 1 | 16 (LIMIT) |
| \`countProductList\` | 1 | 1 |
| \`selectPrimaryImagesForProducts\` | 1 | ≤16 |
| \`loadPrimaryFitmentCarsByProductIds\` | 1 | ≤16 |

**3 groups → ~12 SQL round-trips** for preview products alone (before listing cache).

| Metric (avg across queries) | Value |
|-----------------------------|-------|
| Preview product SQL total | ${report.aggregates.sqlAvgMs.previewProductSql}ms |
| Preview group SQL total | ${report.aggregates.sqlAvgMs.previewGroupSql}ms |
| Category SQL total | ${report.aggregates.sqlAvgMs.categorySql}ms |
| Avg SQL queries per request | ${(profiles.reduce((s, p) => s + p.sql.queryCount, 0) / profiles.length).toFixed(1)} |

**Vehicle fitment join cost:** Preview group SQL **always** joins \`product_car_applications\` + \`car_models\` (GROUP BY vehicle). Category SQL joins fitment only when listing scope includes brand/model/year.

---

## Object allocation (average)

| Metric | Avg |
|--------|-----|
| Category+vehicle group rows (pre-rank) | ${(profiles.reduce((s, p) => s + p.allocation.groupRowsExamined, 0) / profiles.length).toFixed(1)} |
| Top groups used | 3 |
| Products fetched (pre-dedupe) | ${(profiles.reduce((s, p) => s + p.allocation.productsFetched, 0) / profiles.length).toFixed(1)} |
| Products returned (post-dedupe) | ${(profiles.reduce((s, p) => s + p.allocation.productsReturned, 0) / profiles.length).toFixed(1)} |
| Products discarded/deduped | ${(profiles.reduce((s, p) => s + p.allocation.productsDiscarded, 0) / profiles.length).toFixed(1)} |
| Categories returned | ${(profiles.reduce((s, p) => s + p.allocation.categoriesReturned, 0) / profiles.length).toFixed(1)} |
| JSON payload size | ${(profiles.reduce((s, p) => s + p.allocation.jsonBytes, 0) / profiles.length / 1024).toFixed(1)} KB |
| Heap delta (per staged run) | ${(profiles.reduce((s, p) => s + p.allocation.heapDeltaMb, 0) / profiles.length).toFixed(2)} MB |

---

## Node.js profiling summary

| Component | Observation |
|-----------|-------------|
| CPU time | Ranking, dedupe, URL building < 5ms combined — negligible vs DB |
| Async waiting | Dominated by MySQL pool (\`pool.query\`) |
| DB waiting | ~${pct(report.aggregates.sqlAvgMs.previewProductSql + report.aggregates.sqlAvgMs.previewGroupSql + report.aggregates.sqlAvgMs.categorySql, avgWall)}% of staged wall |
| JSON serialization | ~${stageAgg.jsonSerialization.toFixed(2)}ms avg — negligible |
| In-process listing cache | \`getProductList\` uses 60s TTL \`getOrSetCache\` — warms after first identical facet query |

---

## HTTP load test (\`bugi toyota\`)

| Requests | Avg ms | P50 ms | P95 ms | Max ms |
|----------|--------|--------|--------|--------|
${Object.entries(loadResults).map(([n, r]) => `| ${n} | ${r.avg} | ${r.p50} | ${r.p95} | ${r.max} |`).join("\n")}

> Repeated identical requests benefit from **listing cache** (60s) and connection reuse; first request in each batch is coldest.

---

## Timeline (\`bugi toyota\` representative)

\`\`\`
0ms ──────────────────────────────────────────────────────────────► ${sample?.totalWall}ms
│ parse+scope (${(sample?.stages.parseQuery + sample?.stages.resolveScope).toFixed(1)}ms)
│ ├─ [parallel] preview branch ──────────────────────────────── ~${sample?.previewBranchTotal}ms
│ │    ├─ group SQL ─────────────── ${sample?.sql.previewGroupSqlDuration}ms
│ │    ├─ ranking ───────────────── ${sample?.stages.previewRanking}ms
│ │    └─ 3× product list SQL ───── ${sample?.sql.previewProductSqlDuration}ms
│ └─ [parallel] category branch ───────────────────────────── ~${sample?.categoryBranchTotal}ms
│      ├─ category SQL ──────────── ${sample?.sql.categorySqlDuration}ms
│      └─ ranking ───────────────── ${sample?.stages.categoryRanking}ms
│ assembly + JSON ────────────────── ${(sample?.stages.groupingAndUrls + sample?.stages.jsonSerialization).toFixed(1)}ms
\`\`\`

---

## Optimization candidates (audit only — NOT implemented)

1. **Collapse 3× \`getProductList\` into one batch query** — largest win; eliminates ~9–12 SQL round-trips per request.
2. **Add LIMIT to preview group aggregation** — full GROUP BY over all matching products×vehicles before JS ranking slices to 3.
3. **Materialized category×vehicle counts** — avoid heavy GROUP BY on every keystroke.
4. **Share work between preview group SQL and category SQL** — both scan similar product sets today.
5. **Reduce per-product fitment/image fetches** — secondary queries per group add latency even with cache.
6. **Connection/query concurrency cap** — 3 parallel \`getProductList\` × 4 sub-queries stresses pool under load.

---

## Raw data

- \`audit/search-backend-profiling-01/profile-data.json\`

---

**SEARCH-BACKEND-PROFILING-01** — measurement complete, no code changes.
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
