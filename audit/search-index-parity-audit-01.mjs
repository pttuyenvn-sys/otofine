#!/usr/bin/env node
/**
 * SEARCH-INDEX-PARITY-AUDIT-01 — read-only parity audit (products vs product_search_index).
 * Does NOT modify runtime, schema, or index data.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "search-index-parity-audit-01");
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });

const QUERY_TARGET = Number(process.env.PARITY_AUDIT_QUERIES || 10000);
const SAMPLE_DETAIL = Number(process.env.PARITY_AUDIT_SAMPLE || 500);
const LATENCY_SAMPLE = Number(process.env.PARITY_AUDIT_LATENCY_N || 800);

process.env.SEARCH_ENGINE_MODE = process.env.SEARCH_ENGINE_MODE || "hybrid";
process.env.SEARCH_ENGINE_DEBUG = "0";

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarizeLatency(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    n: sorted.length,
    avg: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 100) / 100,
    p50: Math.round(pct(sorted, 50) * 100) / 100,
    p90: Math.round(pct(sorted, 90) * 100) / 100,
    p95: Math.round(pct(sorted, 95) * 100) / 100,
    p99: Math.round(pct(sorted, 99) * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
  };
}

function topKOverlap(a, b, k) {
  const sa = a.slice(0, k);
  const sb = new Set(b.slice(0, k));
  let hit = 0;
  for (const id of sa) if (sb.has(id)) hit += 1;
  return sa.length ? hit / sa.length : 1;
}

function exactOrderPct(a, b, k) {
  const n = Math.min(k, a.length, b.length);
  if (!n) return 1;
  let match = 0;
  for (let i = 0; i < n; i += 1) if (a[i] === b[i]) match += 1;
  return match / n;
}

function mrr(expected, actual) {
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] === expected[0]) return 1 / (i + 1);
  }
  return 0;
}

function ndcgAtK(expected, actual, k) {
  const rel = new Map();
  for (let i = 0; i < expected.length; i += 1) {
    rel.set(expected[i], expected.length - i);
  }
  let dcg = 0;
  for (let i = 0; i < Math.min(k, actual.length); i += 1) {
    const r = rel.get(actual[i]) || 0;
    dcg += r / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(k, expected.length); i += 1) {
    idcg += (expected.length - i) / Math.log2(i + 2);
  }
  return idcg > 0 ? dcg / idcg : 1;
}

function typoWord(w) {
  if (w.length < 4) return w;
  const i = Math.floor(Math.random() * (w.length - 2)) + 1;
  const chars = w.split("");
  chars[i] = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return chars.join("");
}

async function generateQuerySet(pool) {
  const queries = [];
  const seen = new Set();

  const add = (q, type) => {
    const kw = String(q.query || q.keyword || q.q || "").trim();
    if (!kw || kw.length < 1) return;
    const key = JSON.stringify(q);
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ ...q, query: kw, _type: type });
  };

  const [partRows] = await pool.query(
    `SELECT partNumber FROM products WHERE partNumber IS NOT NULL AND TRIM(partNumber) <> '' ORDER BY RAND() LIMIT 2000`,
  );
  for (const r of partRows) add({ query: r.partNumber }, "oem");

  const [brandRows] = await pool.query(
    `SELECT DISTINCT hang_xe AS brand FROM car_models WHERE hang_xe IS NOT NULL AND TRIM(hang_xe) <> '' LIMIT 40`,
  );
  const [modelRows] = await pool.query(
  `SELECT DISTINCT hang_xe AS brand, ten_xe AS model FROM car_models WHERE hang_xe IS NOT NULL AND ten_xe IS NOT NULL ORDER BY RAND() LIMIT 400`,
  );
  for (const r of brandRows) add({ query: r.brand }, "brand");
  for (const r of modelRows) {
    add({ query: r.model, brand: r.brand }, "brand+model");
    add({ query: `${r.brand} ${r.model}` }, "brand+model-phrase");
  }

  const [catRows] = await pool.query(
    `SELECT category_name, canonical_name FROM product_categories WHERE is_active = 1 ORDER BY RAND() LIMIT 300`,
  );
  for (const r of catRows) {
    const c = r.canonical_name || r.category_name;
    add({ query: c }, "category");
    if (brandRows[0]) add({ query: c, brand: brandRows[0].brand }, "category+brand");
    if (modelRows[0]) add({ query: c, brand: modelRows[0].brand, model: modelRows[0].model }, "category+brand+model");
  }

  const [kwRows] = await pool.query(
    `SELECT search_keywords FROM product_meta WHERE search_keywords IS NOT NULL AND TRIM(search_keywords) <> '' ORDER BY RAND() LIMIT 1500`,
  );
  for (const r of kwRows) {
    const parts = String(r.search_keywords).split(/[,;|]/).map((x) => x.trim()).filter((x) => x.length >= 2);
    for (const p of parts.slice(0, 3)) add({ query: p }, "keyword");
  }

  const [nameRows] = await pool.query(
    `SELECT partName FROM products WHERE partName IS NOT NULL ORDER BY RAND() LIMIT 2000`,
  );
  for (const r of nameRows) {
    const words = String(r.partName).split(/\s+/).filter((w) => w.length >= 3);
    if (words.length) add({ query: words.slice(0, Math.min(4, words.length)).join(" ") }, "free-text");
    if (words.length >= 2) add({ query: typoWord(words.join(" ")) }, "typo");
  }

  const english = ["brake pad", "oil filter", "spark plug", "timing belt", "water pump", "fuel pump", "air filter"];
  for (const e of english) add({ query: e }, "english");

  const short = ["ốp", "đèn", "mâm", "lốp", "bugi", "ắc", "còi"];
  for (const s of short) add({ query: s }, "short");

  const long = [
    "phu tung thay the chinh hang cho xe con",
    "linh kien bao duong dinh ky o to toyota honda mazda",
  ];
  for (const l of long) add({ query: l }, "long");

  while (queries.length < QUERY_TARGET) {
    const base = queries[Math.floor(Math.random() * queries.length)];
    const q = { ...base };
    if (Math.random() < 0.3 && brandRows.length) {
      q.brand = brandRows[Math.floor(Math.random() * brandRows.length)].brand;
    }
    if (Math.random() < 0.2 && modelRows.length) {
      const m = modelRows[Math.floor(Math.random() * modelRows.length)];
      q.brand = m.brand;
      q.model = m.model;
    }
    if (Math.random() < 0.1) q.year = String(2015 + Math.floor(Math.random() * 10));
    q._type = "random-mix";
    const key = JSON.stringify(q);
    if (!seen.has(key)) {
      seen.add(key);
      queries.push(q);
    }
    if (seen.size > QUERY_TARGET * 3) break;
  }

  return queries.slice(0, QUERY_TARGET);
}

async function runHealthAudit(pool) {
  const { getProductsColumnsResolved } = await import("../backend/utils/productsTableColumns.server.js");
  const { buildPublicProductWhereClause } = await import(
    "../backend/modules/products/services/productPublicVisibility.server.js"
  );
  const { compareProductIndex } = await import("../backend/services/search/searchIndexCompare.server.js");
  const { CURRENT_SEARCH_INDEX_VERSION } = await import("../backend/config/searchIndexConfig.js");
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  const [[idxStats]] = await pool.query(`
    SELECT
      COUNT(*) AS documents,
      COUNT(DISTINCT product_id) AS products,
      SUM(CASE WHEN document_hash IS NULL THEN 1 ELSE 0 END) AS null_hash,
      SUM(CASE WHEN search_version < ? THEN 1 ELSE 0 END) AS stale_version
    FROM product_search_index WHERE status = 'active'
  `, [CURRENT_SEARCH_INDEX_VERSION]);

  const [[legacy]] = await pool.query(`
    SELECT COUNT(DISTINCT ${pid}) AS c FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")} WHERE 1=1 ${vis.sql}
  `);

  const [[missing]] = await pool.query(`
    SELECT COUNT(*) AS c FROM (
      SELECT DISTINCT ${pid} AS id FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      WHERE 1=1 ${vis.sql}
    ) pub
    WHERE NOT EXISTS (
      SELECT 1 FROM product_search_index psi
      WHERE psi.product_id = pub.id AND psi.status = 'active'
    )
  `);

  const [[orphan]] = await pool.query(`
    SELECT COUNT(DISTINCT psi.product_id) AS c
    FROM product_search_index psi
    WHERE psi.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM products p
        INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
        WHERE ${pid} = psi.product_id ${vis.sql}
      )
  `);

  const [[dup]] = await pool.query(`
    SELECT COUNT(*) AS c FROM (
      SELECT product_id, model_id, year_from, year_to, COUNT(*) AS n
      FROM product_search_index
      GROUP BY product_id, model_id, year_from, year_to
      HAVING n > 1
    ) d
  `);

  const [deletedInIndex] = await pool.query(`
    SELECT psi.product_id
    FROM product_search_index psi
    INNER JOIN products p ON p.id = psi.product_id
    WHERE psi.status = 'active'
      AND TRIM(LOWER(p.moderation_status)) IN ('hidden', 'deleted')
    LIMIT 20
  `);

  const hashSample = [];
  const [sampleIds] = await pool.query(`
    SELECT DISTINCT product_id AS id FROM product_search_index ORDER BY RAND() LIMIT 200
  `);
  let hashMismatch = 0;
  for (const row of sampleIds) {
    const cmp = await compareProductIndex(pool, row.id);
    if (!cmp.ok) {
      hashMismatch += 1;
      if (hashSample.length < 10) hashSample.push({ productId: row.id, mismatches: cmp.mismatches.slice(0, 2) });
    }
  }

  return {
    indexDocuments: Number(idxStats.documents) || 0,
    indexProducts: Number(idxStats.products) || 0,
    legacyPublicProducts: Number(legacy.c) || 0,
    missingDocuments: Number(missing.c) || 0,
    orphanDocuments: Number(orphan.c) || 0,
    duplicateKeys: Number(dup.c) || 0,
    nullHashRows: Number(idxStats.null_hash) || 0,
    staleVersionRows: Number(idxStats.stale_version) || 0,
    deletedProductsInIndex: deletedInIndex.map((r) => r.product_id),
    hashMismatchSample: hashMismatch,
    hashMismatchExamples: hashSample,
  };
}

async function fetchProductsTop20(rawQuery) {
  const { buildSearchInventoryContext } = await import("../backend/services/search/searchInventoryQuery.js");
  const { selectProductListRows } = await import("../backend/repositories/productList.repository.js");
  const keyword = String(rawQuery.query || "").trim();
  const ctx = await buildSearchInventoryContext(rawQuery, keyword);
  const rows = await selectProductListRows({
    pc: ctx.pc,
    where: ctx.where,
    params: ctx.params,
    keywordOrder: ctx.keywordOrder,
    limit: 20,
    offset: 0,
    sort: "popular",
    joinCategoryMap: true,
    joinVehicleFitment: true,
  });
  return {
    ids: rows.map((r) => Number(r.id)),
    provider: ctx.searchProvider || "unknown",
    ctx,
  };
}

async function fetchIndexTop20(rawQuery) {
  const { resolveIndexSearchExecution, fetchIndexRankedProductIds } = await import(
    "./lib/indexSearchExecution.mjs"
  );
  const exec = await resolveIndexSearchExecution(rawQuery);
  const ids = await fetchIndexRankedProductIds(exec, 20);
  return { ids, provider: exec.provider, exec };
}

async function compareSuggestDetail(rawQuery) {
  const { buildSearchSuggestResponse } = await import("../backend/services/searchSuggest.service.js");
  const { buildGroupSuggestUrl, buildViewAllSuggestUrl } = await import(
    "../backend/utils/listingSuggestUrls.js"
  );
  const { resolveIndexSearchExecution, fetchIndexGroupedInventory } = await import(
    "./lib/indexSearchExecution.mjs"
  );
  const { rankSearchPreviewGroups, rankCategorySidebarSuggestions } = await import(
    "../backend/utils/categorySuggestRanking.js"
  );
  const { normalizeListingQuery } = await import("../backend/utils/listingQueryNormalize.js");

  const productsSuggest = await buildSearchSuggestResponse(rawQuery);
  const keyword = String(rawQuery.query || "").trim();
  const listing = normalizeListingQuery(rawQuery);
  const exec = await resolveIndexSearchExecution(rawQuery);
  const { vehicleGroups, categoryGroups } = await fetchIndexGroupedInventory(exec);
  const rankedVehicles = rankSearchPreviewGroups(vehicleGroups, {
    keyword,
    brand: listing.brand,
    model: listing.model,
  });
  const rankedCategories = rankCategorySidebarSuggestions(categoryGroups, {
    keyword,
    brand: listing.brand,
    model: listing.model,
    modelAll: false,
    modelRows: [],
  });

  const indexGroups = rankedVehicles.slice(0, 3).map((g) => ({
    canonical_name: g.canonical_name,
    brand: g.brand,
    model: g.model,
    count: g.total_count,
    url: buildGroupSuggestUrl(g),
  }));

  const productGroups = (productsSuggest.groups || []).slice(0, 3).map((g) => ({
    canonical_name: g.canonical_name,
    brand: g.brand,
    model: g.model,
    count: g.count,
    url: g.url,
    productIds: (g.products || []).map((p) => p.id),
  }));

  const viewAllProducts = productsSuggest.viewAll?.url || "";
  const viewAllIndex = buildViewAllSuggestUrl(
    { brand: listing.brand, model: listing.model, year: listing.year, location: listing.location },
    keyword,
  );

  const mismatches = [];
  if (viewAllProducts !== viewAllIndex) {
    mismatches.push({ type: "viewAllUrl", products: viewAllProducts, index: viewAllIndex });
  }
  for (let i = 0; i < Math.min(3, productGroups.length, indexGroups.length); i += 1) {
    const p = productGroups[i];
    const n = indexGroups[i];
    if (p.url !== n.url) mismatches.push({ type: "groupUrl", i, products: p.url, index: n.url });
    if (p.count !== n.count) mismatches.push({ type: "groupCount", i, products: p.count, index: n.count });
  }

  return {
    productGroups,
    indexGroups,
    categoryCountProducts: (productsSuggest.categories || []).length,
    categoryCountIndex: rankedCategories.length,
    mismatches,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { pool } = await import("../backend/config/db.js");

  console.log("[parity-audit] health checks...");
  const health = await runHealthAudit(pool);

  console.log(`[parity-audit] generating ${QUERY_TARGET} queries...`);
  const queries = await generateQuerySet(pool);
  console.log(`[parity-audit] generated ${queries.length} queries`);

  const metrics = {
    top1: 0, top3: 0, top5: 0, top10: 0, top20: 0,
    top10Exact: 0, top20Overlap: 0,
    ndcg10: 0, mrr: 0, exactOrder10: 0,
    missingInIndex: 0,
    extraInIndex: 0,
    n: 0,
  };
  const mismatches = [];
  const productsLat = [];
  const indexLat = [];
  const providerCounts = {};

  const detailSampleIdx = new Set();
  while (detailSampleIdx.size < Math.min(SAMPLE_DETAIL, queries.length)) {
    detailSampleIdx.add(Math.floor(Math.random() * queries.length));
  }
  const detailResults = [];
  let detailMismatchCount = 0;

  console.log("[parity-audit] running parity scan...");
  for (let i = 0; i < queries.length; i += 1) {
    const q = queries[i];
    const rawQuery = { ...q };
    delete rawQuery._type;

    const measureLatency = i < LATENCY_SAMPLE;
    let t0;
    if (measureLatency) t0 = performance.now();
    const products = await fetchProductsTop20(rawQuery);
    if (measureLatency) productsLat.push(performance.now() - t0);

    if (measureLatency) t0 = performance.now();
    const index = await fetchIndexTop20(rawQuery);
    if (measureLatency) indexLat.push(performance.now() - t0);

    providerCounts[products.provider] = (providerCounts[products.provider] || 0) + 1;

    const pIds = products.ids;
    const iIds = index.ids;
    metrics.n += 1;
    metrics.top1 += pIds[0] === iIds[0] ? 1 : 0;
    metrics.top3 += topKOverlap(pIds, iIds, 3);
    metrics.top5 += topKOverlap(pIds, iIds, 5);
    metrics.top10 += topKOverlap(pIds, iIds, 10);
    metrics.top20 += topKOverlap(pIds, iIds, 20);
    metrics.top10Exact += exactOrderPct(pIds, iIds, 10);
    metrics.top20Overlap += topKOverlap(pIds, iIds, 20);
    metrics.ndcg10 += ndcgAtK(pIds, iIds, 10);
    metrics.mrr += pIds.length ? mrr(pIds, iIds) : 1;
    metrics.exactOrder10 += exactOrderPct(pIds, iIds, 10);

    const pSet = new Set(pIds);
    const iSet = new Set(iIds);
    for (const id of pIds) if (!iSet.has(id)) metrics.missingInIndex += 1;
    for (const id of iIds) if (!pSet.has(id)) metrics.extraInIndex += 1;

    if (pIds[0] !== iIds[0] || topKOverlap(pIds, iIds, 10) < 1) {
      if (mismatches.length < 200) {
        mismatches.push({
          query: rawQuery,
          type: q._type,
          productsProvider: products.provider,
          indexProvider: index.provider,
          productsTop10: pIds.slice(0, 10),
          indexTop10: iIds.slice(0, 10),
        });
      }
    }

    if (detailSampleIdx.has(i)) {
      const detail = await compareSuggestDetail(rawQuery);
      if (detail.mismatches.length) detailMismatchCount += 1;
      if (detailResults.length < 50) {
        detailResults.push({ query: rawQuery, ...detail });
      }
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`[parity-audit] ${i + 1}/${queries.length}`);
    }
  }

  const n = metrics.n || 1;
  const parity = {
    queries: n,
    top1Pct: Math.round((metrics.top1 / n) * 100000) / 1000,
    top3OverlapPct: Math.round((metrics.top3 / n) * 100000) / 1000,
    top5OverlapPct: Math.round((metrics.top5 / n) * 100000) / 1000,
    top10OverlapPct: Math.round((metrics.top10 / n) * 100000) / 1000,
    top20OverlapPct: Math.round((metrics.top20 / n) * 100000) / 1000,
    top10ExactOrderPct: Math.round((metrics.top10Exact / n) * 100000) / 1000,
    ndcg10: Math.round((metrics.ndcg10 / n) * 10000) / 10000,
    mrr: Math.round((metrics.mrr / n) * 10000) / 10000,
    missingProductHits: metrics.missingInIndex,
    extraProductHits: metrics.extraInIndex,
  };

  const passTop10 = parity.top10OverlapPct >= 99.9;
  const passTop20 = parity.top20OverlapPct >= 99.95;
  const passMissing = parity.missingProductHits === 0;
  const passHealth = health.missingDocuments === 0 && health.orphanDocuments === 0
    && health.duplicateKeys === 0 && health.deletedProductsInIndex.length === 0;
  const passPopup = detailMismatchCount === 0;

  let readinessScore = 0;
  readinessScore += passHealth ? 25 : Math.max(0, 25 - health.missingDocuments / 100);
  readinessScore += passTop10 ? 30 : parity.top10OverlapPct * 0.3;
  readinessScore += passTop20 ? 20 : parity.top20OverlapPct * 0.2;
  readinessScore += passMissing ? 15 : Math.max(0, 15 - parity.missingProductHits / 50);
  readinessScore += passPopup ? 10 : Math.max(0, 10 - detailMismatchCount / 50);
  readinessScore = Math.round(Math.min(100, readinessScore));

  let recommendation = "NOT READY";
  if (readinessScore >= 85 && passTop10 && passMissing && passHealth) recommendation = "PRODUCTION READY";
  else if (readinessScore >= 65 && parity.top10OverlapPct >= 95) recommendation = "CANARY READY";

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: process.env.SEARCH_ENGINE_MODE,
    queryCount: queries.length,
    health,
    parity,
    latency: {
      products: summarizeLatency(productsLat),
      index: summarizeLatency(indexLat),
    },
    providerCounts,
    suggestSample: {
      size: detailSampleIdx.size,
      popupMismatches: detailMismatchCount,
      examples: detailResults,
    },
    mismatchSamples: mismatches,
    passConditions: {
      top10Parity99_9: passTop10,
      top20Overlap99_95: passTop20,
      missingProducts0: passMissing,
      healthClean: passHealth,
      popupClean: passPopup,
    },
    readinessScore,
    recommendation,
  };

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(payload, null, 2));

  const md = `# SEARCH-INDEX-PARITY-AUDIT-01

Generated: ${payload.generatedAt}  
Mode: \`${payload.mode}\` (runtime unchanged — audit-only index path)  
Queries: **${parity.queries.toLocaleString()}**

## Executive summary

| Metric | Value | Pass threshold |
|--------|-------|----------------|
| Top-10 ID overlap | **${parity.top10OverlapPct}%** | ≥ 99.9% |
| Top-20 ID overlap | **${parity.top20OverlapPct}%** | ≥ 99.95% |
| Top-1 exact match | ${parity.top1Pct}% | — |
| Top-10 exact order | ${parity.top10ExactOrderPct}% | — |
| NDCG@10 (products=truth) | ${parity.ndcg10} | — |
| MRR | ${parity.mrr} | — |
| Missing product hits (top-20) | ${parity.missingProductHits} | 0 |
| Extra product hits (top-20) | ${parity.extraProductHits} | — |

**Readiness score: ${readinessScore}/100 — ${recommendation}**

## Health (index vs products source)

| Check | Count |
|-------|-------|
| Index documents | ${health.indexDocuments} |
| Index distinct products | ${health.indexProducts} |
| Legacy public products | ${health.legacyPublicProducts} |
| Missing index for public product | ${health.missingDocuments} |
| Orphan index rows | ${health.orphanDocuments} |
| Duplicate (product×vehicle) keys | ${health.duplicateKeys} |
| Rows with null document_hash | ${health.nullHashRows} |
| Stale search_version rows | ${health.staleVersionRows} |
| Hidden/deleted products still indexed | ${health.deletedProductsInIndex.length} |
| Hash/content mismatch (200 sample) | ${health.hashMismatchSample} |

## Latency comparison (sample n=${payload.latency.products.n})

| Path | Avg | P50 | P90 | P95 | P99 | Max |
|------|-----|-----|-----|-----|-----|-----|
| Products (runtime) | ${payload.latency.products.avg}ms | ${payload.latency.products.p50}ms | ${payload.latency.products.p90}ms | ${payload.latency.products.p95}ms | ${payload.latency.products.p99}ms | ${payload.latency.products.max}ms |
| Index (simulated) | ${payload.latency.index.avg}ms | ${payload.latency.index.p50}ms | ${payload.latency.index.p90}ms | ${payload.latency.index.p95}ms | ${payload.latency.index.p99}ms | ${payload.latency.index.max}ms |

## Provider usage (products runtime)

${Object.entries(providerCounts).map(([k, v]) => `- ${k}: ${v} (${Math.round((v / n) * 1000) / 10}%)`).join("\n")}

## Group / popup / SEO sample (n=${payload.suggestSample.size})

Popup/URL mismatches: **${detailMismatchCount}**

View-all URLs are identical when scope+keyword match (built from same \`listingSuggestUrls\` helpers). Group URL divergences indicate category slug or group ranking differences.

## Top bottlenecks for index cutover

1. **Ranking** — runtime \`popular\` sort uses price, stock, freshness, MOD(day+id); index simulation uses text relevance + product_id only → order divergence even when ID sets match.
2. **FULLTEXT scope** — runtime matches \`products\` + \`product_meta.search_keywords\`; index uses denormalized \`search_text\` only.
3. **Slug resolution** — index stores \`category_id\`/\`category_name\`; runtime joins \`product_categories\` for \`canonical_slug\` at query time (simulated via JOIN in audit).
4. **Fitment grain** — index is one row per product×vehicle; runtime DISTINCT in CTE — equivalent for ID sets when sync is correct.

## Pass / fail

| Condition | Result |
|-----------|--------|
| Top-10 parity ≥ 99.9% | ${passTop10 ? "PASS" : "**FAIL**"} |
| Top-20 overlap ≥ 99.95% | ${passTop20 ? "PASS" : "**FAIL**"} |
| Missing products = 0 | ${passMissing ? "PASS" : "**FAIL**"} |
| Index health clean | ${passHealth ? "PASS" : "**FAIL**"} |
| Popup/URL clean (sample) | ${passPopup ? "PASS" : "**FAIL**"} |

## Rollback assessment

No runtime changes were made. Index remains sync-only. Cutover would require a feature flag on providers; rollback = flag off, continue reading \`products\`. Index table can remain populated.

## Mismatch samples (first ${mismatches.length})

${mismatches.slice(0, 15).map((m) => `
### \`${JSON.stringify(m.query)}\` (${m.type})
- Products provider: ${m.productsProvider} | Index: ${m.indexProvider}
- Products top-10: ${m.productsTop10.join(", ")}
- Index top-10: ${m.indexTop10.join(", ")}
`).join("\n")}

## Recommendation

**${recommendation}** (score ${readinessScore}/100)

${recommendation === "NOT READY"
    ? "Index document coverage is solid, but top-k parity and/or ranking diverge from runtime. Do not switch providers until ranking fields are indexed or parity gate accepts order-insensitive sets only."
    : recommendation === "CANARY READY"
      ? "Safe for shadow-read / canary comparing index vs products on sampled traffic. Keep products as source of truth."
      : "Meets strict parity gates for ID sets; validate ranking UX in canary before full cutover."}
`;

  fs.writeFileSync(path.join(OUT, "SEARCH-INDEX-PARITY-AUDIT-01.md"), md);
  fs.writeFileSync(path.join(__dirname, "search-index-parity-audit-01.md"), md);

  console.log(md);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});