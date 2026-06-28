#!/usr/bin/env node
/**
 * SEARCH-INVERTED-RUNTIME-CANARY-01 — generate daily report from canary metrics.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10000) / 10000;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  const dateArg = process.argv[2];
  const date = dateArg ? new Date(`${dateArg}T12:00:00Z`) : new Date();

  const { readCanaryMetricsForDate, readCanaryMismatchesForDate, writeCanaryArtifacts } =
    await import("../services/search/canary/searchCanaryLogger.js");
  const { meetsCanaryPassConditions } = await import("../services/search/canary/searchCanaryCompare.js");

  const metrics = readCanaryMetricsForDate(date);
  const mismatches = readCanaryMismatchesForDate(date);
  const day = date.toISOString().slice(0, 10);

  const top10 = metrics.map((m) => Number(m.top10_overlap) / 100);
  const top20 = metrics.map((m) => Number(m.top20_overlap) / 100);
  const recalls = metrics.map((m) => Number(m.candidate_recall) / 100);

  const queryCounts = new Map();
  for (const m of metrics) {
    queryCounts.set(m.query, (queryCounts.get(m.query) || 0) + 1);
  }
  const topQueries = [...queryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([query, count]) => ({ query, count }));

  const worstQueries = [...metrics]
    .sort((a, b) => Number(a.top10_overlap) - Number(b.top10_overlap))
    .slice(0, 20)
    .map((m) => ({
      query: m.query,
      top10_overlap: m.top10_overlap,
      top20_overlap: m.top20_overlap,
      candidate_recall: m.candidate_recall,
      mismatch_reason: m.mismatch_reason,
    }));

  const summary = {
    date: day,
    samples: metrics.length,
    avg_top10_parity_pct: Math.round(avg(top10) * 10000) / 100,
    avg_top20_parity_pct: Math.round(avg(top20) * 10000) / 100,
    avg_recall_pct: Math.round(avg(recalls) * 10000) / 100,
    mismatch_count: mismatches.length,
    missing_products: mismatches.filter((m) => (m.mismatch_types || []).includes("missing_product")).length,
    wrong_urls: mismatches.filter((m) => (m.mismatch_types || []).includes("wrong_url")).length,
    wrong_popup: mismatches.filter((m) => (m.mismatch_types || []).includes("wrong_popup")).length,
    top_queries: topQueries,
    worst_queries: worstQueries.slice(0, 10),
  };

  const legacyTotals = metrics.map((m) => Number(m.legacy_ms)).filter(Boolean);
  const invertedTotals = metrics.map((m) => Number(m.inverted_ms)).filter(Boolean);
  const legacySorted = [...legacyTotals].sort((a, b) => a - b);
  const invertedSorted = [...invertedTotals].sort((a, b) => a - b);

  const latency = {
    date: day,
    samples: metrics.length,
    legacy: {
      avg_ms: avg(legacyTotals),
      p50_ms: pct(legacySorted, 50),
      p95_ms: pct(legacySorted, 95),
    },
    inverted: {
      avg_ms: avg(invertedTotals),
      p50_ms: pct(invertedSorted, 50),
      p95_ms: pct(invertedSorted, 95),
    },
    inverted_stages_avg: {
      retrieval_ms: avg(metrics.map((m) => Number(m.inverted_latency?.retrieval_ms)).filter(Boolean)),
      ranking_ms: avg(metrics.map((m) => Number(m.inverted_latency?.ranking_ms)).filter(Boolean)),
      grouping_ms: avg(metrics.map((m) => Number(m.inverted_latency?.grouping_ms)).filter(Boolean)),
      popup_ms: avg(metrics.map((m) => Number(m.inverted_latency?.popup_ms)).filter(Boolean)),
    },
  };

  const pass = meetsCanaryPassConditions({
    avgTop10Parity: avg(top10),
    avgTop20Parity: avg(top20),
    avgRecall: avg(recalls),
    missingProducts: summary.missing_products,
    wrongUrls: summary.wrong_urls,
    wrongPopup: summary.wrong_popup,
  });

  const dailyReportMd = `# Search Canary Daily Report — ${day}

## Summary

| Metric | Value |
|--------|-------|
| Samples | ${summary.samples} |
| Avg Top10 parity | ${summary.avg_top10_parity_pct}% |
| Avg Top20 parity | ${summary.avg_top20_parity_pct}% |
| Avg candidate recall | ${summary.avg_recall_pct}% |
| Mismatches logged | ${summary.mismatch_count} |
| Pass conditions | ${pass ? "PASS" : "FAIL"} |

## Latency

| Runtime | Avg (ms) | P50 | P95 |
|---------|----------|-----|-----|
| Legacy | ${latency.legacy.avg_ms} | ${latency.legacy.p50_ms} | ${latency.legacy.p95_ms} |
| Inverted | ${latency.inverted.avg_ms} | ${latency.inverted.p50_ms} | ${latency.inverted.p95_ms} |

## Top queries

${topQueries.slice(0, 10).map((q) => `- ${q.query} (${q.count})`).join("\n") || "_none_"}

## Worst queries (Top10 parity)

${worstQueries.slice(0, 10).map((q) => `- ${q.query}: top10=${q.top10_overlap}% recall=${q.candidate_recall}%`).join("\n") || "_none_"}
`;

  writeCanaryArtifacts({ summary, mismatches, latency, dailyReportMd });

  const auditMd = `# SEARCH-INVERTED-RUNTIME-CANARY-01

Shadow canary: legacy user response + background inverted evaluation.

## Flags

\`\`\`env
SEARCH_CANARY=0          # default off
SEARCH_CANARY=1          # enable canary
SEARCH_CANARY_SAMPLE_RATE=100|10|5|1
SEARCH_RUNTIME=legacy    # Stage 1 shadow (user gets legacy)
\`\`\`

## Rollout

1. \`SEARCH_CANARY=1\` + \`SEARCH_RUNTIME=legacy\` — shadow mode
2. \`SEARCH_RUNTIME=inverted\` + \`SEARCH_CANARY=1\` — live inverted with monitoring
3. \`SEARCH_CANARY=0\` — production complete

## Rollback

\`\`\`env
SEARCH_RUNTIME=legacy
SEARCH_CANARY=0
\`\`\`

## Latest daily report

Date: ${day}
Samples: ${summary.samples}
Avg Top10 parity: ${summary.avg_top10_parity_pct}%
Pass: ${pass ? "YES" : "NO"}
`;

  fs.mkdirSync(path.join(__dirname, "../../audit/search-inverted-runtime-canary-01"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../../audit/SEARCH-INVERTED-RUNTIME-CANARY-01.md"), auditMd);

  console.log(JSON.stringify({ day, pass, summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
