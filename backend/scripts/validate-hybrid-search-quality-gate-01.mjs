#!/usr/bin/env node
/**
 * HYBRID-SEARCH-QUALITY-GATE-01 — decision layer validation.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const CASES = [
  {
    label: "bugi toyota",
    query: { query: "bugi", brand: "Toyota" },
    expectLowRisk: true,
    expectFulltext: true,
  },
  {
    label: "bugi",
    query: { query: "bugi" },
    expectHighRisk: true,
  },
  {
    label: "má phanh vios",
    query: { query: "má phanh", brand: "Toyota", model: "Vios" },
    expectLowRisk: true,
    expectFulltext: true,
  },
  {
    label: "lọc dầu mazda",
    query: { query: "lọc dầu", brand: "Mazda" },
    expectLowRisk: true,
  },
  {
    label: "đèn hậu kia",
    query: { query: "đèn hậu", brand: "Kia" },
    expectLowRisk: true,
  },
  {
    label: "04465-0D140",
    query: { query: "04465-0D140" },
    expectPartNumber: true,
  },
];

let failed = 0;

process.env.SEARCH_ENGINE_MODE = "hybrid";
process.env.SEARCH_ENGINE_DEBUG = "0";

const { resetSearchDecisionCache } = await import(
  "../services/search/providers/searchProviderChain.js"
);
const { resetFulltextDetection } = await import(
  "../services/search/providers/fullTextSearchProvider.js"
);
const { assessParserRisk, computeQualityScore } = await import(
  "../services/search/providers/searchQualityGate.js"
);
const { resolveSearchFacets } = await import(
  "../services/search/providers/searchFacetResolver.js"
);
const { buildSearchSuggestResponse } = await import("../services/searchSuggest.service.js");
const { buildSearchInventoryContext } = await import(
  "../services/search/searchInventoryQuery.js"
);
const { getQualityGateThreshold } = await import("../config/searchEngineConfig.js");

const threshold = getQualityGateThreshold();
console.log(`QUALITY_GATE_THRESHOLD=${threshold}\n`);

for (const c of CASES) {
  resetSearchDecisionCache();
  resetFulltextDetection();

  const keyword = String(c.query.query || "");
  const facets = await resolveSearchFacets(c.query, keyword);
  const risk = assessParserRisk(facets, keyword);

  const t0 = performance.now();
  const response = await buildSearchSuggestResponse(c.query);
  const latencyMs = Math.round(performance.now() - t0);

  const ctx = await buildSearchInventoryContext(c.query, keyword);
  const provider = ctx.searchProvider || "unknown";
  const qualityScore = ctx.qualityScore ?? null;
  const parityUsed = ctx.parityUsed ?? null;

  const usesFulltext = provider.includes("fulltext") || provider === "exact";
  const usesLike = provider === "like-fallback";

  console.log(`--- ${c.label} ---`);
  console.log(`  risk: ${risk.level} (${risk.reason})`);
  console.log(`  qualityScore: ${qualityScore ?? "n/a"}`);
  console.log(`  provider: ${provider}`);
  console.log(`  parityUsed: ${parityUsed === null ? "n/a" : parityUsed}`);
  console.log(`  latencyMs: ${latencyMs}`);
  console.log(`  groups: ${response.groups.length}, categories: ${response.categories.length}`);

  if (c.expectLowRisk && risk.level !== "low") {
    console.error(`  FAIL expected low risk`);
    failed += 1;
  }
  if (c.expectHighRisk && risk.level !== "high") {
    console.error(`  FAIL expected high risk`);
    failed += 1;
  }
  if (c.expectFulltext && !usesFulltext) {
    console.error(`  FAIL expected FULLTEXT provider, got ${provider}`);
    failed += 1;
  }
  if (c.expectPartNumber && provider !== "exact" && provider !== "like-fallback") {
    console.error(`  FAIL expected exact or like for part number`);
    failed += 1;
  }
  if (qualityScore != null && qualityScore < threshold && usesFulltext && provider !== "exact") {
    console.error(`  FAIL FULLTEXT used below threshold (${qualityScore} < ${threshold})`);
    failed += 1;
  }
  console.log("");
}

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}

console.log("ALL PASS — HYBRID-SEARCH-QUALITY-GATE-01");
process.exit(0);
