#!/usr/bin/env node
/**
 * SEARCH-INDEX-MISMATCH-ANALYSIS-01 — read-only legacy vs index runtime diagnosis.
 * Loads frozen query corpus from search-index-parity-audit-01/queries.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARITY_DIR = path.join(__dirname, "search-index-parity-audit-01");
const OUT = path.join(__dirname, "search-index-mismatch-analysis-01");
const CORPUS_PATH = path.join(PARITY_DIR, "queries.json");
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });

const QUERY_TIMEOUT_MS = Number(process.env.MISMATCH_QUERY_TIMEOUT_MS || 45000);
const PROGRESS_EVERY = 100;

process.env.SEARCH_ENGINE_MODE = process.env.SEARCH_ENGINE_MODE || "hybrid";
process.env.SEARCH_RUNTIME = "legacy";
process.env.SEARCH_ENGINE_DEBUG = "0";

const ROOT_CAUSES = [
  "MISSING_DOCUMENT", "DUPLICATE_DOCUMENT", "DOCUMENT_HASH_OUTDATED",
  "CATEGORY_MISMATCH", "VEHICLE_MISMATCH", "YEAR_MISMATCH",
  "PARTNUMBER_NORMALIZATION", "FULLTEXT_TOKENIZATION", "LIKE_FALLBACK",
  "STOPWORD", "SYNONYM", "RANKING_ONLY", "HYDRATION", "POPULARITY",
  "SEARCH_PRIORITY", "LIMIT_BEHAVIOR", "BUG", "UNKNOWN",
];

function topKOverlap(a, b, k) {
  const sa = a.slice(0, k);
  const sb = new Set(b.slice(0, k));
  let hit = 0;
  for (const id of sa) if (sb.has(id)) hit += 1;
  return sa.length ? hit / sa.length : 1;
}

function setDiff(a, b) {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
}

function movedPositions(legacy, index) {
  const moves = [];
  const indexPos = new Map(index.map((id, i) => [id, i]));
  for (let i = 0; i < Math.min(20, legacy.length); i += 1) {
    const id = legacy[i];
    if (!indexPos.has(id)) continue;
    const j = indexPos.get(id);
    if (j !== i) moves.push({ productId: id, legacyRank: i + 1, indexRank: j + 1 });
  }
  return moves;
}

function ndcgAtK(expected, actual, k) {
  const rel = new Map();
  for (let i = 0; i < expected.length; i += 1) rel.set(expected[i], expected.length - i);
  let dcg = 0;
  for (let i = 0; i < Math.min(k, actual.length); i += 1) {
    dcg += (rel.get(actual[i]) || 0) / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(k, expected.length); i += 1) {
    idcg += (expected.length - i) / Math.log2(i + 2);
  }
  return idcg > 0 ? dcg / idcg : 1;
}

function mrr(expected, actual) {
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] === expected[0]) return 1 / (i + 1);
  }
  return 0;
}

function isBroadNoise(q) {
  const kw = String(q.query || "").trim().toLowerCase();
  const noise = new Set(["bugi", "lọc", "má", "đèn", "giảm", "ốp", "ắc", "còi", "lốp", "mâm"]);
  return !q.brand && !q.model && (noise.has(kw) || kw.split(/\s+/).length === 1 && kw.length <= 5);
}

function isScoped(q) {
  return Boolean(q.brand || q.model || q.year || q.category || /^[0-9a-z-]{5,}$/i.test(String(q.query || "")));
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadCorpus(pool) {
  if (fs.existsSync(CORPUS_PATH)) {
    const data = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
    return Array.isArray(data) ? data : data.queries;
  }
  fs.mkdirSync(PARITY_DIR, { recursive: true });
  const { generateQuerySet } = await import("./lib/parityQueryCorpus.mjs");
  const queries = await generateQuerySet(pool);
  fs.writeFileSync(
    CORPUS_PATH,
    JSON.stringify({
      frozenAt: new Date().toISOString(),
      source: "SEARCH-INDEX-PARITY-AUDIT-01 algorithm (PARITY-AUDIT run did not persist to disk)",
      count: queries.length,
      queries,
    }),
  );
  console.log(`[mismatch] frozen ${queries.length} queries → ${CORPUS_PATH}`);
  return queries;
}

async function checkProductsInIndex(pool, productIds) {
  if (!productIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT product_id, COUNT(*) AS doc_count FROM product_search_index WHERE product_id IN (?) AND status = 'active' GROUP BY product_id`,
    [productIds],
  );
  return new Map(rows.map((r) => [Number(r.product_id), Number(r.doc_count)]));
}

function classifyRootCause(ctx) {
  const {
    query, qtype, legacyProvider, indexProvider, missing, extra,
    legacyIds, indexIds, missingInIndex, orderOnly,
  } = ctx;

  if (orderOnly) return "RANKING_ONLY";

  if (missing.length && missing.every((id) => !missingInIndex.get(id))) {
    return "MISSING_DOCUMENT";
  }

  if (qtype === "oem" || /^[0-9a-z][0-9a-z-]{4,}$/i.test(String(query.query || ""))) {
    if (missing.length || extra.length) return "PARTNUMBER_NORMALIZATION";
  }

  if (legacyProvider !== indexProvider) {
    if (String(legacyProvider).includes("like") || String(indexProvider).includes("like")) {
      return "LIKE_FALLBACK";
    }
    if (String(legacyProvider).includes("fulltext") || String(indexProvider).includes("fulltext")) {
      return "FULLTEXT_TOKENIZATION";
    }
  }

  if (query.year && (missing.length || extra.length)) return "YEAR_MISMATCH";
  if ((query.brand || query.model) && (missing.length || extra.length)) return "VEHICLE_MISMATCH";
  if (query.category && (missing.length || extra.length)) return "CATEGORY_MISMATCH";

  if (isBroadNoise(query) && (missing.length || extra.length)) return "LIKE_FALLBACK";

  if (missing.length && missing.some((id) => (missingInIndex.get(id) || 0) > 0)) {
    if (legacyIds.length === indexIds.length) return "POPULARITY";
    return "SEARCH_PRIORITY";
  }

  if (extra.length && !missing.length) return "FULLTEXT_TOKENIZATION";
  if (missing.length && !extra.length) return "MISSING_DOCUMENT";

  return "UNKNOWN";
}

async function runDocumentHealth(pool) {
  const { getProductsColumnsResolved } = await import("../backend/utils/productsTableColumns.server.js");
  const { buildPublicProductWhereClause } = await import(
    "../backend/modules/products/services/productPublicVisibility.server.js"
  );
  const { compareProductIndex } = await import("../backend/services/search/searchIndexCompare.server.js");
  const { CURRENT_SEARCH_INDEX_VERSION } = await import("../backend/config/searchIndexConfig.js");
  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });

  const [[idx]] = await pool.query(`
    SELECT COUNT(*) AS docs, COUNT(DISTINCT product_id) AS products,
      SUM(document_hash IS NULL) AS null_hash,
      SUM(search_version < ?) AS stale_version,
      SUM(canonical_slug IS NULL) AS null_slug
    FROM product_search_index WHERE status = 'active'
  `, [CURRENT_SEARCH_INDEX_VERSION]);

  const [[missing]] = await pool.query(`
    SELECT COUNT(*) AS c FROM (
      SELECT DISTINCT ${pid} AS id FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")} WHERE 1=1 ${vis.sql}
    ) pub WHERE NOT EXISTS (
      SELECT 1 FROM product_search_index psi WHERE psi.product_id = pub.id AND psi.status = 'active'
    )
  `);

  const [[orphan]] = await pool.query(`
    SELECT COUNT(DISTINCT psi.product_id) AS c FROM product_search_index psi
    WHERE psi.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM products p INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      WHERE ${pid} = psi.product_id ${vis.sql}
    )
  `);

  const [[dup]] = await pool.query(`
    SELECT COUNT(*) AS c FROM (
      SELECT product_id, model_id, year_from, year_to, COUNT(*) n
      FROM product_search_index GROUP BY 1,2,3,4 HAVING n > 1
    ) d
  `);

  const [deleted] = await pool.query(`
    SELECT psi.product_id FROM product_search_index psi
    INNER JOIN products p ON p.id = psi.product_id
    WHERE psi.status = 'active' AND LOWER(TRIM(p.moderation_status)) IN ('hidden','deleted')
    LIMIT 50
  `);

  let hashMismatch = 0;
  const [sample] = await pool.query(`SELECT DISTINCT product_id AS id FROM product_search_index ORDER BY RAND() LIMIT 50`);
  for (const row of sample) {
    const cmp = await compareProductIndex(pool, row.id);
    if (!cmp.ok) hashMismatch += 1;
  }

  return {
    indexDocuments: Number(idx.docs),
    indexProducts: Number(idx.products),
    nullHashRows: Number(idx.null_hash),
    staleVersionRows: Number(idx.stale_version),
    nullCanonicalSlug: Number(idx.null_slug),
    missingPublicProducts: Number(missing.c),
    orphanIndexProducts: Number(orphan.c),
    duplicateKeys: Number(dup.c),
    deletedProductsInIndex: deleted.map((r) => r.product_id),
    hashMismatchSample: hashMismatch,
    hashMismatchSampleSize: sample.length,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { pool } = await import("../backend/config/db.js");
  const { LegacySearchRuntime } = await import("../backend/services/search/runtime/LegacySearchRuntime.js");
  const { SearchIndexRuntime } = await import("../backend/services/search/runtime/SearchIndexRuntime.js");

  const health = await runDocumentHealth(pool);
  const queries = await loadCorpus(pool);
  console.log(`[mismatch] analysing ${queries.length} queries...`);
  try {
    await pool.query("SET SESSION max_execution_time = ?", [QUERY_TIMEOUT_MS]);
  } catch {
    /* MariaDB / older MySQL */
  }

  const rootCauseCounts = Object.fromEntries(ROOT_CAUSES.map((c) => [c, 0]));
  const rootCauseProducts = Object.fromEntries(ROOT_CAUSES.map((c) => [c, new Set()]));
  const rootCauseLatency = Object.fromEntries(ROOT_CAUSES.map((c) => [c, []]));
  const mismatches = [];
  const falsePositives = [];
  const falseNegatives = [];
  const noiseStats = { broad: { n: 0, mismatch: 0 }, scoped: { n: 0, mismatch: 0 } };

  let total = 0;
  let mismatchCount = 0;
  let orderOnlyCount = 0;
  let identicalCount = 0;
  const metrics = { top1: 0, top3: 0, top5: 0, top10: 0, top20: 0, ndcg10: 0, mrr: 0, exactOrder10: 0 };
  const legacyLat = [];
  const indexLat = [];

  for (let qi = 0; qi < queries.length; qi += 1) {
    const q = queries[qi];
    const rawQuery = { ...q };
    delete rawQuery._type;
    const qtype = q._type || "unknown";

    let legacy, index;
    const t0 = performance.now();
    try {
      legacy = await withTimeout(
        LegacySearchRuntime.searchTopProductIds(rawQuery, 20),
        QUERY_TIMEOUT_MS,
        "legacy",
      );
    } catch (e) {
      legacy = { ids: [], provider: `error:${e.message}` };
    }
    const tLegacy = performance.now() - t0;

    const t1 = performance.now();
    try {
      index = await withTimeout(
        SearchIndexRuntime.searchTopProductIds(rawQuery, 20),
        QUERY_TIMEOUT_MS,
        "index",
      );
    } catch (e) {
      index = { ids: [], provider: `error:${e.message}` };
    }
    const tIndex = performance.now() - t1;

    legacyLat.push(tLegacy);
    indexLat.push(tIndex);

    const legacyIds = legacy.ids || [];
    const indexIds = index.ids || [];
    const missing = setDiff(legacyIds, indexIds);
    const extra = setDiff(indexIds, legacyIds);
    const legacySet = new Set(legacyIds);
    const indexSet = new Set(indexIds);
    const orderOnly = missing.length === 0 && extra.length === 0
      && legacyIds.length > 0
      && legacyIds.some((id, i) => indexIds[i] !== id);

    total += 1;
    metrics.top1 += legacyIds[0] === indexIds[0] ? 1 : 0;
    metrics.top3 += topKOverlap(legacyIds, indexIds, 3);
    metrics.top5 += topKOverlap(legacyIds, indexIds, 5);
    metrics.top10 += topKOverlap(legacyIds, indexIds, 10);
    metrics.top20 += topKOverlap(legacyIds, indexIds, 20);
    metrics.ndcg10 += ndcgAtK(legacyIds, indexIds, 10);
    metrics.mrr += legacyIds.length ? mrr(legacyIds, indexIds) : 1;
    if (legacyIds.length >= 10) {
      let m = 0;
      for (let i = 0; i < 10; i += 1) if (legacyIds[i] === indexIds[i]) m += 1;
      metrics.exactOrder10 += m / 10;
    } else {
      metrics.exactOrder10 += 1;
    }

    if (orderOnly) orderOnlyCount += 1;
    if (!missing.length && !extra.length && !orderOnly) identicalCount += 1;

    const hasMismatch = missing.length || extra.length || orderOnly;
    if (isBroadNoise(rawQuery)) {
      noiseStats.broad.n += 1;
      if (hasMismatch) noiseStats.broad.mismatch += 1;
    } else if (isScoped(rawQuery)) {
      noiseStats.scoped.n += 1;
      if (hasMismatch) noiseStats.scoped.mismatch += 1;
    }

    if (!hasMismatch) continue;
    mismatchCount += 1;

    const missingInIndex = await checkProductsInIndex(pool, [...missing, ...extra]);
    const rootCause = classifyRootCause({
      query: rawQuery,
      qtype,
      legacyProvider: legacy.provider,
      indexProvider: index.provider,
      missing,
      extra,
      legacyIds,
      indexIds,
      missingInIndex,
      orderOnly,
    });

    rootCauseCounts[rootCause] = (rootCauseCounts[rootCause] || 0) + 1;
    for (const id of [...missing, ...extra]) rootCauseProducts[rootCause]?.add(id);
    rootCauseLatency[rootCause].push(tLegacy + tIndex);

    const entry = {
      query: rawQuery,
      queryType: qtype,
      legacyProvider: legacy.provider,
      indexProvider: index.provider,
      legacyTop20: legacyIds,
      indexTop20: indexIds,
      overlapTop20: topKOverlap(legacyIds, indexIds, 20),
      missing,
      extra,
      moved: movedPositions(legacyIds, indexIds),
      rootCause,
      latencyMs: { legacy: Math.round(tLegacy), index: Math.round(tIndex) },
      category: rawQuery.category || null,
      brand: rawQuery.brand || null,
      model: rawQuery.model || null,
      year: rawQuery.year || null,
    };

    if (mismatches.length < 2000) mismatches.push(entry);

    if (extra.length && !missing.length) {
      if (falsePositives.length < 500) falsePositives.push({ ...entry, reason: "index_extra" });
    } else if (missing.length && !extra.length) {
      if (falseNegatives.length < 500) falseNegatives.push({ ...entry, reason: "index_missing" });
    } else if (missing.length && extra.length) {
      if (falseNegatives.length < 500) falseNegatives.push({ ...entry, reason: "mixed" });
    }

    if ((qi + 1) % PROGRESS_EVERY === 0) {
      console.log(`[mismatch] ${qi + 1}/${queries.length} mismatches=${mismatchCount}`);
    }
  }

  const n = total || 1;
  const pct = (x) => Math.round((x / n) * 100000) / 1000;

  const rootCauseReport = ROOT_CAUSES.map((cause) => ({
    cause,
    count: rootCauseCounts[cause] || 0,
    percentage: mismatchCount ? Math.round(((rootCauseCounts[cause] || 0) / mismatchCount) * 1000) / 10 : 0,
    productsAffected: rootCauseProducts[cause]?.size || 0,
    avgLatencyMs: rootCauseLatency[cause]?.length
      ? Math.round(rootCauseLatency[cause].reduce((a, b) => a + b, 0) / rootCauseLatency[cause].length)
      : 0,
  })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

  const topOffenders = [...mismatches]
    .sort((a, b) => a.overlapTop20 - b.overlapTop20 || b.missing.length - a.missing.length)
    .slice(0, 100);

  const currentParity = {
    top1: pct(metrics.top1),
    top3: pct(metrics.top3),
    top5: pct(metrics.top5),
    top10: pct(metrics.top10),
    top20: pct(metrics.top20),
    ndcg10: Math.round((metrics.ndcg10 / n) * 10000) / 10000,
    mrr: Math.round((metrics.mrr / n) * 10000) / 10000,
    exactOrder10: pct(metrics.exactOrder10),
  };

  function projectedParity(excludeCauses) {
    const excluded = new Set(excludeCauses);
    const remaining = mismatchCount - excludeCauses.reduce((s, c) => s + (rootCauseCounts[c] || 0), 0);
    const fixed = mismatchCount - remaining;
    return {
      excludeCauses,
      mismatchesRemoved: fixed,
      estimatedTop20Parity: Math.round(((identicalCount + orderOnlyCount + fixed * 0.85) / n) * 100000) / 1000,
    };
  }

  const readiness = {
    currentTop20Parity: currentParity.top20,
    identicalQueries: identicalCount,
    orderOnlyQueries: orderOnlyCount,
    mismatchQueries: mismatchCount,
    ifCategoryFixed: projectedParity(["CATEGORY_MISMATCH"]),
    ifSynonymFixed: projectedParity(["SYNONYM", "FULLTEXT_TOKENIZATION"]),
    ifDocumentFixed: projectedParity(["MISSING_DOCUMENT", "DOCUMENT_HASH_OUTDATED"]),
    ifRankingOnly: projectedParity(["RANKING_ONLY", "POPULARITY", "SEARCH_PRIORITY"]),
    ifLikeFixed: projectedParity(["LIKE_FALLBACK"]),
    productionBlockers: [
      rootCauseCounts.LIKE_FALLBACK > mismatchCount * 0.15 ? "LIKE_FALLBACK on broad/unscoped queries" : null,
      rootCauseCounts.MISSING_DOCUMENT > 0 ? "MISSING_DOCUMENT in index" : null,
      health.missingPublicProducts > 0 ? `${health.missingPublicProducts} public products without index rows` : null,
      currentParity.top20 < 95 ? `Top-20 parity ${currentParity.top20}% below 95% gate` : null,
    ].filter(Boolean),
    readinessScore: Math.round(Math.min(100, currentParity.top20 * 0.6 + (100 - (mismatchCount / n) * 100) * 0.4)),
  };

  const sorted = (arr) => [...arr].sort((a, b) => a - b);
  const latSummary = (arr) => {
    const s = sorted(arr);
    const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * (s.length - 1)))];
    return {
      n: s.length,
      avg: Math.round((s.reduce((a, b) => a + b, 0) / (s.length || 1)) * 100) / 100,
      p50: Math.round(at(50) * 100) / 100,
      p95: Math.round(at(95) * 100) / 100,
      p99: Math.round(at(99) * 100) / 100,
      max: Math.round((s[s.length - 1] || 0) * 100) / 100,
    };
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    corpusPath: CORPUS_PATH,
    queryCount: queries.length,
    documentHealth: health,
    parity: currentParity,
    mismatchStats: {
      totalQueries: total,
      identical: identicalCount,
      orderOnly: orderOnlyCount,
      withMissingOrExtra: mismatchCount - orderOnlyCount,
      totalMismatches: mismatchCount,
    },
    noiseAnalysis: noiseStats,
    latency: { legacy: latSummary(legacyLat), index: latSummary(indexLat) },
    rankingAnalysis: {
      differentProducts: mismatchCount - orderOnlyCount,
      sameProductsDifferentOrder: orderOnlyCount,
    },
  };

  fs.writeFileSync(path.join(OUT, "mismatch-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, "root-causes.json"), JSON.stringify({ rootCauseReport, totalMismatches: mismatchCount }, null, 2));
  fs.writeFileSync(path.join(OUT, "top-offenders.json"), JSON.stringify(topOffenders, null, 2));
  fs.writeFileSync(path.join(OUT, "false-positive.json"), JSON.stringify(falsePositives, null, 2));
  fs.writeFileSync(path.join(OUT, "false-negative.json"), JSON.stringify(falseNegatives, null, 2));
  fs.writeFileSync(path.join(OUT, "readiness.md"), buildReadinessMd(summary, rootCauseReport, readiness, currentParity));

  console.log("\n=== SEARCH-INDEX-MISMATCH-ANALYSIS-01 complete ===");
  console.log("Top causes:", rootCauseReport.slice(0, 5).map((r) => `${r.cause} ${r.percentage}%`).join(", "));
  console.log("Top-20 parity:", currentParity.top20 + "%");
  console.log("Output:", OUT);
  await pool.end();
}

function buildReadinessMd(summary, rootCauseReport, readiness, parity) {
  return `# SEARCH-INDEX-MISMATCH-ANALYSIS-01 — Readiness

Generated: ${summary.generatedAt}

## Current parity (legacy = truth)

| Metric | Value |
|--------|-------|
| Top-1 | ${parity.top1}% |
| Top-10 | ${parity.top10}% |
| Top-20 | ${parity.top20}% |
| NDCG@10 | ${parity.ndcg10} |
| MRR | ${parity.mrr} |
| Exact order @10 | ${parity.exactOrder10}% |

## Mismatch breakdown

- Identical: ${summary.mismatchStats.identical}
- Order only (same IDs): ${summary.mismatchStats.orderOnly}
- Missing/extra IDs: ${summary.mismatchStats.withMissingOrExtra}

## Root causes (ranked)

${rootCauseReport.map((r) => `- **${r.cause}**: ${r.count} (${r.percentage}%), ${r.productsAffected} products, avg ${r.avgLatencyMs}ms`).join("\n")}

## Noise vs scoped

| Segment | Queries | Mismatches |
|---------|---------|------------|
| Broad noise | ${summary.noiseAnalysis.broad.n} | ${summary.noiseAnalysis.broad.mismatch} |
| Scoped | ${summary.noiseAnalysis.scoped.n} | ${summary.noiseAnalysis.scoped.mismatch} |

## Projected parity if root causes resolved

| Scenario | Est. Top-20 |
|----------|-------------|
| Category fixed | ${readiness.ifCategoryFixed.estimatedTop20Parity}% |
| Document fixed | ${readiness.ifDocumentFixed.estimatedTop20Parity}% |
| Ranking only removed | ${readiness.ifRankingOnly.estimatedTop20Parity}% |
| LIKE fallback fixed | ${readiness.ifLikeFixed.estimatedTop20Parity}% |

## Production blockers

${readiness.productionBlockers.map((b) => `- ${b}`).join("\n") || "- None identified"}

## Readiness score: ${readiness.readinessScore}/100

Diagnosis only — no fixes recommended.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
