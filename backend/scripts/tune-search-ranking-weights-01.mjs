#!/usr/bin/env node
/**
 * SEARCH-RANKING-PARITY-01 — grid search over ranking weights vs legacy Top10.
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
process.env.SEARCH_RANKING_MODE = "weighted_v2";

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

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10000) / 100;
}

function cartesian(grid) {
  const keys = Object.keys(grid);
  /** @type {Record<string, number>[]} */
  const out = [{}];
  for (const key of keys) {
    const next = [];
    for (const base of out) {
      for (const val of grid[key]) {
        next.push({ ...base, [key]: val });
      }
    }
    out.length = 0;
    out.push(...next);
  }
  return out;
}

async function evaluateWeights(weights, LegacySearchRuntime, resolveInvertedSearchExecution, resetInvertedSearchCache) {
  const { resetSearchRankingWeightsCache } = await import("../services/search/runtime/searchRankingWeights.js");
  const { rankInvertedProducts } = await import("../services/search/runtime/invertedSearchRanking.js");
  const { buildInvertedQueryPlan } = await import("../services/search/runtime/invertedSearchQuery.js");
  const { pool } = await import("../config/db.js");
  const { fetchAdaptiveCandidates, fetchStrictCandidates } = await import("../services/search/runtime/invertedCandidatePolicy.js");
  const { fetchInvertedCandidatesByTokens } = await import("../services/search/runtime/invertedSearchExecution.js");

  resetSearchRankingWeightsCache();

  const perQuery = [];
  for (const c of QUERIES) {
    resetInvertedSearchCache();
    const legacyTop = await LegacySearchRuntime.searchTopProductIds(c.query, 100);
    const exec = await resolveInvertedSearchExecution({ ...c.query, keyword: c.query.query, query: c.query.query });

    const keyword = String(c.query.query || "").trim();
    const plan = await buildInvertedQueryPlan(c.query, keyword);
    const fetchFn = (tokens, limit, min) => fetchInvertedCandidatesByTokens(tokens, limit, min);
    const { candidates } = await fetchAdaptiveCandidates(plan, fetchFn, pool);
    const candidateIds = candidates.map((x) => x.product_id);
    if (!candidateIds.length) {
      perQuery.push({ label: c.label, top1: 1, top3: 1, top10: 1, top20: 1 });
      continue;
    }

    const [indexRows] = await pool.query(
      `
      SELECT
        psi.product_id, psi.title, psi.product_name, psi.part_number, psi.part_number_norm,
        psi.search_text, psi.brand_name, psi.model_name, psi.category_name,
        psi.search_priority, psi.popularity_score, psi.price, psi.updated_at,
        psi.year_from, psi.year_to
      FROM product_search_index psi
      WHERE psi.status = 'active' AND psi.product_id IN (?)
      `,
      [candidateIds],
    );

    const ranked = rankInvertedProducts(indexRows, candidates, {
      foldedPhrase: plan.folded,
      queryTokens: plan.queryTokens,
      partNumberNorm: plan.partNumberNorm,
      queryKeyword: keyword,
      facets: plan.facets,
    }, weights);

    const ids = ranked.map((r) => r.product_id);
    perQuery.push({
      label: c.label,
      top1: topKOverlap(legacyTop.ids, ids, 1),
      top3: topKOverlap(legacyTop.ids, ids, 3),
      top10: topKOverlap(legacyTop.ids, ids, 10),
      top20: topKOverlap(legacyTop.ids, ids, 20),
    });
  }

  return {
    weights,
    avg_top1: avg(perQuery.map((r) => r.top1 * 100)),
    avg_top3: avg(perQuery.map((r) => r.top3 * 100)),
    avg_top10: avg(perQuery.map((r) => r.top10 * 100)),
    avg_top20: avg(perQuery.map((r) => r.top20 * 100)),
    per_query: perQuery,
  };
}

async function main() {
  const { LegacySearchRuntime } = await import("../services/search/runtime/LegacySearchRuntime.js");
  const { resolveInvertedSearchExecution } = await import("../services/search/runtime/invertedSearchExecution.js");
  const { resetInvertedSearchCache } = await import("../services/search/runtime/invertedSearchCache.js");
  const { loadSearchRankingWeights, saveSearchRankingWeights } = await import("../services/search/runtime/searchRankingWeights.js");
  const { pool } = await import("../config/db.js");

  const base = loadSearchRankingWeights("weighted_v2");

  const grid = {
    legacy_tier_base: [8000, 10000, 12000],
    category_exact: [300, 400, 500],
    retrieval_factor: [0, 0.01, 0.05],
    matched_tokens_factor: [0, 1, 2],
  };

  const combos = cartesian(grid).map((partial) => ({ ...base, ...partial }));
  console.log(`\n=== SEARCH-RANKING-PARITY-01 grid search (${combos.length} combos) ===\n`);

  const t0 = performance.now();
  /** @type {Awaited<ReturnType<typeof evaluateWeights>>[]} */
  const results = [];
  for (let i = 0; i < combos.length; i += 1) {
    const r = await evaluateWeights(combos[i], LegacySearchRuntime, resolveInvertedSearchExecution, resetInvertedSearchCache);
    results.push(r);
    if ((i + 1) % 9 === 0) {
      console.log(`  ${i + 1}/${combos.length} ... best top10 so far: ${Math.max(...results.map((x) => x.avg_top10))}%`);
    }
  }

  results.sort((a, b) => b.avg_top10 - a.avg_top10 || b.avg_top3 - a.avg_top3 || b.avg_top1 - a.avg_top1);
  const best = results[0];

  console.log("\nTop 5 weight combos (by Top10):");
  for (const r of results.slice(0, 5)) {
    console.log(
      `  top10=${r.avg_top10}% top3=${r.avg_top3}% tier=${r.weights.legacy_tier_base} cat=${r.weights.category_exact} ret=${r.weights.retrieval_factor} tok=${r.weights.matched_tokens_factor}`,
    );
  }

  saveSearchRankingWeights(best.weights, "weighted_v2");
  console.log(`\nSaved best weights to searchRankingWeights.json (top10=${best.avg_top10}%)`);

  const outDir = path.join(__dirname, "../../audit/search-ranking-parity-01");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "grid-search-results.json"),
    JSON.stringify({
      generated_at: new Date().toISOString(),
      elapsed_ms: Math.round(performance.now() - t0),
      best,
      top10: results.slice(0, 20),
    }, null, 2),
  );

  await pool.end();
  process.exit(best.avg_top10 >= 95 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
