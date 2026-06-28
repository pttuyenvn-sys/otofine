#!/usr/bin/env node
/**
 * SEARCH-CANDIDATE-POLICY-PARITY-01 — strict vs adaptive benchmark + recall.
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

async function benchPolicy(policy, pool, LegacySearchRuntime) {
  process.env.SEARCH_CANDIDATE_POLICY = policy;
  const { resetInvertedSearchCache } = await import("../services/search/runtime/invertedSearchCache.js");
  const { resolveInvertedSearchExecution } = await import("../services/search/runtime/invertedSearchExecution.js");
  const { buildInvertedQueryPlan } = await import("../services/search/runtime/invertedSearchQuery.js");
  const { fetchStrictCandidates, fetchAdaptiveCandidates } = await import("../services/search/runtime/invertedCandidatePolicy.js");
  const { fetchInvertedCandidatesByTokens } = await import("../services/search/runtime/invertedSearchExecution.js");

  const fetchFn = (tokens, limit, min) => fetchInvertedCandidatesByTokens(tokens, limit, min);
  const rows = [];
  for (const c of QUERIES) {
    resetInvertedSearchCache();
    const legacyTop = await LegacySearchRuntime.searchTopProductIds(c.query, 100);
    const keyword = String(c.query.query || "").trim();
    const plan = await buildInvertedQueryPlan(c.query, keyword);

    const tCand = performance.now();
    if (policy === "adaptive") {
      await fetchAdaptiveCandidates(plan, fetchFn, pool);
    } else {
      await fetchStrictCandidates(plan, fetchFn);
    }
    const candidateMs = performance.now() - tCand;

    const t0 = performance.now();
    const exec = await resolveInvertedSearchExecution({ ...c.query, keyword, query: keyword });
    const ms = performance.now() - t0;

    const rec = recall(legacyTop.ids, exec.candidateProductIds);
    rows.push({
      label: c.label,
      candidate_count: exec.candidateProductIds.length,
      candidate_recall_pct: Math.round(rec * 10000) / 100,
      top10_overlap_pct: Math.round(topKOverlap(legacyTop.ids, exec.candidateProductIds, 10) * 10000) / 100,
      top20_overlap_pct: Math.round(topKOverlap(legacyTop.ids, exec.candidateProductIds, 20) * 10000) / 100,
      candidate_retrieval_ms: Math.round(candidateMs * 100) / 100,
      latency_ms: Math.round(ms * 100) / 100,
      meta: exec.candidateMeta || null,
    });
  }

  return {
    policy,
    avg_recall_pct: avg(rows.map((r) => r.candidate_recall_pct)),
    avg_top10_pct: avg(rows.map((r) => r.top10_overlap_pct)),
    avg_latency_ms: avg(rows.map((r) => r.latency_ms)),
    avg_candidate_retrieval_ms: avg(rows.map((r) => r.candidate_retrieval_ms)),
    per_query: rows,
  };
}

async function main() {
  const { pool } = await import("../config/db.js");
  const { LegacySearchRuntime } = await import("../services/search/runtime/LegacySearchRuntime.js");

  console.log("\n=== SEARCH-CANDIDATE-POLICY-PARITY-01 ===\n");

  const strict = await benchPolicy("strict", pool, LegacySearchRuntime);
  const adaptive = await benchPolicy("adaptive", pool, LegacySearchRuntime);

  const beforeAfter = QUERIES.map((c, i) => ({
    query: c.label,
    strict: strict.per_query[i],
    adaptive: adaptive.per_query[i],
    recall_delta_pct: Math.round((adaptive.per_query[i].candidate_recall_pct - strict.per_query[i].candidate_recall_pct) * 100) / 100,
    top10_delta_pct: Math.round((adaptive.per_query[i].top10_overlap_pct - strict.per_query[i].top10_overlap_pct) * 100) / 100,
  }));

  console.log("Policy".padEnd(10), "Recall".padEnd(10), "Top10".padEnd(10), "Retrieval ms".padEnd(14), "Total ms");
  console.log("strict".padEnd(10), `${strict.avg_recall_pct}%`.padEnd(10), `${strict.avg_top10_pct}%`.padEnd(10), `${strict.avg_candidate_retrieval_ms}`.padEnd(14), strict.avg_latency_ms);
  console.log("adaptive".padEnd(10), `${adaptive.avg_recall_pct}%`.padEnd(10), `${adaptive.avg_top10_pct}%`.padEnd(10), `${adaptive.avg_candidate_retrieval_ms}`.padEnd(14), adaptive.avg_latency_ms);

  console.log("\nPer query recall:");
  for (const row of beforeAfter) {
    console.log(
      row.query.padEnd(18),
      `strict=${row.strict.candidate_recall_pct}%`.padEnd(14),
      `adaptive=${row.adaptive.candidate_recall_pct}%`.padEnd(16),
      `Δ=${row.recall_delta_pct}%`,
    );
  }

  const latencyIncreasePct =
    strict.avg_candidate_retrieval_ms > 0
      ? Math.round(((adaptive.avg_candidate_retrieval_ms - strict.avg_candidate_retrieval_ms) / strict.avg_candidate_retrieval_ms) * 10000) / 100
      : 0;

  const pass =
    adaptive.avg_recall_pct >= 97
    && latencyIncreasePct <= 10
    && adaptive.avg_top10_pct >= strict.avg_top10_pct;

  const outDir = path.join(__dirname, "../../audit/search-candidate-policy-parity-01");
  fs.mkdirSync(outDir, { recursive: true });

  const benchmark = { strict, adaptive, latency_increase_pct: latencyIncreasePct };
  fs.writeFileSync(path.join(outDir, "benchmark.json"), JSON.stringify(benchmark, null, 2));
  fs.writeFileSync(path.join(outDir, "before-after.json"), JSON.stringify(beforeAfter, null, 2));
  fs.writeFileSync(
    path.join(outDir, "candidate-recall.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        strict_avg_recall_pct: strict.avg_recall_pct,
        adaptive_avg_recall_pct: adaptive.avg_recall_pct,
        per_query: beforeAfter,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(outDir, "candidate-policy.md"),
    `# Candidate Policy

## Flag

\`\`\`env
SEARCH_CANDIDATE_POLICY=strict   # default
SEARCH_CANDIDATE_POLICY=adaptive
SEARCH_CANDIDATE_TARGET=30
\`\`\`

## Results

| Policy | Avg recall | Avg Top10 | Avg latency |
|--------|------------|-----------|-------------|
| strict | ${strict.avg_recall_pct}% | ${strict.avg_top10_pct}% | ${strict.avg_latency_ms}ms |
| adaptive | ${adaptive.avg_recall_pct}% | ${adaptive.avg_top10_pct}% | ${adaptive.avg_latency_ms}ms |

Latency increase: ${latencyIncreasePct}%
`,
  );

  fs.writeFileSync(
    path.join(__dirname, "../../audit/SEARCH-CANDIDATE-POLICY-PARITY-01.md"),
    `# SEARCH-CANDIDATE-POLICY-PARITY-01

Adaptive candidate retrieval for inverted runtime.

## Acceptance

| Check | Target | Result |
|-------|--------|--------|
| Candidate recall | >=97% | ${adaptive.avg_recall_pct}% ${adaptive.avg_recall_pct >= 97 ? "PASS" : "FAIL"} |
| Latency increase | <=10% | ${latencyIncreasePct}% ${latencyIncreasePct <= 10 ? "PASS" : "FAIL"} |
| Top10 improved | vs strict | ${adaptive.avg_top10_pct}% vs ${strict.avg_top10_pct}% |

Rollback: \`SEARCH_CANDIDATE_POLICY=strict\`
`,
  );

  process.env.SEARCH_CANDIDATE_POLICY = "strict";
  console.log(`\nCandidate retrieval latency increase: ${latencyIncreasePct}%`);
  console.log(pass ? "\nPASS" : "\nFAIL — see benchmark.json");
  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
