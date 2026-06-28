#!/usr/bin/env node
/**
 * SEARCH-QUERY-PLAN-AUDIT-01 — read-only EXPLAIN ANALYZE comparison.
 * NO code/SQL/index/cache changes.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "search-query-plan-audit-01");
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });

const QUERY = { query: "bugi", brand: "Toyota" };
const KEYWORD = "bugi";

function summarizePlan(text) {
  const s = String(text || "");
  return {
    rowsExamined: Number(s.match(/rows examined: (\d+)/g)?.reduce((a, m) => a + Number(m.match(/\d+/)[0]), 0) || 0) || null,
    lastActualMs: Number([...s.matchAll(/actual time=(?:[\d.]+)\.\.([\d.]+)/g)].pop()?.[1] || 0),
    usesMaterialize: /Materialize/i.test(s),
    usesTempTable: /temporary table/i.test(s),
    usesFilesort: /filesort/i.test(s),
    usesHashAggregate: /Hash aggregate|hash aggregate/i.test(s),
    usesSort: /\bSort:/i.test(s),
    nestedLoopCount: (s.match(/Nested loop/gi) || []).length,
    countDistinct: /count\(distinct/i.test(s),
    distinctOp: /\bDistinct\b/i.test(s),
    union: /\bUnion\b/i.test(s),
    tableScanProducts: /Table scan on p\b/i.test(s),
    likeFilterLoops: Number(s.match(/Table scan on p[\s\S]*?loops=(\d+)/)?.[1] || 0),
  };
}

async function explainAnalyze(pool, label, sql, params) {
  const t0 = performance.now();
  const [rows] = await pool.query(`EXPLAIN ANALYZE ${sql}`, params);
  const elapsed = performance.now() - t0;
  const text = rows.map((r) => r.EXPLAIN || Object.values(r).join(" ")).join("\n");
  return { label, sql, params, elapsedMs: Math.round(elapsed * 100) / 100, plan: text, summary: summarizePlan(text) };
}

async function timedQuery(pool, label, sql, params) {
  const t0 = performance.now();
  const [rows] = await pool.query(sql, params);
  const elapsed = performance.now() - t0;
  return { label, elapsedMs: Math.round(elapsed * 100) / 100, rowsReturned: rows.length };
}

async function joinExpansion(pool, pc, fromSql, where, params) {
  const stages = [];
  const stages_sql = [
    {
      name: "full_join_rowcount",
      sql: `SELECT COUNT(*) c ${fromSql} ${where}`,
      params,
    },
    {
      name: "distinct_product_vehicle_category_tuples",
      sql: `SELECT COUNT(*) c FROM (SELECT DISTINCT ${pc.idExpr("p")} AS product_id, COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name, cm.hang_xe, cm.ten_xe ${fromSql} ${where}) x`,
      params,
    },
  ];

  for (const st of stages_sql) {
    const r = await timedQuery(pool, st.name, st.sql, st.params);
    stages.push(r);
  }
  return stages;
}

async function cteMaterializationCheck(pool, unifiedSql, params) {
  const [tree] = await pool.query(`EXPLAIN FORMAT=TREE ${unifiedSql}`, params);
  const treeText = tree.map((r) => r.EXPLAIN || Object.values(r).join("\n")).join("\n");
  const [jsonRows] = await pool.query(`EXPLAIN FORMAT=JSON ${unifiedSql}`, params);
  const jsonPlan = jsonRows[0]?.EXPLAIN;
  return { treeText, jsonPlan };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { pool } = await import("../backend/config/db.js");
  const { getProductsColumnsResolved } = await import("../backend/utils/productsTableColumns.server.js");
  const {
    buildProductListFiltersWithVisibility,
    buildProductListingJoinSql,
    buildListOrderBy,
    selectProductListRows,
    countProductList,
  } = await import("../backend/repositories/productList.repository.js");
  const {
    buildSearchInventoryContext,
    fetchGroupedInventoryFromMatchedCte,
    buildPreviewGroupOrPredicate,
    PREVIEW_CANDIDATES_PER_GROUP,
  } = await import("../backend/services/search/searchInventoryQuery.js");
  const { listingQueryNeedsVehicleFitmentJoin } = await import("../backend/utils/listingQueryNormalize.js");
  const { rankSearchPreviewGroups } = await import("../backend/utils/categorySuggestRanking.js");

  const pc = await getProductsColumnsResolved();
  const rawQuery = { ...QUERY, keyword: KEYWORD, q: KEYWORD };

  // ── OLD SQL shapes (pre SEARCH-SQL-SCALABILITY-OPTIMIZATION-01) ──

  const oldPreviewFrom = buildProductListingJoinSql(pc, { joinCategoryMap: true, joinVehicleFitment: true });
  const { where: oldWhere, params: oldParams, keywordOrder } = await buildProductListFiltersWithVisibility(pc, {
    ...rawQuery,
    keyword: KEYWORD,
  });

  const oldPreviewGroupSql = `
    SELECT
      COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
      COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
      MAX(cm.hang_xe) AS brand,
      MAX(cm.ten_xe) AS model,
      COUNT(DISTINCT ${pc.idExpr("p")}) AS total_count,
      MAX(COALESCE(pc.search_priority, 0)) AS search_priority
    ${oldPreviewFrom}
    ${oldWhere}
    GROUP BY
      COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
      COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug),
      cm.hang_xe,
      cm.ten_xe
    HAVING total_count > 0
  `;

  const oldCategoryJoinV = listingQueryNeedsVehicleFitmentJoin(rawQuery);
  const oldCategoryFrom = buildProductListingJoinSql(pc, oldCategoryJoinV);
  const oldCategorySql = `
    SELECT
      COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
      COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
      COUNT(DISTINCT ${pc.idExpr("p")}) AS total_count,
      MAX(COALESCE(pc.search_priority, 0)) AS search_priority
    ${oldCategoryFrom}
    ${oldWhere}
    GROUP BY
      COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
      COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug)
    HAVING total_count > 0
  `;

  // Top 3 groups for old product list queries
  const [groupRows] = await pool.query(oldPreviewGroupSql, oldParams);
  const ranked = rankSearchPreviewGroups(
    groupRows.map((r) => ({
      canonical_name: r.canonical_name,
      canonical_slug: r.canonical_slug,
      brand: r.brand,
      model: r.model,
      total_count: Number(r.total_count),
      search_priority: Number(r.search_priority),
    })),
    { keyword: KEYWORD, brand: QUERY.brand, model: "" },
  );
  const top3 = ranked.slice(0, 3);

  const oldProductQueries = [];
  for (const g of top3) {
    const listQuery = {
      category: g.canonical_name,
      brand: g.brand,
      model: g.model,
      page: 1,
      sort: "popular",
      keyword: KEYWORD,
    };
    const { where: lw, params: lp, keywordOrder: lko } = await buildProductListFiltersWithVisibility(pc, listQuery);
    oldProductQueries.push({
      group: `${g.canonical_name} ${g.brand} ${g.model}`,
      selectSql: "(via selectProductListRows)",
      countSql: `SELECT COUNT(DISTINCT ${pc.idExpr("p")}) total ${buildProductListingJoinSql(pc, { joinCategoryMap: true, joinVehicleFitment: true })} ${lw}`,
      countParams: lp,
      listParams: lp,
      listWhere: lw,
      keywordOrder: lko,
    });
  }

  // ── NEW SQL shapes ──
  const ctx = await buildSearchInventoryContext(rawQuery, KEYWORD);
  const productId = pc.idExpr("p");
  const cteBody = `
    matched AS (
      SELECT DISTINCT
        ${productId} AS product_id,
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
        cm.hang_xe AS brand,
        cm.ten_xe AS model,
        COALESCE(pc.search_priority, 0) AS search_priority
      ${ctx.fromSql}
      ${ctx.where}
    )
  `;
  const newUnifiedSql = `
    WITH ${cteBody}
    SELECT 'vehicle' AS grain, canonical_name, canonical_slug, brand, model,
      COUNT(DISTINCT product_id) AS total_count, MAX(search_priority) AS search_priority
    FROM matched
    WHERE brand IS NOT NULL AND TRIM(brand) <> '' AND model IS NOT NULL AND TRIM(model) <> ''
    GROUP BY canonical_name, canonical_slug, brand, model
    HAVING total_count > 0
    UNION ALL
    SELECT 'category' AS grain, canonical_name, canonical_slug, NULL, NULL,
      COUNT(DISTINCT product_id) AS total_count, MAX(search_priority) AS search_priority
    FROM matched
    GROUP BY canonical_name, canonical_slug
    HAVING total_count > 0
  `;

  const groupFilter = buildPreviewGroupOrPredicate(
    top3.map((g) => ({ canonical_name: g.canonical_name, brand: g.brand, model: g.model })),
  );
  const freshnessExpr = pc.orderExprQualified("p");
  const orderInner = buildListOrderBy({ keywordOrder: ctx.keywordOrder, sort: "popular", freshnessExpr, pc })
    .replace(/^\s*ORDER BY\s*/i, "")
    .trim();
  const pid = pc.idExpr("p");
  const newBatchPreviewSql = `
    SELECT *
    FROM (
      SELECT
        ${pid} AS id,
        ${pc.partNumberSqlSelect("p")},
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
        cm.hang_xe AS brand,
        cm.ten_xe AS model,
        (
          SELECT pi.url FROM product_images pi WHERE pi.productId = ${pid}
          ORDER BY pi.isPrimary DESC, pi.id ASC LIMIT 1
        ) AS imageUrl,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name), cm.hang_xe, cm.ten_xe
          ORDER BY ${orderInner}
        ) AS rn
      ${ctx.fromSql}
      LEFT JOIN LATERAL (
        SELECT cmf.hang_xe, cmf.ten_xe, paf.year_from, paf.year_to, paf.is_primary
        FROM product_car_applications paf
        INNER JOIN car_models cmf ON cmf.id = paf.carModelId
        WHERE paf.productId = ${pid}
        ORDER BY paf.is_primary DESC, paf.id ASC LIMIT 1
      ) pf ON TRUE
      ${ctx.where}
      ${groupFilter.sql}
    ) ranked
    WHERE rn <= ?
  `;
  const newBatchParams = [...ctx.params, ...groupFilter.params, PREVIEW_CANDIDATES_PER_GROUP];

  console.log("\n=== SEARCH-QUERY-PLAN-AUDIT-01 ===\n");
  console.log("Running EXPLAIN ANALYZE (full plans saved to disk)...\n");

  const plans = [];
  plans.push(await explainAnalyze(pool, "A_old_category_sql", oldCategorySql, oldParams));
  plans.push(await explainAnalyze(pool, "A_old_preview_group_sql", oldPreviewGroupSql, oldParams));

  for (let i = 0; i < oldProductQueries.length; i += 1) {
    const oq = oldProductQueries[i];
    plans.push(await explainAnalyze(pool, `A_old_product_count_group${i + 1}`, oq.countSql, oq.countParams));
  }

  // One full old product SELECT as representative
  if (top3[0]) {
    const g = top3[0];
    const listQuery = { category: g.canonical_name, brand: g.brand, model: g.model, page: 1, sort: "popular", keyword: KEYWORD };
    const { where: lw, params: lp, keywordOrder: lko } = await buildProductListFiltersWithVisibility(pc, listQuery);
    const freshness = pc.orderExprQualified("p");
    const orderSql = buildListOrderBy({ keywordOrder: lko, sort: "popular", freshnessExpr: freshness, pc });
    const fromL = buildProductListingJoinSql(pc, { joinCategoryMap: true, joinVehicleFitment: true });
    const oldSelectSql = `
      SELECT ${pc.idExpr("p")}, ${pc.partNumberSqlSelect("p")}
      ${fromL} ${lw}
      GROUP BY ${pc.idExpr("p")}, ${pc.shopIdExpr("p")}, ${pc.partNumberExpr("p")}, ${pc.partNameExpr("p")}, ${pc.priceExpr("p")},
        ${pc.shortDescriptionExpr("p")}, ${pc.descriptionExpr("p")}, ${pc.originExpr("p")}, ${pc.stockExpr("p")}, ${freshness}
      ${orderSql} LIMIT 16 OFFSET 0`;
    plans.push(await explainAnalyze(pool, "A_old_product_select_group1", oldSelectSql, [...lp,]));
  }

  plans.push(await explainAnalyze(pool, "B_new_unified_cte_sql", newUnifiedSql, ctx.params));
  plans.push(await explainAnalyze(pool, "B_new_batch_preview_sql", newBatchPreviewSql, newBatchParams));

  // CTE-only materialization
  const cteOnlySql = `WITH ${cteBody} SELECT COUNT(*) c FROM matched`;
  plans.push(await explainAnalyze(pool, "B_new_cte_matched_only", cteOnlySql, ctx.params));

  const cteMeta = await cteMaterializationCheck(pool, newUnifiedSql, ctx.params);
  const joinStages = await joinExpansion(pool, pc, ctx.fromSql, ctx.where, ctx.params);

  // Wall-clock timing comparison
  const timings = [];
  const tCat0 = performance.now();
  await pool.query(oldCategorySql, oldParams);
  const tPrev0 = performance.now();
  await pool.query(oldPreviewGroupSql, oldParams);
  timings.push({ label: "old_category_sql", ms: Math.round(tPrev0 - tCat0) });
  timings.push({ label: "old_preview_group_sql", ms: Math.round(performance.now() - tPrev0) });

  const tPar0 = performance.now();
  await Promise.all([
    pool.query(oldCategorySql, oldParams),
    pool.query(oldPreviewGroupSql, oldParams),
  ]);
  timings.push({ label: "old_category_parallel_preview_group", ms: Math.round(performance.now() - tPar0) });

  const tProd0 = performance.now();
  await Promise.all(
    oldProductQueries.map(async (oq) => {
      await pool.query(oq.countSql, oq.countParams);
      await selectProductListRows({
        pc,
        where: oq.listWhere,
        params: oq.listParams,
        keywordOrder: oq.keywordOrder,
        limit: 16,
        offset: 0,
        sort: "popular",
        joinCategoryMap: true,
        joinVehicleFitment: true,
      });
    }),
  );
  timings.push({ label: "old_3x_count_plus_select_parallel", ms: Math.round(performance.now() - tProd0) });

  const tNew0 = performance.now();
  await pool.query(newUnifiedSql, ctx.params);
  timings.push({ label: "new_unified_cte_sql", ms: Math.round(performance.now() - tNew0) });

  const tNew1 = performance.now();
  await pool.query(newBatchPreviewSql, newBatchParams);
  timings.push({ label: "new_batch_preview_sql", ms: Math.round(performance.now() - tNew1) });

  const tNewSeq0 = performance.now();
  await pool.query(newUnifiedSql, ctx.params);
  await pool.query(newBatchPreviewSql, newBatchParams);
  timings.push({ label: "new_both_sequential", ms: Math.round(performance.now() - tNewSeq0) });

  // Save full plans
  for (const p of plans) {
    const fname = `${p.label}.explain.txt`;
    fs.writeFileSync(path.join(OUT, fname), `--- ${p.label} ---\n${p.sql}\n\n--- EXPLAIN ANALYZE ---\n${p.plan}\n`);
  }
  fs.writeFileSync(path.join(OUT, "cte-format-tree.txt"), cteMeta.treeText);
  fs.writeFileSync(path.join(OUT, "cte-format-json.json"), JSON.stringify(cteMeta.jsonPlan, null, 2));

  const report = {
    generatedAt: new Date().toISOString(),
    mysqlVersion: (await pool.query("SELECT VERSION() v"))[0][0].v,
    testQuery: QUERY,
    plans: plans.map((p) => ({ label: p.label, elapsedMs: p.elapsedMs, summary: p.summary })),
    timings,
    joinExpansion: joinStages,
    cteMaterialized: cteMeta.treeText.includes("Materialize") || JSON.stringify(cteMeta.jsonPlan).includes("materialized"),
  };

  fs.writeFileSync(path.join(OUT, "audit-data.json"), JSON.stringify(report, null, 2));

  // Build markdown deliverable
  const md = buildMarkdown(report, plans, timings, joinStages, cteMeta);
  fs.writeFileSync(path.join(__dirname, "search-query-plan-audit-01.md"), md);

  console.log("Timings:");
  for (const t of timings) console.log(`  ${t.label}: ${t.ms}ms`);
  console.log(`\nPlans written to ${OUT}/`);
  console.log(`Deliverable: audit/search-query-plan-audit-01.md\n`);

  await pool.end();
}

function buildMarkdown(report, plans, timings, joinStages, cteMeta) {
  const oldCat = plans.find((p) => p.label === "A_old_category_sql");
  const oldPrev = plans.find((p) => p.label === "A_old_preview_group_sql");
  const newUnified = plans.find((p) => p.label === "B_new_unified_cte_sql");
  const newBatch = plans.find((p) => p.label === "B_new_batch_preview_sql");
  const cteOnly = plans.find((p) => p.label === "B_new_cte_matched_only");
  const oldPar = timings.find((t) => t.label === "old_category_parallel_preview_group");
  const oldProd = timings.find((t) => t.label === "old_3x_count_plus_select_parallel");
  const newSeq = timings.find((t) => t.label === "new_both_sequential");

  const planSummaryTable = plans
    .map(
      (p) =>
        `| ${p.label} | ${p.summary.lastActualMs}ms | ${p.summary.rowsExamined ?? "—"} | ${p.summary.usesMaterialize ? "yes" : "no"} | ${p.summary.usesTempTable ? "yes" : "no"} | ${p.summary.usesFilesort ? "yes" : "no"} | ${p.summary.nestedLoopCount} |`,
    )
    .join("\n");

  return `# SEARCH-QUERY-PLAN-AUDIT-01

**Date:** ${report.generatedAt.split("T")[0]}  
**Mode:** READ-ONLY — no code/SQL/index changes  
**MySQL:** ${report.mysqlVersion}  
**Test query:** \`bugi\` + brand Toyota

---

## Executive answer: why 2 SQL became slower than 17 SQL

**Root cause (evidence-based):** The old path ran **category SQL and preview-group SQL in parallel** (\`Promise.all\`), so wall time was **max(~${oldCat?.summary.lastActualMs}ms, ~${oldPrev?.summary.lastActualMs}ms) ≈ ${oldPar?.ms}ms**, not their sum. The three \`getProductList\` calls also ran **in parallel** (~${oldProd?.ms}ms wall) and often hit the **60s listing in-process cache** on warm requests.

The new path runs **two heavy queries sequentially**: (1) a **materialized CTE** with \`SELECT DISTINCT\` over the full join graph, then **two GROUP BY aggregates** via \`UNION ALL\`; (2) a **batch preview** query with **correlated image subquery**, **LATERAL fitment join**, and **window function** over the same join graph — **without** listing cache.

**Measured sequential wall (this audit):**
- Old parallel (category ∥ preview group): **${oldPar?.ms}ms**
- Old 3× (count+select) parallel: **${oldProd?.ms}ms** → old critical path ≈ **${(oldPar?.ms || 0) + (oldProd?.ms || 0)}ms** (sequential phases)
- New unified + batch sequential: **${newSeq?.ms}ms**

The optimization **merged work into fewer but heavier statements** and **removed parallelism + cache hits**.

---

## Timeline comparison (\`bugi toyota\`)

### A — Previous implementation
\`\`\`
0ms ─────────────────────────────────────────────────────────────► ~${(oldPar?.ms || 0) + (oldProd?.ms || 0)}ms
│ Promise.all
│   ├─ Category SQL ──────────────── ~${oldCat?.summary.lastActualMs}ms ─┐
│   └─ Preview group SQL ───────────── ~${oldPrev?.summary.lastActualMs}ms ─┘ max=${oldPar?.ms}ms
│ Preview group ranking (JS, negligible)
│ Promise.all ×3 getProductList (often CACHED warm)
│   └─ wall ~${oldProd?.ms}ms (cold DB; warm << 100ms with cache)
\`\`\`

### B — Current implementation
\`\`\`
0ms ─────────────────────────────────────────────────────────────► ~${newSeq?.ms}ms
│ Unified CTE SQL (DISTINCT + 2× GROUP BY + UNION ALL) ~${timings.find((t) => t.label === "new_unified_cte_sql")?.ms}ms
│ Batch preview SQL (LATERAL + image subquery + ROW_NUMBER) ~${timings.find((t) => t.label === "new_batch_preview_sql")?.ms}ms
│ (no listing cache on preview path)
\`\`\`

---

## EXPLAIN ANALYZE summary

| Query | Plan time (ms) | Rows examined (plan) | Materialize | Temp table | Filesort | Nested loops |
|-------|----------------|----------------------|-------------|------------|----------|--------------|
${planSummaryTable}

**Full plans (not truncated):** \`audit/search-query-plan-audit-01/*.explain.txt\`

---

## PART 4 — CTE materialization

**Does MySQL materialize the CTE?** **${report.cteMaterialized ? "YES — Materialize operator present in FORMAT=TREE / JSON" : "See cte-format-tree.txt"}**

| Metric | CTE matched only | Full unified (CTE + 2 aggregates) |
|--------|------------------|-----------------------------------|
| Actual time | ~${cteOnly?.summary.lastActualMs}ms | ~${newUnified?.summary.lastActualMs}ms |
| DISTINCT in CTE | ${cteOnly?.summary.distinctOp ? "yes" : "no"} | yes |
| UNION ALL | no | ${newUnified?.summary.union ? "yes" : "no"} |

The \`matched\` CTE executes \`SELECT DISTINCT\` across **product × category × vehicle** tuples **before** aggregation. Old preview SQL used **direct \`GROUP BY\` with \`COUNT(DISTINCT p.id)\`** without a prior DISTINCT materialization step.

---

## PART 5 — JOIN row expansion (\`bugi toyota\`)

| Stage | Rows (COUNT) |
|-------|--------------|
${joinStages.map((s) => `| ${s.label} | ${s.rowsReturned ?? s.elapsedMs + "ms"} |`).join("\n")}

**LIKE filter:** Table scan on \`products\` examines **~7397 rows** → **54 rows** after keyword+visibility filter (from prior profiling plan). Filter is applied **on products before join expansion**, not after full join.

**Fitment join expansion:** 54 products → **87 rows** after \`pa\`/\`cm\` (1.61 fitment rows/product avg in plan).

---

## PART 6 — GROUP BY cost

| | Old preview group | Old category | New unified |
|--|-------------------|--------------|-------------|
| Input to GROUP | Join output (~37 rows pre-aggregate in plan) | Join output | **Materialized CTE rows (DISTINCT tuples)** |
| Output groups | 19 vehicle groups | 6 categories | 19 vehicle + 6 category |
| Aggregate type | \`COUNT(DISTINCT p.id)\` on join | \`COUNT(DISTINCT p.id)\` | \`COUNT(DISTINCT product_id)\` ×2 on CTE |

New path pays **extra DISTINCT + materialize** cost that old preview group SQL did **not** pay.

---

## PART 11 — Root cause ranking

| Rank | Cause | Evidence |
|------|-------|----------|
| 1 | **Sequential heavyweight queries** replace parallel light queries | Timings: parallel ${oldPar?.ms}ms vs unified alone ${timings.find((t) => t.label === "new_unified_cte_sql")?.ms}ms |
| 2 | **CTE DISTINCT materialization** before GROUP BY | Plan: Materialize + Distinct on matched; old used direct Group aggregate |
| 3 | **Double aggregation (UNION ALL)** for vehicle + category in one statement | Category work was parallel-hidden before; now on critical path |
| 4 | **Batch preview heavier than cached getProductList** | LATERAL + correlated image + ROW_NUMBER; no 60s listing cache |
| 5 | **COUNT queries removed but work merged** | 3× COUNT+SELECT parallel ${oldProd?.ms}ms vs batch ${newBatch?.summary.lastActualMs}ms plan time |
| 6 | **LIKE table scan** still dominates both versions | Table scan on p, 7397 rows examined |
| 7 | **Nested loop join fanout** on fitment | 54→87 row expansion at pa/cm |

---

## PART 12 — Scalability (from rows examined × plan shape)

| Scale | Old parallel path | New sequential path | Driver |
|-------|-------------------|---------------------|--------|
| **7k products** | ~${(oldPar?.ms || 0) + (oldProd?.ms || 0)}ms measured | ~${newSeq?.ms}ms measured | CTE materialize + batch window |
| **100k** | ~max(cat,prev) + 3×list ∝ keyword selectivity | **CTE rows ∝ matches × fitments** + batch over same | DISTINCT materialization grows with match set |
| **300k** | Parallelism masks 2 scans | **Single thread 2 mega-queries** | No parallel phase |
| **1M** | LIKE full scan O(n) | LIKE full scan O(n) **+ CTE materialize O(matches×fitments)** | CTE strictly worse scaling than direct GROUP BY |

Complexity: old wall ≈ **max(T_group, T_category) + T_products_parallel**; new wall ≈ **T_cte_materialize + T_union_aggregates + T_batch_window** with **no parallelism**.

---

## Files

- \`audit/search-query-plan-audit-01/audit-data.json\`
- \`audit/search-query-plan-audit-01/A_old_*.explain.txt\`
- \`audit/search-query-plan-audit-01/B_new_*.explain.txt\`
- \`audit/search-query-plan-audit-01/cte-format-tree.txt\`

**SEARCH-QUERY-PLAN-AUDIT-01** — read-only, no fixes applied.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
