/**
 * ARCH-MP-03B.9 — unified Marketplace year SSOT (`year` URL state).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const FRONTEND = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(FRONTEND, "package.json"));

const { buildClientListingDisplayLabel, buildClientListingPath } = await import(
  path.join(FRONTEND, "lib/listing/adapters/clientListingIdentityEgress.ts")
);
const { resolveListingQueryYear } = require(
  path.join(FRONTEND, "components/pages/home/services/listingRequestState.js"),
);
const { classifyListingTier } = require(
  path.join(FRONTEND, "lib/seo/homePageTitle.js"),
);

function ok(msg) {
  console.log("PASS:", msg);
}

function seoLabel({ brand, model, year, location }) {
  return buildClientListingDisplayLabel({ brand, model, year, location });
}

function urlPath({ brand, model, year }) {
  return buildClientListingPath({ brand, model, year });
}

try {
  // Case 1 — BM pick 2025 → unified URL/H1/query
  const case1 = { brand: "Toyota", model: "Vios", year: "2025" };
  assert.strictEqual(urlPath(case1), "/phu-tung-toyota-vios-2025");
  assert.strictEqual(seoLabel(case1), "Phụ tùng Toyota Vios 2025");
  assert.strictEqual(String(resolveListingQueryYear({ year: "2025" })), "2025");
  ok("Case 1 — BM pick 2025 unified");

  // Case 2 — range URL, no pick
  const case2 = { brand: "Toyota", model: "Vios", year: "2014-2020" };
  assert.strictEqual(urlPath(case2), "/phu-tung-toyota-vios-2014-2020");
  assert.strictEqual(seoLabel(case2), "Phụ tùng Toyota Vios 2014-2020");
  assert.strictEqual(String(resolveListingQueryYear({ year: "2014-2020" })), "");
  ok("Case 2 — range URL no pick");

  // Case 3 — range pick collapses to single year
  const case3 = { brand: "Toyota", model: "Vios", year: "2017" };
  assert.strictEqual(urlPath(case3), "/phu-tung-toyota-vios-2017");
  assert.strictEqual(seoLabel(case3), "Phụ tùng Toyota Vios 2017");
  assert.strictEqual(String(resolveListingQueryYear({ year: "2017" })), "2017");
  ok("Case 3 — range pick collapses to single year");

  assert.strictEqual(
    classifyListingTier({ brand: "Toyota", model: "Vios", year: "2014-2020" })
      .label,
    "car_only",
  );
  ok("tier follows URL year");

  console.log("Year identity recovery checks passed.");
} catch (err) {
  console.error("Year identity tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
