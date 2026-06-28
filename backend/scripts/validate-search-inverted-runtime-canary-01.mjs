#!/usr/bin/env node
/**
 * SEARCH-INVERTED-RUNTIME-CANARY-01 — validation + benchmark deliverables.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

process.env.SEARCH_INVERTED_INDEX = "1";
process.env.SEARCH_CANARY = "1";
process.env.SEARCH_CANARY_SAMPLE_RATE = "100";
process.env.SEARCH_RUNTIME = "legacy";

const QUERIES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
  { label: "04465-0D140", query: { query: "04465-0D140" } },
  { label: "bố thắng", query: { query: "bố thắng" } },
  { label: "brake pad", query: { query: "brake pad" } },
];

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

async function main() {
  const { ensureSearchTokenIndexSchema } = await import("../services/search/inverted/ensureSearchTokenIndexSchema.js");
  const { pool } = await import("../config/db.js");
  const { runSearchCanaryComparison } = await import("../services/search/canary/searchCanaryService.js");
  const { buildSearchSuggestResponse } = await import("../services/searchSuggest.service.js");
  const { meetsCanaryPassConditions } = await import("../services/search/canary/searchCanaryCompare.js");
  const { isSearchCanaryShadowMode } = await import("../config/searchCanaryConfig.js");
  const { writeCanaryArtifacts } = await import("../services/search/canary/searchCanaryLogger.js");

  await ensureSearchTokenIndexSchema(pool);

  if (!isSearchCanaryShadowMode()) {
    console.error("FAIL — shadow mode requires SEARCH_RUNTIME=legacy + SEARCH_CANARY=1");
    process.exit(1);
  }

  console.log("\n=== SEARCH-INVERTED-RUNTIME-CANARY-01 ===\n");

  const results = [];
  for (const c of QUERIES) {
    const userResponse = await buildSearchSuggestResponse(c.query);
    const row = await runSearchCanaryComparison(c.query);
    results.push({ label: c.label, row, userGroupCount: userResponse.groups?.length || 0 });
    console.log(
      c.label.padEnd(18),
      `top10=${row.top10_overlap}%`.padEnd(14),
      `top20=${row.top20_overlap}%`.padEnd(14),
      `recall=${row.candidate_recall}%`.padEnd(14),
      `legacy=${row.legacy_ms}ms`.padEnd(12),
      `inverted=${row.inverted_ms}ms`,
    );
  }

  const top10 = results.map((r) => Number(r.row.top10_overlap) / 100);
  const top20 = results.map((r) => Number(r.row.top20_overlap) / 100);
  const recalls = results.map((r) => Number(r.row.candidate_recall) / 100);

  const summary = {
    generated_at: new Date().toISOString(),
    queries: QUERIES.length,
    avg_top10_parity_pct: avg(top10.map((v) => v * 100)),
    avg_top20_parity_pct: avg(top20.map((v) => v * 100)),
    avg_recall_pct: avg(recalls.map((v) => v * 100)),
    missing_products: results.filter((r) => (r.row.mismatch_types || []).includes("missing_product")).length,
    wrong_urls: results.filter((r) => (r.row.mismatch_types || []).includes("wrong_url")).length,
    wrong_popup: results.filter((r) => (r.row.mismatch_types || []).includes("wrong_popup")).length,
    shadow_mode: true,
    user_runtime: "legacy",
  };

  const latency = {
    legacy_avg_ms: avg(results.map((r) => r.row.legacy_ms)),
    inverted_avg_ms: avg(results.map((r) => r.row.inverted_ms)),
    inverted_stages_avg: {
      retrieval_ms: avg(results.map((r) => r.row.inverted_latency?.retrieval_ms)),
      ranking_ms: avg(results.map((r) => r.row.inverted_latency?.ranking_ms)),
      grouping_ms: avg(results.map((r) => r.row.inverted_latency?.grouping_ms)),
      popup_ms: avg(results.map((r) => r.row.inverted_latency?.popup_ms)),
    },
    per_query: results.map((r) => ({
      label: r.label,
      legacy_ms: r.row.legacy_ms,
      inverted_ms: r.row.inverted_ms,
      inverted_latency: r.row.inverted_latency,
    })),
  };

  const mismatches = results
    .filter((r) => r.row.mismatch_reason)
    .map((r) => ({
      query: r.label,
      ...r.row,
    }));

  const pass = meetsCanaryPassConditions({
    avgTop10Parity: avg(top10),
    avgTop20Parity: avg(top20),
    avgRecall: avg(recalls),
    missingProducts: summary.missing_products,
    wrongUrls: summary.wrong_urls,
    wrongPopup: summary.wrong_popup,
  });

  const outDir = path.join(__dirname, "../../audit/search-inverted-runtime-canary-01");
  fs.mkdirSync(outDir, { recursive: true });

  writeCanaryArtifacts({
    summary,
    mismatches,
    latency,
    dailyReportMd: `# Canary Validation Report

Generated: ${summary.generated_at}

| Metric | Value |
|--------|-------|
| Avg Top10 parity | ${summary.avg_top10_parity_pct}% |
| Avg Top20 parity | ${summary.avg_top20_parity_pct}% |
| Avg recall | ${summary.avg_recall_pct}% |
| Pass | ${pass ? "YES" : "NO"} |
`,
  });

  fs.writeFileSync(
    path.join(__dirname, "../../audit/SEARCH-INVERTED-RUNTIME-CANARY-01.md"),
    `# SEARCH-INVERTED-RUNTIME-CANARY-01

Shadow canary validated (${summary.generated_at}).

## Pass conditions

| Check | Target | Actual | Status |
|-------|--------|--------|--------|
| Top10 parity | >=99% | ${summary.avg_top10_parity_pct}% | ${summary.avg_top10_parity_pct >= 99 ? "PASS" : "FAIL"} |
| Top20 overlap | >=99.5% | ${summary.avg_top20_parity_pct}% | ${summary.avg_top20_parity_pct >= 99.5 ? "PASS" : "FAIL"} |
| Candidate recall | >=99% | ${summary.avg_recall_pct}% | ${summary.avg_recall_pct >= 99 ? "PASS" : "FAIL"} |
| Missing products | 0 | ${summary.missing_products} | ${summary.missing_products === 0 ? "PASS" : "FAIL"} |
| Wrong URLs | 0 | ${summary.wrong_urls} | ${summary.wrong_urls === 0 ? "PASS" : "FAIL"} |
| Wrong popup | 0 | ${summary.wrong_popup} | ${summary.wrong_popup === 0 ? "PASS" : "FAIL"} |

## Enable

\`\`\`env
SEARCH_CANARY=1
SEARCH_RUNTIME=legacy
SEARCH_CANARY_SAMPLE_RATE=100
\`\`\`

User response: **legacy only** (shadow mode).
`,
  );

  console.log("\nSummary:", summary);
  console.log("\nInfrastructure: PASS — shadow mode, comparison, logging");
  console.log(
    pass
      ? "Parity: PASS — ready for Stage 2 rollout"
      : "Parity: FAIL — below rollout thresholds (expected until inverted tuned)",
  );

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
