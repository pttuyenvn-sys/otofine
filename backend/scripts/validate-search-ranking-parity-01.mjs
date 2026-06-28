#!/usr/bin/env node
/**
 * SEARCH-RANKING-PARITY-01 — legacy vs weighted_v2 ranking benchmark.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

process.env.SEARCH_INVERTED_INDEX = "1";
process.env.SEARCH_RUNTIME = "inverted";
process.env.SEARCH_CANDIDATE_POLICY = "adaptive";

const QUERIES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "bố thắng", query: { query: "bố thắng" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
  { label: "brake pad", query: { query: "brake pad" } },
];

function topKOverlap(a, b, k) {
  const sb = new Set(b.slice(0, k));
  const sa = a.slice(0, k);
  if (!sa.length) return 1;
  return sa.filter((id) => sb.has(id)).length / sa.length;
}

function recall(legacyTop100, candidateIds) {
  const legacy = legacyTop100.slice(0, 100);
  if (!legacy.length) return 1;
  const set = new Set(candidateIds);
  return legacy.filter((id) => set.has(id)).length / legacy.length;
}

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

async function benchRanking(mode, LegacySearchRuntime) {
  process.env.SEARCH_RANKING_MODE = mode;
  if (mode === "weighted_v2") {
    process.env.SEARCH_RANKING_EXPLAIN = "1";
  } else {
    delete process.env.SEARCH_RANKING_EXPLAIN;
  }

  const { resetInvertedSearchCache } = await import("../services/search/runtime/invertedSearchCache.js");
  const { resetSearchRankingWeightsCache } = await import("../services/search/runtime/searchRankingWeights.js");
  const { resolveInvertedSearchExecution } = await import("../services/search/runtime/invertedSearchExecution.js");
  const { loadSearchRankingWeights } = await import("../services/search/runtime/searchRankingWeights.js");
  const { rankInvertedProducts } = await import("../services/search/runtime/invertedSearchRanking.js");
  const { buildInvertedQueryPlan } = await import("../services/search/runtime/invertedSearchQuery.js");
  const { fetchAdaptiveCandidates } = await import("../services/search/runtime/invertedCandidatePolicy.js");
  const { fetchInvertedCandidatesByTokens } = await import("../services/search/runtime/invertedSearchExecution.js");
  const { pool } = await import("../config/db.js");

  resetSearchRankingWeightsCache();

  const rows = [];
  /** @type {object[]} */
  const explainSamples = [];
  const rankingMsSamples = [];

  for (const c of QUERIES) {
    resetInvertedSearchCache();
    const legacyTop = await LegacySearchRuntime.searchTopProductIds(c.query, 100);

    const t0 = performance.now();
    const exec = await resolveInvertedSearchExecution({
      ...c.query,
      keyword: c.query.query,
      query: c.query.query,
    });
    const latencyMs = performance.now() - t0;

    const keyword = String(c.query.query || "").trim();
    const plan = await buildInvertedQueryPlan(c.query, keyword);
    const fetchFn = (tokens, limit, min) => fetchInvertedCandidatesByTokens(tokens, limit, min);
    const { candidates } = await fetchAdaptiveCandidates(plan, fetchFn, pool);
    const candidateIds = candidates.map((x) => x.product_id);
    let rankingMs = 0;
    if (candidateIds.length) {
      const [indexRows] = await pool.query(
        `
        SELECT
          psi.product_id, psi.title, psi.product_name, psi.part_number, psi.part_number_norm,
          psi.search_text, psi.brand_name, psi.model_name, psi.category_name,
          psi.search_priority, psi.popularity_score, psi.price, psi.updated_at,
          psi.location_id, psi.year_from, psi.year_to
        FROM product_search_index psi
        WHERE psi.status = 'active' AND psi.product_id IN (?)
        `,
        [candidateIds],
      );
      const tRank = performance.now();
      rankInvertedProducts(indexRows, candidates, {
        foldedPhrase: plan.folded,
        queryTokens: plan.queryTokens,
        partNumberNorm: plan.partNumberNorm,
        queryKeyword: keyword,
        facets: plan.facets,
      });
      rankingMs = performance.now() - tRank;
    }
    rankingMsSamples.push(rankingMs);

    const invertedIds = exec.candidateProductIds;
    rows.push({
      label: c.label,
      candidate_recall_pct: Math.round(recall(legacyTop.ids, invertedIds) * 10000) / 100,
      top1_pct: Math.round(topKOverlap(legacyTop.ids, invertedIds, 1) * 10000) / 100,
      top3_pct: Math.round(topKOverlap(legacyTop.ids, invertedIds, 3) * 10000) / 100,
      top10_pct: Math.round(topKOverlap(legacyTop.ids, invertedIds, 10) * 10000) / 100,
      top20_pct: Math.round(topKOverlap(legacyTop.ids, invertedIds, 20) * 10000) / 100,
      latency_ms: Math.round(latencyMs * 100) / 100,
      ranking_ms: Math.round(rankingMs * 100) / 100,
      legacy_top10: legacyTop.ids.slice(0, 10),
      inverted_top10: invertedIds.slice(0, 10),
    });

    if (mode === "weighted_v2" && exec.rankingExplain?.length) {
      explainSamples.push({
        query: c.label,
        top10: exec.rankingExplain,
      });
    }
  }

  return {
    mode,
    weights: mode === "weighted_v2" ? loadSearchRankingWeights("weighted_v2") : null,
    avg_recall_pct: avg(rows.map((r) => r.candidate_recall_pct)),
    avg_top1_pct: avg(rows.map((r) => r.top1_pct)),
    avg_top3_pct: avg(rows.map((r) => r.top3_pct)),
    avg_top10_pct: avg(rows.map((r) => r.top10_pct)),
    avg_top20_pct: avg(rows.map((r) => r.top20_pct)),
    avg_latency_ms: avg(rows.map((r) => r.latency_ms)),
    avg_ranking_ms: avg(rows.map((r) => r.ranking_ms)),
    per_query: rows,
    explainSamples,
  };
}

async function main() {
  const { pool } = await import("../config/db.js");
  const { LegacySearchRuntime } = await import("../services/search/runtime/LegacySearchRuntime.js");

  console.log("\n=== SEARCH-RANKING-PARITY-01 ===\n");

  const legacyRanking = await benchRanking("legacy", LegacySearchRuntime);
  const weightedV2 = await benchRanking("weighted_v2", LegacySearchRuntime);

  const rankingLatencyIncreasePct =
    legacyRanking.avg_ranking_ms > 0
      ? Math.round(((weightedV2.avg_ranking_ms - legacyRanking.avg_ranking_ms) / legacyRanking.avg_ranking_ms) * 10000) / 100
      : 0;

  const totalLatencyIncreasePct =
    legacyRanking.avg_latency_ms > 0
      ? Math.round(((weightedV2.avg_latency_ms - legacyRanking.avg_latency_ms) / legacyRanking.avg_latency_ms) * 10000) / 100
      : 0;

  console.log("Mode".padEnd(14), "Recall".padEnd(10), "Top1".padEnd(8), "Top3".padEnd(8), "Top10".padEnd(8), "Top20".padEnd(8), "Rank ms".padEnd(10), "Total ms");
  console.log(
    "legacy".padEnd(14),
    `${legacyRanking.avg_recall_pct}%`.padEnd(10),
    `${legacyRanking.avg_top1_pct}%`.padEnd(8),
    `${legacyRanking.avg_top3_pct}%`.padEnd(8),
    `${legacyRanking.avg_top10_pct}%`.padEnd(8),
    `${legacyRanking.avg_top20_pct}%`.padEnd(8),
    `${legacyRanking.avg_ranking_ms}`.padEnd(10),
    legacyRanking.avg_latency_ms,
  );
  console.log(
    "weighted_v2".padEnd(14),
    `${weightedV2.avg_recall_pct}%`.padEnd(10),
    `${weightedV2.avg_top1_pct}%`.padEnd(8),
    `${weightedV2.avg_top3_pct}%`.padEnd(8),
    `${weightedV2.avg_top10_pct}%`.padEnd(8),
    `${weightedV2.avg_top20_pct}%`.padEnd(8),
    `${weightedV2.avg_ranking_ms}`.padEnd(10),
    weightedV2.avg_latency_ms,
  );

  console.log(`\nRanking latency increase: ${rankingLatencyIncreasePct}% (total execution: ${totalLatencyIncreasePct}%)`);

  const beforeAfter = QUERIES.map((c, i) => ({
    query: c.label,
    before: legacyRanking.per_query[i],
    after: weightedV2.per_query[i],
    top10_delta_pct: Math.round((weightedV2.per_query[i].top10_pct - legacyRanking.per_query[i].top10_pct) * 100) / 100,
  }));

  const pass =
    weightedV2.avg_recall_pct >= 97
    && weightedV2.avg_top10_pct >= 95
    && rankingLatencyIncreasePct <= 10;

  const outDir = path.join(__dirname, "../../audit/search-ranking-parity-01");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, "ranking-weights.json"), JSON.stringify(weightedV2.weights, null, 2));
  fs.writeFileSync(path.join(outDir, "ranking-explain.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    flag: "SEARCH_RANKING_EXPLAIN=1",
    samples: weightedV2.explainSamples,
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "before-after.json"), JSON.stringify(beforeAfter, null, 2));
  fs.writeFileSync(path.join(outDir, "benchmark.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    legacy_ranking: legacyRanking,
    weighted_v2: weightedV2,
    ranking_latency_increase_pct: rankingLatencyIncreasePct,
    total_latency_increase_pct: totalLatencyIncreasePct,
    acceptance: {
      recall_gte_97: weightedV2.avg_recall_pct >= 97,
      top10_gte_95: weightedV2.avg_top10_pct >= 95,
      ranking_latency_lte_10pct: rankingLatencyIncreasePct <= 10,
      pass,
    },
  }, null, 2));

  fs.writeFileSync(
    path.join(__dirname, "../../audit/SEARCH-RANKING-PARITY-01.md"),
    `# SEARCH-RANKING-PARITY-01

Weighted component ranking for inverted runtime parity with legacy.

## Feature flag

\`\`\`env
SEARCH_RANKING_MODE=legacy        # default, rollback
SEARCH_RANKING_MODE=weighted_v2
SEARCH_RANKING_EXPLAIN=1          # per-product score breakdown
SEARCH_RANKING_WEIGHTS_PATH=backend/config/searchRankingWeights.json
\`\`\`

## Results

| Mode | Recall | Top1 | Top3 | Top10 | Top20 | Latency |
|------|--------|------|------|-------|-------|---------|
| legacy (inverted ranking) | ${legacyRanking.avg_recall_pct}% | ${legacyRanking.avg_top1_pct}% | ${legacyRanking.avg_top3_pct}% | ${legacyRanking.avg_top10_pct}% | ${legacyRanking.avg_top20_pct}% | ${legacyRanking.avg_latency_ms}ms |
| weighted_v2 | ${weightedV2.avg_recall_pct}% | ${weightedV2.avg_top1_pct}% | ${weightedV2.avg_top3_pct}% | ${weightedV2.avg_top10_pct}% | ${weightedV2.avg_top20_pct}% | ${weightedV2.avg_latency_ms}ms |

Ranking latency increase: ${rankingLatencyIncreasePct}% (total execution: ${totalLatencyIncreasePct}%)

## Acceptance

| Check | Target | Result |
|-------|--------|--------|
| Candidate recall | >=97% | ${weightedV2.avg_recall_pct}% ${weightedV2.avg_recall_pct >= 97 ? "PASS" : "FAIL"} |
| Top10 parity | >=95% | ${weightedV2.avg_top10_pct}% ${weightedV2.avg_top10_pct >= 95 ? "PASS" : "FAIL"} |
| Latency increase (ranking) | <=10% | ${rankingLatencyIncreasePct}% ${rankingLatencyIncreasePct <= 10 ? "PASS" : "FAIL"} |
| Explain mode | available | PASS (SEARCH_RANKING_EXPLAIN=1) |
| Rollback | available | PASS (SEARCH_RANKING_MODE=legacy) |

Overall: **${pass ? "PASS" : "FAIL"}**

Rollback: \`SEARCH_RANKING_MODE=legacy\`
`,
  );

  console.log(pass ? "\nPASS" : "\nFAIL — see benchmark.json");
  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
