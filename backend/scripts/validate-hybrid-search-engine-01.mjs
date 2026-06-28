#!/usr/bin/env node
/**
 * HYBRID-SEARCH-ENGINE-IMPLEMENT-01 — parity validation legacy vs hybrid.
 * HYBRID-SEARCH-QUALITY-GATE-01 — popup groups/products + viewAll only (sidebar categories may differ).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../backend/package.json"));
require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), quiet: true });

const CASES = [
  { label: "bugi toyota", query: { query: "bugi", brand: "Toyota" } },
  { label: "bugi camry", query: { query: "bugi camry", brand: "Toyota", model: "Camry" } },
  { label: "má phanh vios", query: { query: "má phanh", brand: "Toyota", model: "Vios" } },
  { label: "lọc dầu mazda", query: { query: "lọc dầu", brand: "Mazda" } },
  { label: "đèn hậu kia", query: { query: "đèn hậu", brand: "Kia" } },
];

function signature(response) {
  const groups = (response.groups || []).map((g) => ({
    title: g.title,
    count: g.count,
    url: g.url,
    products: (g.products || []).map((p) => p.id),
  }));
  return JSON.stringify({ groups, viewAll: response.viewAll });
}

async function fetchMode(mode, query) {
  process.env.SEARCH_ENGINE_MODE = mode;
  process.env.SEARCH_DECISION_MODE = "quality_gate";
  const { resetFulltextDetection } = await import(
    "../services/search/providers/fullTextSearchProvider.js"
  );
  const { resetSearchDecisionCache } = await import(
    "../services/search/providers/searchProviderChain.js"
  );
  resetFulltextDetection();
  resetSearchDecisionCache();
  const { buildSearchSuggestResponse } = await import(
    "../services/searchSuggest.service.js"
  );
  return buildSearchSuggestResponse(query);
}

let failed = 0;

for (const c of CASES) {
  const legacy = await fetchMode("legacy", c.query);
  const hybrid = await fetchMode("hybrid", c.query);
  const legacySig = signature(legacy);
  const hybridSig = signature(hybrid);

  if (legacySig !== hybridSig) {
    failed += 1;
    console.error(`FAIL parity: ${c.label}`);
    console.error("legacy groups", legacy.groups?.length, "hybrid", hybrid.groups?.length);
  } else {
    console.log(`PASS parity: ${c.label}`);
  }
}

if (failed) {
  console.error(`\n${failed} case(s) differ — hybrid may use structured/fulltext paths with intentional facet routing.`);
  console.error("Review group counts and product IDs manually; LIKE fallback preserves coverage for weak FULLTEXT matches.");
  process.exit(1);
}

console.log("\nAll representative queries: legacy ≡ hybrid signatures");
process.exit(0);
