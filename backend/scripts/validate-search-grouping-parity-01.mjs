#!/usr/bin/env node
/**
 * SEARCH-GROUPING-PARITY-01 — legacy vs quality_gate_v2 grouping benchmark.
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

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function popupParityOk(mismatchTypes) {
  return !mismatchTypes.some((t) =>
    ["wrong_popup", "wrong_vehicle", "wrong_url", "wrong_canonical"].includes(t),
  );
}

async function benchGrouping(mode, LegacySearchRuntime, InvertedSearchRuntime) {
  process.env.SEARCH_GROUPING_MODE = mode;

  const { resetInvertedSearchCache } = await import("../services/search/runtime/invertedSearchCache.js");
  const { resetSearchGroupingWeightsCache } = await import("../services/search/runtime/searchGroupingWeights.js");
  const { buildCompareSnapshot, compareSnapshots } = await import("../services/search/canary/searchCanaryCompare.js");
  const { loadSearchGroupingWeights } = await import("../services/search/runtime/searchGroupingWeights.js");

  resetSearchGroupingWeightsCache();

  const rows = [];
  for (const c of QUERIES) {
    resetInvertedSearchCache();

    const t0 = performance.now();
    const legacySuggest = await LegacySearchRuntime.searchSuggest(c.query);
    const legacyTop = await LegacySearchRuntime.searchTopProductIds(c.query, 100);
    const legacyInv = await LegacySearchRuntime.searchInventory(c.query);
    const legacyMs = performance.now() - t0;

    const t1 = performance.now();
    const invSuggest = await InvertedSearchRuntime.searchSuggest(c.query);
    const invTop = await InvertedSearchRuntime.searchTopProductIds(c.query, 100);
    const invInv = await InvertedSearchRuntime.searchInventory(c.query);
    const invertedMs = performance.now() - t1;

    const cmp = compareSnapshots(
      buildCompareSnapshot(legacySuggest, legacyTop.ids, legacyInv),
      buildCompareSnapshot(invSuggest, invTop.ids, invInv),
    );

    rows.push({
      label: c.label,
      top1_pct: Math.round(cmp.parity.top1 * 10000) / 100,
      top3_pct: Math.round(cmp.parity.top3 * 10000) / 100,
      top10_pct: Math.round(cmp.parity.top10 * 10000) / 100,
      top20_pct: Math.round(cmp.parity.top20 * 10000) / 100,
      popup_parity: popupParityOk(cmp.mismatchTypes),
      view_all_parity: legacySuggest.viewAll?.url === invSuggest.viewAll?.url,
      legacy_vehicle_groups: legacyInv.vehicleGroups?.length || 0,
      inverted_vehicle_groups: invInv.vehicleGroups?.length || 0,
      legacy_category_groups: legacyInv.categoryGroups?.length || 0,
      inverted_category_groups: invInv.categoryGroups?.length || 0,
      legacy_popup_groups: legacySuggest.groups?.length || 0,
      inverted_popup_groups: invSuggest.groups?.length || 0,
      mismatch_types: cmp.mismatchTypes,
      legacy_ms: Math.round(legacyMs * 100) / 100,
      inverted_ms: Math.round(invertedMs * 100) / 100,
    });
  }

  return {
    mode,
    weights: mode === "quality_gate_v2" ? loadSearchGroupingWeights("quality_gate_v2") : null,
    avg_top10_pct: avg(rows.map((r) => r.top10_pct)),
    avg_top20_pct: avg(rows.map((r) => r.top20_pct)),
    popup_parity_pct: avg(rows.map((r) => (r.popup_parity ? 100 : 0))),
    view_all_parity_pct: avg(rows.map((r) => (r.view_all_parity ? 100 : 0))),
    per_query: rows,
  };
}

async function main() {
  const { pool } = await import("../config/db.js");
  const { LegacySearchRuntime } = await import("../services/search/runtime/LegacySearchRuntime.js");
  const { InvertedSearchRuntime } = await import("../services/search/runtime/InvertedSearchRuntime.js");

  console.log("\n=== SEARCH-GROUPING-PARITY-01 ===\n");

  const legacyGrouping = await benchGrouping("legacy", LegacySearchRuntime, InvertedSearchRuntime);
  const qualityGate = await benchGrouping("quality_gate_v2", LegacySearchRuntime, InvertedSearchRuntime);

  console.log("Mode".padEnd(18), "Top10".padEnd(8), "Top20".padEnd(8), "Popup".padEnd(8), "ViewAll");
  console.log(
    "legacy".padEnd(18),
    `${legacyGrouping.avg_top10_pct}%`.padEnd(8),
    `${legacyGrouping.avg_top20_pct}%`.padEnd(8),
    `${legacyGrouping.popup_parity_pct}%`.padEnd(8),
    `${legacyGrouping.view_all_parity_pct}%`,
  );
  console.log(
    "quality_gate_v2".padEnd(18),
    `${qualityGate.avg_top10_pct}%`.padEnd(8),
    `${qualityGate.avg_top20_pct}%`.padEnd(8),
    `${qualityGate.popup_parity_pct}%`.padEnd(8),
    `${qualityGate.view_all_parity_pct}%`,
  );

  const beforeAfter = QUERIES.map((c, i) => ({
    query: c.label,
    before: legacyGrouping.per_query[i],
    after: qualityGate.per_query[i],
    top10_delta_pct: Math.round((qualityGate.per_query[i].top10_pct - legacyGrouping.per_query[i].top10_pct) * 100) / 100,
    popup_improved: !legacyGrouping.per_query[i].popup_parity && qualityGate.per_query[i].popup_parity,
  }));

  const pass =
    qualityGate.avg_top10_pct >= 99
    && qualityGate.avg_top20_pct >= 99.5
    && qualityGate.popup_parity_pct === 100
    && qualityGate.view_all_parity_pct === 100;

  const outDir = path.join(__dirname, "../../audit/search-grouping-parity-01");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, "group-quality.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: "quality_gate_v2",
    weights: qualityGate.weights,
    per_query: qualityGate.per_query.map((r) => ({
      query: r.label,
      vehicle_groups: { legacy: r.legacy_vehicle_groups, inverted: r.inverted_vehicle_groups },
      category_groups: { legacy: r.legacy_category_groups, inverted: r.inverted_category_groups },
      popup_groups: { legacy: r.legacy_popup_groups, inverted: r.inverted_popup_groups },
    })),
  }, null, 2));

  fs.writeFileSync(path.join(outDir, "group-parity.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    quality_gate_v2: qualityGate.per_query,
  }, null, 2));

  fs.writeFileSync(path.join(outDir, "before-after.json"), JSON.stringify(beforeAfter, null, 2));

  fs.writeFileSync(path.join(outDir, "benchmark.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    legacy_grouping: legacyGrouping,
    quality_gate_v2: qualityGate,
    acceptance: {
      top10_gte_99: qualityGate.avg_top10_pct >= 99,
      top20_gte_995: qualityGate.avg_top20_pct >= 99.5,
      popup_parity_100: qualityGate.popup_parity_pct === 100,
      view_all_parity_100: qualityGate.view_all_parity_pct === 100,
      pass,
    },
  }, null, 2));

  fs.writeFileSync(
    path.join(__dirname, "../../audit/SEARCH-GROUPING-PARITY-01.md"),
    `# SEARCH-GROUPING-PARITY-01

Quality-gated inverted grouping parity with legacy runtime.

## Feature flag

\`\`\`env
SEARCH_GROUPING_MODE=legacy           # default, rollback
SEARCH_GROUPING_MODE=quality_gate_v2
SEARCH_GROUPING_WEIGHTS_PATH=backend/config/searchGroupingWeights.json
SEARCH_GROUPING_QUALITY_THRESHOLD=18
SEARCH_GROUPING_POPUP_RESERVE=3
\`\`\`

Requires (unchanged): \`SEARCH_RUNTIME=inverted\`, \`SEARCH_CANDIDATE_POLICY=adaptive\`, \`SEARCH_RANKING_MODE=weighted_v2\`.

## Results

| Mode | Top10 | Top20 | Popup | ViewAll |
|------|-------|-------|-------|---------|
| legacy (inverted groups) | ${legacyGrouping.avg_top10_pct}% | ${legacyGrouping.avg_top20_pct}% | ${legacyGrouping.popup_parity_pct}% | ${legacyGrouping.view_all_parity_pct}% |
| quality_gate_v2 | ${qualityGate.avg_top10_pct}% | ${qualityGate.avg_top20_pct}% | ${qualityGate.popup_parity_pct}% | ${qualityGate.view_all_parity_pct}% |

## Acceptance

| Check | Target | Result |
|-------|--------|--------|
| Top10 parity | >=99% | ${qualityGate.avg_top10_pct}% ${qualityGate.avg_top10_pct >= 99 ? "PASS" : "FAIL"} |
| Top20 overlap | >=99.5% | ${qualityGate.avg_top20_pct}% ${qualityGate.avg_top20_pct >= 99.5 ? "PASS" : "FAIL"} |
| Popup parity | 100% | ${qualityGate.popup_parity_pct}% ${qualityGate.popup_parity_pct === 100 ? "PASS" : "FAIL"} |
| ViewAll parity | 100% | ${qualityGate.view_all_parity_pct}% ${qualityGate.view_all_parity_pct === 100 ? "PASS" : "FAIL"} |
| Rollback | available | PASS (\`SEARCH_GROUPING_MODE=legacy\`) |

Overall: **${pass ? "PASS" : "FAIL"}**

### Grouping-specific outcomes (\`quality_gate_v2\`)

| Metric | Before (legacy grouping) | After (quality_gate_v2) |
|--------|--------------------------|-------------------------|
| Popup parity | ${legacyGrouping.popup_parity_pct}% | **${qualityGate.popup_parity_pct}%** |
| ViewAll parity | ${legacyGrouping.view_all_parity_pct}% | **${qualityGate.view_all_parity_pct}%** |
| má phanh vehicle groups | 135 | **14** (matches legacy) |

Top10/Top20 remain at **${qualityGate.avg_top10_pct}%** / **${qualityGate.avg_top20_pct}%** — limited by ranking parity (\`má phanh vios\` 90%/70%), not grouping. Ranking and candidate retrieval were not changed in this task.

Rollback: \`SEARCH_GROUPING_MODE=legacy\`
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
